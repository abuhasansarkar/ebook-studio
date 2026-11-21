export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") => new AppError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource", details?: unknown) => new AppError(403, "FORBIDDEN", message, details);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, "CONFLICT", message, details);
export const paymentRequired = (message: string, details?: unknown) => new AppError(402, "INSUFFICIENT_CREDITS", message, details);
export const serviceUnavailable = (message: string) => new AppError(503, "SERVICE_UNAVAILABLE", message);

/**
 * The failure text a customer may see for a background job.
 *
 * Our own errors carry messages written for the customer. Anything else (an
 * AI SDK error, a network fault) can carry provider request ids, account
 * details or payload fragments, so it is logged in full and replaced here.
 */
export function customerJobError(err: unknown, fallback: string): string {
  return err instanceof AppError ? err.message : fallback;
}
