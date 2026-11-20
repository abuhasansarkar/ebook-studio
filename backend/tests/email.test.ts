import { describe, expect, it, vi } from "vitest";
import { createOtpMailer, OTP_SUBJECTS, smtpOptions, type OtpType } from "../src/services/email/otpMailer.js";

const config = { host: "smtp.gmail.com", port: 587, user: "sender@example.com", pass: "abcd efgh ijkl mnop", from: "eBookStudio <sender@example.com>" };

describe("SMTP delivery", () => {
  it("uses STARTTLS on 587 and implicit TLS on 465, normalizing Gmail app password spaces", () => {
    expect(smtpOptions(config)).toMatchObject({ secure: false, requireTLS: true, auth: { pass: "abcdefghijklmnop" } });
    expect(smtpOptions({ ...config, port: 465 })).toMatchObject({ secure: true, requireTLS: false });
    expect(smtpOptions({ ...config, host: "localhost", port: 1025, user: "", pass: "" })).toMatchObject({ secure: false, requireTLS: false, auth: undefined });
    expect(() => smtpOptions({ ...config, pass: "" })).toThrow("App Password");
    expect(() => smtpOptions({ ...config, port: 1025 })).toThrow("465 or 587");
  });

  for (const type of Object.keys(OTP_SUBJECTS) as OtpType[]) {
    it(`sends ${type} with the correct code, subject and expiration in HTML and plain text`, async () => {
      const transport = { verify: vi.fn().mockResolvedValue(true), sendMail: vi.fn().mockResolvedValue({ accepted: ["reader@example.com"], rejected: [] }) };
      await createOtpMailer(config, transport).send("reader@example.com", "012345", type);
      expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
        to: "reader@example.com", from: config.from, subject: OTP_SUBJECTS[type],
        html: expect.stringContaining("012345"), text: expect.stringContaining("10 minutes"),
      }));
    });
  }

  it("propagates SMTP failures and recipient rejection rather than reporting success", async () => {
    const transport = { verify: vi.fn().mockResolvedValue(true), sendMail: vi.fn().mockRejectedValue(new Error("SMTP unavailable")) };
    const mailer = createOtpMailer(config, transport);
    await expect(mailer.send("reader@example.com", "123456", "email-verification")).rejects.toThrow("SMTP unavailable");
    transport.sendMail.mockResolvedValue({ accepted: [], rejected: ["reader@example.com"] });
    await expect(mailer.send("reader@example.com", "123456", "email-verification")).rejects.toThrow("did not accept");
    transport.sendMail.mockClear();
    await expect(mailer.send("reader@example.com", "<script>", "email-verification")).rejects.toThrow("six digits");
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
