import { Router, raw, type Request, type Response } from "express";
import { checkoutSchema, type PaymentCurrency } from "@ebook/shared";
import { prisma } from "../database/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { logger } from "../utils/logger.js";
import { billingService } from "../services/billing/billingService.js";
import { getProvider, SIGNATURE_HEADER, STRIPE_SIGNATURE_HEADER } from "../services/billing/provider.js";
import { badRequest } from "../utils/errors.js";

/**
 * S12 billing routes.
 *
 * The webhook route is mounted before the JSON body parser and before the
 * session check: it is not a user request, and the signature has to be checked
 * against the raw bytes exactly as they arrived.
 */
export const billingWebhookRouter = Router();
export const billingRouter = Router();

/**
 * The provider's webhook.
 *
 * The signature is verified before the payload is parsed, and a payload whose
 * signature is not valid is refused without anything being written.
 */
billingWebhookRouter.post("/billing/webhook", raw({ type: "application/json", limit: "256kb" }), async (req: Request, res: Response) => {
  const body = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
  if (!body) throw badRequest("The webhook body is empty.");

  // The signature scheme belongs to the provider, so the header it signs with
  // is read here but verified inside the provider boundary.
  const provider = getProvider();
  const signature = req.get(provider.signatureHeader) ?? undefined;
  const timestampHeader = req.get("x-ebookstudio-timestamp");
  const timestamp = timestampHeader ? Number.parseInt(timestampHeader, 10) : null;
  if (timestampHeader && !Number.isFinite(timestamp)) throw badRequest("The webhook timestamp is not a number.");

  try {
    const outcome = await billingService.handleWebhook(body, signature, timestamp, provider);
    // The provider only needs to know the event was accepted.
    res.status(200).json({ received: true, status: outcome.status, duplicate: outcome.duplicate });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Refused a webhook");
    throw err;
  }
});

/** The plans on offer. Public: the catalog is not private information. */
billingWebhookRouter.get("/billing/plans", async (_req: Request, res: Response) => {
  res.json({ plans: await billingService.plans(), provider: getProvider().name, providerLive: getProvider().live });
});

/** The signed-in author's billing state. */
billingRouter.get("/billing", async (req: Request, res: Response) => {
  res.set("Cache-Control", "private, no-store").json(await billingService.state(userId(req)));
});

/** Syncs pending provider checkouts and returns fresh billing state. */
billingRouter.post("/billing/sync", async (req: Request, res: Response) => {
  await billingService.syncPendingPayments(userId(req));
  res.json(await billingService.state(userId(req)));
});

/** Starts a checkout. It grants nothing until a verified payment arrives. */
billingRouter.post("/billing/checkout", validateBody(checkoutSchema), async (req: Request, res: Response) => {
  res.status(201).json({ checkout: await billingService.startCheckout(userId(req), req.body.planId) });
});

/** Cancels the author's subscription. */
billingRouter.post("/billing/cancel", async (req: Request, res: Response) => {
  res.json({ subscription: await billingService.cancelSubscription(userId(req)) });
});

/**
 * The author's payments.
 *
 * The list is scoped to the author, so one customer cannot read another's
 * payment history.
 */
billingRouter.get("/billing/payments", async (req: Request, res: Response) => {
  const uid = userId(req);
  const payments = await prisma.payment.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { plan: { select: { id: true, name: true } } },
  });
  res.json({
    payments: payments.map((p) => ({
      id: p.id,
      planId: p.planId,
      planName: p.plan?.name ?? null,
      amountMinor: p.amountMinor,
      currency: p.currency as PaymentCurrency,
      status: p.status,
      credits: p.credits,
      description: p.description,
      createdAt: p.createdAt.toISOString(),
    })),
  });
});
