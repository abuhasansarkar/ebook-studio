import { Router, type Request, type Response } from "express";
import { prisma } from "../database/prisma.js";
import { logger } from "../utils/logger.js";
import { billingService } from "../services/billing/billingService.js";
import { getProvider, LocalProvider } from "../services/billing/provider.js";
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

  const { body, signature, timestamp } = LocalProvider.buildEvent({
    providerEventId: `local_evt_${payment.providerPaymentId}`,
    type: "payment.succeeded",
    occurredAt: new Date(),
    customerReference: payment.providerCustomerReference,
    providerPaymentId: payment.providerPaymentId,
    planId: payment.planId ?? undefined,
    amountMinor: payment.amountMinor,
    currency: payment.currency as "USD" | "EUR" | "GBP",
    credits: payment.credits,
    // A recurring plan gets a subscription with a period, the way a real
    // processor reports one.
    providerSubscriptionId: plan?.recurring ? `sub_${payment.providerPaymentId}` : undefined,
    subscriptionStatus: plan?.recurring ? "active" : undefined,
    currentPeriodEnd: plan?.recurring ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
  });

  // The processor tells the merchant "this customer paid". The event is signed
  // and delivered through the merchant's webhook handler, which verifies the
  // signature before it grants anything — the same path a real processor's
  // callback takes.
  const outcome = await billingService.handleWebhook(body, signature, timestamp);
  logger.info({ providerEventId: `local_evt_${payment.providerPaymentId}` }, "The local provider settled a checkout");
  res.json({ status: outcome.status, alreadySettled: false });
});
