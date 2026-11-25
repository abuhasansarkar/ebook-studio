import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimits.js";
import { apiRouter } from "./routes/index.js";
import { billingWebhookRouter } from "./routes/billing.js";
import { localProviderRouter } from "./routes/local-provider.js";
import { auth } from "./services/auth/auth.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(helmet());
  app.use(cors({ origin: [env.APP_URL, env.BETTER_AUTH_URL], credentials: true }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers["x-request-id"];
        const id = typeof incoming === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader("x-request-id", id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === "/api/v1/health" },
      // One compact line per request instead of full header dumps.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // Email verification check (public) before Better Auth catches /api/v1/auth/*splat
  app.get("/api/v1/auth/check-email", apiLimiter, async (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email.trim() : "";
    if (!email) return res.json({ available: false, reason: "empty" });
    const { isDisposableEmail, DISPOSABLE_EMAIL_ERROR_MESSAGE } = await import("@ebook/shared");
    const { isTombstonedEmail, TOMBSTONED_EMAIL_ERROR_MESSAGE } = await import("./services/auth/auth.js");
    if (isDisposableEmail(email)) {
      return res.json({ available: false, disposable: true, message: DISPOSABLE_EMAIL_ERROR_MESSAGE });
    }
    if (await isTombstonedEmail(email)) {
      return res.json({ available: false, tombstoned: true, message: TOMBSTONED_EMAIL_ERROR_MESSAGE });
    }
    return res.json({ available: true });
  });

  // Better Auth must see the raw body, so it is mounted before express.json().
  app.all("/api/v1/auth/*splat", toNodeHandler(auth));

  // The payment webhook is verified against the raw bytes, so it is mounted
  // before express.json() parses them. It needs no session: the signature is
  // the authentication.
  app.use("/api/v1", billingWebhookRouter);

  // The local provider's own checkout server. It is only reachable while the
  // build talks to the local provider, which cannot take money.
  app.use("/api/v1/local-provider", localProviderRouter);

  app.use(express.json({ limit: "5mb" }));
  app.use("/api/v1", apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
