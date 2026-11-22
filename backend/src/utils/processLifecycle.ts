import type { Server } from "node:http";
import { logger as defaultLogger } from "./logger.js";

type Log = Pick<typeof defaultLogger, "info" | "error" | "fatal">;

export interface LifecycleOptions {
  /** "API" or "worker", for the log lines. */
  name: string;
  /** Stops intake, then drains and closes resources. Runs at most once. */
  shutdown: () => Promise<unknown>;
  /** Hard limit for `shutdown`; past it the process exits with code 1. */
  deadlineMs?: number;
  exit?: (code: number) => void;
  log?: Log;
}

/**
 * Graceful shutdown with a deadline.
 *
 * The first signal runs `shutdown` and exits 0 when it finishes. A shutdown
 * that hangs (a stuck connection, a job that will not stop) is cut off at the
 * deadline with exit code 1, so the orchestrator's kill is never the only exit.
 * A second signal while shutting down is ignored; the deadline still applies.
 */
export function createShutdown(options: LifecycleOptions) {
  const { name, shutdown, deadlineMs = 25_000, exit = (code) => process.exit(code), log = defaultLogger } = options;
  let started: Promise<void> | null = null;
  return (reason: string, code = 0): Promise<void> => {
    started ??= (async () => {
      log.info({ reason }, `Shutting down ${name}`);
      const deadline = setTimeout(() => {
        log.error({ reason, deadlineMs }, `${name} shutdown exceeded its deadline; exiting`);
        exit(1);
      }, deadlineMs);
      deadline.unref();
      try {
        await shutdown();
        exit(code);
      } catch (err) {
        log.error({ err }, `${name} shutdown failed`);
        exit(1);
      } finally {
        clearTimeout(deadline);
      }
    })();
    return started;
  };
}

/**
 * Installs SIGTERM/SIGINT handlers and process-level error handlers.
 *
 * An unhandled promise rejection is logged and the process keeps serving: it is
 * a bug to fix, not a reason to drop every in-flight request. An uncaught
 * exception leaves the process in an unknown state, so it is logged and the
 * process shuts down (exit code 1).
 */
export function installProcessHandlers(options: LifecycleOptions) {
  const stop = createShutdown(options);
  const log = options.log ?? defaultLogger;
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    log.error({ err: reason }, `Unhandled promise rejection in ${options.name}`);
  });
  process.on("uncaughtException", (err, origin) => {
    log.fatal({ err, origin }, `Uncaught exception in ${options.name}; shutting down`);
    void stop("uncaughtException", 1);
  });
  return stop;
}

/** `server.close()` as a promise; idle keep-alive sockets are closed at once, busy ones at the deadline. */
export function closeServer(server: Server, deadlineMs = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const force = setTimeout(() => server.closeAllConnections(), deadlineMs);
    force.unref();
    server.close((err) => {
      clearTimeout(force);
      if (err && (err as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING") reject(err);
      else resolve();
    });
    server.closeIdleConnections();
  });
}
