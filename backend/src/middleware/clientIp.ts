import type { NextFunction, Request, Response } from "express";

/**
 * The header Better Auth reads the client address from.
 *
 * Better Auth parses X-Forwarded-For on its own, which disagrees with
 * Express's `trust proxy` setting: depending on the proxy it either trusts a
 * value the client wrote (spoofable rate limits) or finds several addresses
 * and gives up (every client in one bucket). Instead, Express resolves the
 * address once with TRUST_PROXY and hands Better Auth the result in this
 * header. Any client-supplied value is overwritten, so it cannot be forged.
 */
export const CLIENT_IP_HEADER = "x-ebook-client-ip";

export function clientIpHeader(req: Request, _res: Response, next: NextFunction) {
  const ip = req.ip;
  if (ip) req.headers[CLIENT_IP_HEADER] = ip;
  else delete req.headers[CLIENT_IP_HEADER];
  next();
}
