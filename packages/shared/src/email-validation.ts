export { DISPOSABLE_DOMAINS } from "./disposable-domains";
import { DISPOSABLE_DOMAINS } from "./disposable-domains";

/** Default user-facing error message when a disposable email is supplied. */
export const DISPOSABLE_EMAIL_ERROR_MESSAGE =
  "Disposable or temporary email addresses are not permitted. Please use a personal or business email address.";

/** Domains explicitly permitted for local, CI, and end-to-end automated testing. */
const ALLOWED_TEST_DOMAINS = new Set([
  "test.dev",
  "example.com",
  "example.org",
  "example.net",
  "localhost",
]);

/**
 * Extracts the normalized lower-cased domain from an email address.
 * E.g. "Author@Mailinator.Com" -> "mailinator.com"
 */
export function extractDomain(email: string): string {
  if (!email || typeof email !== "string") return "";
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) return "";
  return parts[1].trim();
}

/**
 * Evaluates whether an email address belongs to a disposable or throwaway service.
 * Supports exact domain matches as well as subdomain variations (e.g. *.mailinator.com).
 */
export function isDisposableEmail(email: string): boolean {
  const domain = extractDomain(email);
  if (!domain) return false;

  // Always permit safe internal automated testing domains
  if (ALLOWED_TEST_DOMAINS.has(domain)) {
    return false;
  }

  // Exact domain match
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return true;
  }

  // Check wildcard subdomains (e.g., "anything.mailinator.com" -> "mailinator.com")
  const segments = domain.split(".");
  for (let i = 1; i < segments.length - 1; i++) {
    const parentDomain = segments.slice(i).join(".");
    if (DISPOSABLE_DOMAINS.has(parentDomain)) {
      return true;
    }
  }

  return false;
}
