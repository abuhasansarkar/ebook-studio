import type { Request, Response } from "express";
import { LANGUAGES } from "@ebook/shared";
import { z } from "zod";
import { badRequest } from "../utils/errors.js";
import { prisma } from "../database/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { authFeatures } from "../services/auth/auth.js";
import { deleteAccount } from "../services/account/accountDeletionService.js";
import { creditService } from "../services/credits/creditService.js";
import { notFound } from "../utils/errors.js";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});

/** Deleting an account is irreversible, so the person retypes their email. */
export const deleteAccountSchema = z.object({ confirmEmail: z.string().trim().min(3).max(320) });

export const accountController = {
  /** Public config the frontend needs before login. */
  publicConfig(_req: Request, res: Response) {
    res.json({ auth: { google: authFeatures.google }, languages: LANGUAGES });
  },

  me(req: Request, res: Response) {
    res.json({ user: req.user });
  },

  /**
   * Deletes the signed-in account: content and files go, the ledger and
   * payments stay attached to an anonymous tombstone. Signs the caller out.
   */
  async deleteMe(req: Request, res: Response) {
    if (req.body.confirmEmail.toLowerCase() !== req.user!.email.toLowerCase()) {
      throw badRequest("Type the email address of this account to confirm.");
    }
    const outcome = await deleteAccount(userId(req), { requestId: String(req.id) });
    res.json({ deleted: true, deletedAt: outcome.deletedAt.toISOString() });
  },

  async credits(req: Request, res: Response) {
    const uid = userId(req);
    const [wallet, page] = await Promise.all([creditService.getWallet(uid), creditService.pageTransactions(uid)]);
    res.json({ wallet: { balance: wallet.balance, reserved: wallet.reserved }, transactions: page.transactions, nextCursor: page.nextCursor });
  },

  /** Older pages of the credit history. */
  async creditHistory(req: Request, res: Response) {
    const uid = userId(req);
    const cursor = typeof req.query.cursor === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(req.query.cursor) ? req.query.cursor : undefined;
    const owned = cursor ? await prisma.creditTransaction.findFirst({ where: { id: cursor, userId: uid }, select: { id: true } }) : null;
    if (cursor && !owned) throw badRequest("That history position is not available.");
    res.json(await creditService.pageTransactions(uid, 50, cursor));
  },

  async listProjects(req: Request, res: Response) {
    const projects = await prisma.project.findMany({
      where: { userId: userId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { books: { where: { userId: userId(req), deletedAt: null } } } } },
    });
    res.json({ projects });
  },

  async createProject(req: Request, res: Response) {
    const project = await prisma.project.create({ data: { userId: userId(req), ...req.body } });
    res.status(201).json({ project });
  },

  async deleteProject(req: Request, res: Response) {
    const res2 = await prisma.project.updateMany({
      where: { id: String(req.params.projectId), userId: userId(req), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res2.count === 0) throw notFound("Project");
    res.status(204).end();
  },
};
