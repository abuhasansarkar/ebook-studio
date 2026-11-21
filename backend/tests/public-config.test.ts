import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/database/prisma.js";
import { closeQueues } from "../src/queues/index.js";
import { getApp, ORIGIN } from "./helpers.js";

/**
 * The public configuration endpoint.
 *
 * The browser reads this endpoint to decide whether to offer Google sign-in.
 * The flag is the only thing that tells the login page a provider is
 * configured, so a broken flag hides the button without any error anywhere.
 * That is exactly what happened when the API could not start: the login page
 * rendered, and the Google button was simply absent.
 *
 * These tests pin the two things that must hold: the flag is present and
 * boolean, and the response carries no secret.
 */

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("public configuration", () => {
  it("reports whether Google sign-in is configured", async () => {
    const res = await request(getApp()).get("/api/v1/config");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("auth");
    expect(typeof res.body.auth.google).toBe("boolean");
  });

  it("needs no session", async () => {
    const res = await request(getApp()).get("/api/v1/config");
    expect(res.status).toBe(200);
  });

  it("carries the language catalogue the editor offers", async () => {
    const res = await request(getApp()).get("/api/v1/config");
    expect(Array.isArray(res.body.languages)).toBe(true);
    expect(res.body.languages.length).toBeGreaterThan(0);
    for (const language of res.body.languages) {
      expect(language).toHaveProperty("code");
      expect(language).toHaveProperty("name");
      expect(language).toHaveProperty("dir");
      expect(["ltr", "rtl"]).toContain(language.dir);
    }
  });

  it("never leaks a secret", async () => {
    const res = await request(getApp()).get("/api/v1/config");
    const body = JSON.stringify(res.body);
    for (const secret of [
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_CLIENT_ID",
      "BETTER_AUTH_SECRET",
      "PAYMENT_WEBHOOK_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "SMTP_PASS",
      "OPENAI_API_KEY",
    ]) {
      expect(body).not.toContain(secret);
    }
    // The whole body is a small, known shape, so a new field carrying a
    // value cannot be added without this test noticing.
    expect(Object.keys(res.body).sort()).toEqual(["auth", "languages"]);
    expect(Object.keys(res.body.auth).sort()).toEqual(["google"]);
  });
});

describe("Google sign-in", () => {
  /**
   * The provider is only offered when it is configured.
   *
   * The endpoint answers with the provider's own authorization URL when the
   * credentials are present. When they are absent the endpoint answers with
   * an error rather than a URL, and the login page hides the button.
   */
  it("answers the social sign-in endpoint", async () => {
    const res = await request(getApp())
      .post("/api/v1/auth/sign-in/social")
      .set("Origin", ORIGIN)
      .send({ provider: "google", callbackURL: "http://localhost:3000/app/dashboard" });

    // The response is either a redirect to the provider or a refusal. Both
    // are valid; what must not happen is a crash or an empty answer.
    expect([200, 400, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(typeof res.body.url).toBe("string");
      expect(res.body.url.length).toBeGreaterThan(0);
    }
  });

  it("refuses a provider that is not configured", async () => {
    const res = await request(getApp())
      .post("/api/v1/auth/sign-in/social")
      .set("Origin", ORIGIN)
      .send({ provider: "not-a-provider", callbackURL: "http://localhost:3000/app/dashboard" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
