import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../services/auth/auth.js";
import { forbidden, unauthorized } from "../utils/errors.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Validates the Better Auth session on every protected request. Never trusts the frontend. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) throw unauthorized();
  if (!session.user.emailVerified) throw forbidden("Please verify your email address first");
  req.user = {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: session.user.emailVerified,
  };
  next();
}

/** Narrow helper for controllers behind `requireAuth`. */
export function userId(req: Request): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}
