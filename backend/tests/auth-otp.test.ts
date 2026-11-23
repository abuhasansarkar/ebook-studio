import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/services/email/mailer.js", () => ({ sendOtpEmail: sendMail }));

import { prisma } from "../src/database/prisma.js";
import { getApp, ORIGIN } from "./helpers.js";
import { closeQueues } from "../src/queues/index.js";

beforeEach(() => sendMail.mockClear());
afterAll(async () => { await closeQueues(); await prisma.$disconnect(); });

function latestCode(type: string) {
  const call = sendMail.mock.calls.filter((c) => c[2] === type).at(-1);
  if (!call) throw new Error(`No ${type} email was sent`);
  return String(call[1]);
}

function post(path: string, body: object) {
  return request(getApp()).post(`/api/v1/auth${path}`).set("Origin", ORIGIN).send(body);
}

async function signUp() {
  const email = `otp-${Date.now()}-${Math.random().toString(36).slice(2)}@test.dev`;
  await post("/sign-up/email", { email, password: "password123", name: "OTP test" }).expect(200);
  return email;
}

describe("OTP authentication journeys (captured mail; no real SMTP)", () => {
  it("sends signup and resend codes, verifies email, rejects invalid codes and reuse", async () => {
    const email = await signUp();
    expect(sendMail).toHaveBeenCalledWith(email, expect.stringMatching(/^\d{6}$/), "email-verification");
    await post("/email-otp/send-verification-otp", { email, type: "email-verification" }).expect(200);
    const code = latestCode("email-verification");
    const wrong = code === "000000" ? "111111" : "000000";
    await post("/email-otp/verify-email", { email, otp: wrong }).expect(400);
    await post("/email-otp/verify-email", { email, otp: code }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerified).toBe(true);
    await post("/email-otp/verify-email", { email, otp: code }).expect(400);
  });

  it("rejects registrations and OTP requests using disposable email addresses", async () => {
    // 1. Sign-up with disposable email is rejected with HTTP 400
    const disposableSignup = await post("/sign-up/email", {
      email: "throwaway-bot@mailinator.com",
      password: "password123",
      name: "Bot User",
    });
    expect(disposableSignup.status).toBe(400);

    // Verify user was NOT created in database
    const userInDb = await prisma.user.findUnique({
      where: { email: "throwaway-bot@mailinator.com" },
    });
    expect(userInDb).toBeNull();

    // 2. Requesting an OTP for a disposable email does not send mail (neutral auth response)
    sendMail.mockClear();
    await post("/email-otp/send-verification-otp", {
      email: "spammer@10minutemail.com",
      type: "email-verification",
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends reset codes, changes the password and rejects reset code reuse", async () => {
    const email = await signUp();
    await post("/email-otp/verify-email", { email, otp: latestCode("email-verification") }).expect(200);
    await post("/email-otp/request-password-reset", { email }).expect(200);
    const code = latestCode("forget-password");
    await post("/email-otp/reset-password", { email, otp: code, password: "new-password123" }).expect(200);
    await post("/email-otp/reset-password", { email, otp: code, password: "another-password123" }).expect(400);
    await post("/sign-in/email", { email, password: "password123" }).expect(401);
    await post("/sign-in/email", { email, password: "new-password123" }).expect(200);
  });

  it("sends sign-in codes and creates a session", async () => {
    const email = await signUp();
    await post("/email-otp/send-verification-otp", { email, type: "sign-in" }).expect(200);
    const response = await post("/sign-in/email-otp", { email, otp: latestCode("sign-in") }).expect(200);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("keeps auth responses neutral when SMTP fails, while the sender rejects delivery", async () => {
    const email = await signUp();
    sendMail.mockRejectedValueOnce(new Error("SMTP rejected authentication"));
    const resend = await post("/email-otp/send-verification-otp", { email, type: "email-verification" }).expect(200);
    expect(resend.body.success).toBe(true);
    expect(JSON.stringify(resend.body)).not.toContain("SMTP rejected authentication");
    sendMail.mockRejectedValueOnce(new Error("SMTP unavailable"));
    await post("/email-otp/request-password-reset", { email }).expect(200);
  });

  it("does not send a reset email or expose a missing account", async () => {
    await post("/email-otp/request-password-reset", { email: `missing-${Date.now()}@test.dev` }).expect(200);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
