import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { toNodeHandler } from "better-auth/node";
import { env, parseTrustProxy } from "./config/env.js";
import { clientIpHeader } from "./middleware/clientIp.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter, authLimiter } from "./middleware/rateLimits.js";
import { apiRouter } from "./routes/index.js";
import { billingWebhookRouter } from "./routes/billing.js";
import { localProviderRouter } from "./routes/local-provider.js";
import { auth } from "./services/auth/auth.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();
  // Which proxies may report the client address. Every rate limit keys on
  // req.ip, so this must match the deployment: 1 behind the compose nginx,
  // loopback for local development. See TRUST_PROXY in config/env.ts.
  app.set("trust proxy", parseTrustProxy(env.TRUST_PROXY));
  app.disable("x-powered-by");
  app.use(clientIpHeader);

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

  // Better Auth must see the raw body, so it is mounted before express.json().
  app.all("/api/v1/auth/*splat", authLimiter, toNodeHandler(auth));

  // The payment webhook is verified against the raw bytes, so it is mounted
  // before express.json() parses them. It needs no session: the signature is
  // the authentication.
  app.use("/api/v1", billingWebhookRouter);

  // The local provider's own checkout server. It is mounted only while the
  // build talks to the local provider, which cannot take money; with Stripe
  // the path does not exist.
  if (env.PAYMENT_PROVIDER === "local") app.use("/api/v1/local-provider", authLimiter, localProviderRouter);

  app.use(express.json({ limit: "5mb" }));
  app.use("/api/v1", apiLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
