import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { logger } from "../utils/logger.js";
import { billingService } from "../services/billing/billingService.js";
import { customerReference, getProvider, LocalProvider } from "../services/billing/provider.js";
import { badRequest, notFound } from "../utils/errors.js";

/**
 * The local provider's own server (S12).
 *
 * A payment processor runs its own checkout page and then tells the merchant
 * "this customer paid" by calling the merchant's webhook. This router stands
 * in for that processor, so the merchant side of the product is exercised
 * exactly as it would be with a real processor.
 *
 * It is mounted only when the build talks to the local provider, which cannot
 * take money. Nothing here is reachable in a build with a live provider.
 */
export const localProviderRouter = Router();

/**
 * Whether the local processor may answer at all.
 *
 * The router is only mounted when the build talks to the local provider, but
 * it is also refused here at runtime: a build configured for a real processor,
 * or a production build that has not explicitly opted into local payments,
 * answers 404 to every route, so a mounting mistake can never hand out free
 * credits.
 */
export function localProviderAllowed(): boolean {
  if (env.PAYMENT_PROVIDER !== "local") return false;
  const provider = getProvider();
  if (provider.name !== "local" || provider.live) return false;
  if (env.NODE_ENV === "production" && !(env as { ALLOW_LOCAL_PAYMENTS?: boolean }).ALLOW_LOCAL_PAYMENTS) return false;
  return true;
}

localProviderRouter.use((_req: Request, _res: Response, next: NextFunction) => {
  if (!localProviderAllowed()) return next(notFound("Page"));
  next();
});

/** A period as the local processor bills it. */
function periodEndFor(planId: string, from = Date.now()): Date {
  const days = planId.endsWith("-yearly") ? 365 : 30;
  return new Date(from + days * 24 * 60 * 60 * 1000);
}

/** The subscription id the local processor gives a checkout. */
function localSubscriptionId(session: string): string {
  return `local_sub_${createHash("sha256").update(session).digest("hex").slice(0, 24)}`;
}

/**
 * The processor's checkout page.
 *
 * It shows the customer what they are paying for and, when they pay, sends a
 * signed `payment.succeeded` event to the merchant's webhook. The customer
 * cannot name an amount or a customer: both come from the checkout the
 * merchant created.
 */
localProviderRouter.get("/pay/:session", async (req: Request, res: Response) => {
  const provider = getProvider();
  if (provider.live) throw notFound("Page");
  const session = String(req.params.session);
  const payment = await prisma.payment.findFirst({ where: { providerCheckoutId: session } });
  if (!payment) throw notFound("Checkout");
  res.json({
    session,
    providerPaymentId: payment.providerPaymentId,
    planName: payment.planId ? (await prisma.plan.findUnique({ where: { id: payment.planId } }))?.name ?? "Plan" : "Plan",
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    credits: payment.credits,
  });
});

/**
 * The customer pays.
 *
 * The processor decides that the money moved, and tells the merchant. The
 * merchant grants the credits because it verified the signature — not because
 * the browser asked.
 */
localProviderRouter.post("/pay/:session", async (req: Request, res: Response) => {
  const provider = getProvider();
  if (provider.live) throw notFound("Page");
  const session = String(req.params.session);
  const payment = await prisma.payment.findFirst({ where: { providerCheckoutId: session } });
  if (!payment) throw notFound("Checkout");
  if (payment.status !== "pending") {
    // The processor has already settled this checkout.
    return res.json({ status: payment.status, alreadySettled: true });
  }
  const plan = payment.planId ? await prisma.plan.findUnique({ where: { id: payment.planId } }) : null;

  // A recurring plan is paid the way a real processor bills a subscription:
  // the subscription's first invoice is paid, and that invoice carries the
  // subscription and its period. A one-time plan is a single payment.
  const { body, signature, timestamp } = LocalProvider.buildEvent(
    plan?.recurring
      ? {
          providerEventId: `local_evt_${payment.providerPaymentId}`,
          type: "invoice.paid",
          occurredAt: new Date(),
          customerReference: payment.providerCustomerReference,
          providerPaymentId: payment.providerPaymentId,
          providerCheckoutId: payment.providerCheckoutId,
          providerSubscriptionId: localSubscriptionId(session),
          providerInvoiceId: `local_in_${payment.providerPaymentId}`,
          billingReason: "subscription_create",
          planId: plan.id,
          amountMinor: payment.amountMinor,
          currency: payment.currency as "USD" | "EUR" | "GBP",
          credits: payment.credits,
          currentPeriodEnd: periodEndFor(plan.id),
        }
      : {
          providerEventId: `local_evt_${payment.providerPaymentId}`,
          type: "payment.succeeded",
          occurredAt: new Date(),
          customerReference: payment.providerCustomerReference,
          providerPaymentId: payment.providerPaymentId,
          planId: payment.planId ?? undefined,
          amountMinor: payment.amountMinor,
          currency: payment.currency as "USD" | "EUR" | "GBP",
          credits: payment.credits,
        },
  );

  // The processor tells the merchant "this customer paid". The event is signed
  // and delivered through the merchant's webhook handler, which verifies the
  // signature before it grants anything — the same path a real processor's
  // callback takes.
  const outcome = await billingService.handleWebhook(body, signature, timestamp);
  logger.info({ providerEventId: `local_evt_${payment.providerPaymentId}` }, "The local provider settled a checkout");
  res.json({ status: outcome.status, alreadySettled: false });
});

/**
 * The processor renews a subscription.
 *
 * A real processor charges the next period on its own and reports the paid
 * renewal invoice; this is that renewal, delivered through the same signed
 * webhook path.
 */
localProviderRouter.post("/subscriptions/:subscription/renew", async (req: Request, res: Response) => {
  const providerSubscriptionId = String(req.params.subscription);
  const subscription = await prisma.subscription.findUnique({ where: { providerSubscriptionId } });
  if (!subscription || subscription.provider !== "local") throw notFound("Subscription");
  if (subscription.status === "canceled" || subscription.canceledAt) throw badRequest("A cancelled subscription is not renewed.");
  const invoices = await prisma.payment.count({ where: { providerSubscriptionId } });
  const from = Math.max(Date.now(), subscription.currentPeriodEnd?.getTime() ?? 0);
  const invoiceId = `local_in_${providerSubscriptionId}_${invoices + 1}`;
  const { body, signature, timestamp } = LocalProvider.buildEvent({
    providerEventId: `local_evt_${invoiceId}`,
    type: "invoice.paid",
    occurredAt: new Date(),
    customerReference: customerReference(subscription.userId),
    providerSubscriptionId,
    providerInvoiceId: invoiceId,
    billingReason: "subscription_cycle",
    planId: subscription.planId,
    currentPeriodEnd: periodEndFor(subscription.planId, from),
  });
  const outcome = await billingService.handleWebhook(body, signature, timestamp);
  res.json({ status: outcome.status, invoiceId });
});
