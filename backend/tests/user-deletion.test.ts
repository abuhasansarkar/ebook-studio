import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../src/services/email/mailer.js", () => ({ sendOtpEmail: sendMail }));

import { prisma } from "../src/database/prisma.js";
import { createUser, getApp, ORIGIN } from "./helpers.js";
import { closeQueues } from "../src/queues/index.js";
import { TOMBSTONED_EMAIL_ERROR_MESSAGE } from "../src/services/auth/auth.js";

beforeEach(() => {
  sendMail.mockClear();
});

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
});

describe("User deletion and email tombstoning", () => {
  it("allows a user to delete their own account and prevents re-registering with that email", async () => {
    // 1. Create a user
    const { agent, user, email } = await createUser("self-del");

    // Add some sample data for the user (book, wallet)
    await prisma.book.create({
      data: {
        userId: user.id,
        title: "To Be Deleted Book",
        language: "en",
        status: "draft",
      },
    });

    // 2. Perform self-service deletion
    const delRes = await agent.delete("/api/v1/users/me").set("Origin", ORIGIN).send();
    expect(delRes.status).toBe(200);
    expect(delRes.body).toMatchObject({
      success: true,
      email: email.toLowerCase(),
    });

    // 3. User should no longer exist in DB
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    expect(dbUser).toBeNull();

    // 4. TombstonedEmail record must exist
    const tombstone = await prisma.tombstonedEmail.findUnique({
      where: { email: email.toLowerCase() },
    });
    expect(tombstone).not.toBeNull();
    expect(tombstone?.email).toBe(email.toLowerCase());
    expect(tombstone?.reason).toBe("self_deleted");
    expect(tombstone?.note).toBe("Self-service account deletion");

    // 5. Check email validity endpoint should report tombstoned
    const checkRes = await request(getApp())
      .get(`/api/v1/auth/check-email?email=${encodeURIComponent(email)}`)
      .set("Origin", ORIGIN);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body).toMatchObject({
      available: false,
      tombstoned: true,
      message: TOMBSTONED_EMAIL_ERROR_MESSAGE,
    });

    // 6. Attempting to register again with the deleted email must fail with 400
    const signupRes = await request(getApp())
      .post("/api/v1/auth/sign-up/email")
      .set("Origin", ORIGIN)
      .send({
        email,
        password: "new-password123",
        name: "Re-registration attempt",
      });
    expect(signupRes.status).toBe(400);

    // 7. Requesting verification OTP for tombstoned email must not send an email
    sendMail.mockClear();
    await request(getApp())
      .post("/api/v1/auth/email-otp/send-verification-otp")
      .set("Origin", ORIGIN)
      .send({
        email,
        type: "email-verification",
      });
    expect(sendMail).not.toHaveBeenCalled();

    // 8. Old session should be invalid
    const meRes = await agent.get("/api/v1/users/me").set("Origin", ORIGIN);
    expect(meRes.status).toBe(401);
  });

  it("allows an admin with users.manage permission to delete a user account and leaves audit log", async () => {
    // 1. Create admin and target user
    const { agent: adminAgent, user: adminUser } = await createUser("admin-actor");
    const { user: targetUser, email: targetEmail } = await createUser("target-cust");

    // Grant administrator role to adminUser
    await prisma.adminRole.create({
      data: {
        userId: adminUser.id,
        role: "administrator",
        reason: "Admin test setup",
        grantedBy: adminUser.id,
      },
    });

    // 2. Admin deletes target user
    const res = await adminAgent
      .delete(`/api/v1/admin/users/${targetUser.id}`)
      .set("Origin", ORIGIN)
      .send({ reason: "Violation of terms: abusive content" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      email: targetEmail.toLowerCase(),
    });

    // 3. Target user deleted from database
    const dbTarget = await prisma.user.findUnique({ where: { id: targetUser.id } });
    expect(dbTarget).toBeNull();

    // 4. Tombstone created with admin actor ID
    const tombstone = await prisma.tombstonedEmail.findUnique({
      where: { email: targetEmail.toLowerCase() },
    });
    expect(tombstone).not.toBeNull();
    expect(tombstone?.deletedBy).toBe(adminUser.id);
    expect(tombstone?.reason).toBe("admin_deleted");
    expect(tombstone?.note).toBe("Violation of terms: abusive content");

    // 5. Audit log entry recorded
    const audit = await prisma.adminAuditEntry.findFirst({
      where: {
        action: "user.delete",
        targetId: targetUser.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(adminUser.id);
    expect(audit?.reason).toBe("Violation of terms: abusive content");
  });

  it("refuses user deletion when requested by an unauthorized non-admin user", async () => {
    const { agent: userAgent } = await createUser("regular-user");
    const { user: targetUser } = await createUser("other-user");

    const res = await userAgent
      .delete(`/api/v1/admin/users/${targetUser.id}`)
      .set("Origin", ORIGIN)
      .send({ reason: "Malicious attempt" });

    expect(res.status).toBe(403);

    // Target user still exists
    const dbTarget = await prisma.user.findUnique({ where: { id: targetUser.id } });
    expect(dbTarget).not.toBeNull();
  });

  it("refuses to delete the last active administrator account", async () => {
    // Clean any prior admin roles in test DB to isolate
    await prisma.adminRole.deleteMany({ where: { role: "administrator" } });

    // Make sure we have exactly one administrator
    const { agent: adminAgent, user: soloAdmin } = await createUser("solo-admin");

    await prisma.adminRole.create({
      data: {
        userId: soloAdmin.id,
        role: "administrator",
        reason: "Solo admin",
        grantedBy: soloAdmin.id,
      },
    });

    // Attempt to delete self as sole administrator
    const res = await adminAgent
      .delete("/api/v1/users/me")
      .set("Origin", ORIGIN)
      .send();

    expect(res.status).toBe(400);
    expect(res.body?.error?.message).toMatch(/Cannot delete the only active administrator/i);

    // Solo admin still exists
    const dbAdmin = await prisma.user.findUnique({ where: { id: soloAdmin.id } });
    expect(dbAdmin).not.toBeNull();
  });
});
