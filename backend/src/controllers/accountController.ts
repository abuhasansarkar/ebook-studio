import type { Request, Response } from "express";
import { LANGUAGES } from "@ebook/shared";
import { z } from "zod";
import { prisma } from "../database/prisma.js";
import { userId } from "../middleware/requireAuth.js";
import { authFeatures } from "../services/auth/auth.js";
import { creditService } from "../services/credits/creditService.js";
import { notFound } from "../utils/errors.js";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
});

export const accountController = {
  /** Public config the frontend needs before login. */
  publicConfig(_req: Request, res: Response) {
    res.json({ auth: { google: authFeatures.google }, languages: LANGUAGES });
  },

  me(req: Request, res: Response) {
    res.json({ user: req.user });
  },

  async credits(req: Request, res: Response) {
    const uid = userId(req);
    const [wallet, transactions] = await Promise.all([creditService.getWallet(uid), creditService.listTransactions(uid)]);
    res.json({ wallet: { balance: wallet.balance, reserved: wallet.reserved }, transactions });
  },

  async listProjects(req: Request, res: Response) {
    const projects = await prisma.project.findMany({
      where: { userId: userId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { books: { where: { deletedAt: null } } } } },
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
