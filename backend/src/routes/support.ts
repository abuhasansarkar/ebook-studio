import { Router } from "express";
import { supportRequestSchema } from "@ebook/shared";
import { userId } from "../middleware/requireAuth.js";
import { validateBody } from "../middleware/validate.js";
import { submitSupportRequest } from "../services/admin/operationsService.js";
import { prisma } from "../database/prisma.js";

export const supportRouter = Router();

/**
 * S13 — the customer's side of support.
 *
 * A customer submits a request and gets back the correlation id, so they can
 * quote it when they follow up and support can find the matching logs.
 */
supportRouter.post("/support/requests", validateBody(supportRequestSchema), async (req, res) => {
  const id = userId(req);
  const correlationId = req.body.correlationId ?? `sup-${Date.now().toString(36)}`;
  const result = await submitSupportRequest({
    userId: id,
    correlationId,
    category: req.body.category,
    subject: req.body.subject,
    message: req.body.message,
    context: req.body.context,
    email: req.body.email,
  });
  res.status(201).json(result);
});

/**
 * The customer's own support requests.
 *
 * A customer sees only their own requests, and only the answer an agent
 * wrote. The agent's internal notes are not exposed here.
 */
supportRouter.get("/support/requests", async (req, res) => {
  const id = userId(req);
  const rows = await prisma.supportRequest.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    requests: rows.map((row) => ({
      id: row.id,
      correlationId: row.correlationId,
      category: row.category,
      subject: row.subject,
      status: row.status,
      response: row.response,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});
