import { describe, expect, it } from "vitest";
import {
  DISPOSABLE_DOMAINS,
  DISPOSABLE_EMAIL_ERROR_MESSAGE,
  extractDomain,
  isDisposableEmail,
} from "@ebook/shared";

describe("Disposable Email Validation (Pure Unit Tests)", () => {
  it("extracts and normalizes domain from email strings", () => {
    expect(extractDomain("author@gmail.com")).toBe("gmail.com");
    expect(extractDomain("USER@MAILINATOR.COM")).toBe("mailinator.com");
    expect(extractDomain("  john.doe@Sub.GuerrillaMail.Com  ")).toBe("sub.guerrillamail.com");
    expect(extractDomain("invalid-email-without-at")).toBe("");
    expect(extractDomain("")).toBe("");
    expect(extractDomain("@nodomain")).toBe("");
  });

  it("detects and flags popular temporary / throwaway email domains", () => {
    const knownTempMails = [
      "user@10minutemail.com",
      "test@10minutemail.net",
      "spammer@guerrillamail.com",
      "bot@sharklasers.com",
      "temp@mailinator.com",
      "throwaway@temp-mail.org",
      "disposable@tempmail.com",
      "burner@trashmail.com",
      "fake@yopmail.com",
      "anon@dispostable.com",
      "tester@mohmal.com",
      "throw@mytemp.email",
      "junk@emailondeck.com",
      "burner@burnermail.io",
      "drop@dropmail.me",
      "temp@minuteinbox.com",
      "inbox@maildrop.cc",
    ];

    for (const email of knownTempMails) {
      expect(isDisposableEmail(email), `Expected ${email} to be flagged as disposable`).toBe(true);
    }
  });

  it("detects wildcard subdomains belonging to disposable providers", () => {
    expect(isDisposableEmail("randomuser@subdomain.mailinator.com")).toBe(true);
    expect(isDisposableEmail("bot123@dynamic.sharklasers.com")).toBe(true);
    expect(isDisposableEmail("test@deep.sub.yopmail.com")).toBe(true);
    expect(isDisposableEmail("user@custom.guerrillamail.net")).toBe(true);
  });

  it("permits standard personal, corporate, and educational email domains", () => {
    const legitimateEmails = [
      "author@gmail.com",
      "writer@outlook.com",
      "novelist@yahoo.com",
      "creator@hotmail.com",
      "publisher@icloud.com",
      "pro@proton.me",
      "user@protonmail.com",
      "editor@penguinrandomhouse.com",
      "scholar@oxford.ac.uk",
      "student@stanford.edu",
      "contact@agency.co.uk",
    ];

    for (const email of legitimateEmails) {
      expect(isDisposableEmail(email), `Expected legitimate ${email} to be allowed`).toBe(false);
    }
  });

  it("permits safe internal automated testing domains without interference", () => {
    expect(isDisposableEmail("test-user-1@test.dev")).toBe(false);
    expect(isDisposableEmail("admin@example.com")).toBe(false);
    expect(isDisposableEmail("e2e-runner@example.org")).toBe(false);
    expect(isDisposableEmail("local@localhost")).toBe(false);
  });

  it("handles edge cases gracefully", () => {
    expect(isDisposableEmail("")).toBe(false);
    expect(isDisposableEmail("not-an-email")).toBe(false);
    expect(isDisposableEmail("user@")).toBe(false);
    expect(isDisposableEmail("@domain.com")).toBe(false);
  });

  it("exports a clear, user-friendly error message", () => {
    expect(DISPOSABLE_EMAIL_ERROR_MESSAGE).toContain("Disposable or temporary email addresses are not permitted");
    expect(DISPOSABLE_EMAIL_ERROR_MESSAGE).toContain("Please use a personal or business email address");
  });

  it("includes a comprehensive domain catalog", () => {
    expect(DISPOSABLE_DOMAINS.size).toBeGreaterThan(250);
    expect(DISPOSABLE_DOMAINS.has("mailinator.com")).toBe(true);
    expect(DISPOSABLE_DOMAINS.has("guerrillamail.com")).toBe(true);
    expect(DISPOSABLE_DOMAINS.has("10minutemail.com")).toBe(true);
  });
});
