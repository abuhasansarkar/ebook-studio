import { prisma } from "../src/database/prisma.js";

async function main() {
  const targetEmail = process.argv[2] || "abuhasansarkar2@gmail.com";
  console.log(`\n========================================`);
  console.log(`Admin Role Grant Utility`);
  console.log(`Target: ${targetEmail}`);
  console.log(`========================================\n`);

  let user = await prisma.user.findUnique({
    where: { email: targetEmail },
    include: { adminRoles: true },
  });

  if (!user) {
    console.log(`❌ User with email "${targetEmail}" was not found in the database.\n`);
    console.log("Recent users in database:");
    const recentUsers = await prisma.user.findMany({
      select: { id: true, email: true, name: true, emailVerified: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    console.table(recentUsers);
    console.log(`\n[Instructions to complete setup]:`);
    console.log(`1. Go to the web app: http://localhost:3000/signup`);
    console.log(`   Create your account using: ${targetEmail}`);
    console.log(`   (Or sign in with Google on http://localhost:3000/login)`);
    console.log(`2. Once registered, run this command in your terminal:`);
    console.log(`   pnpm --filter backend admin:grant ${targetEmail}`);
    console.log(`   This will immediately activate the 'administrator' role.`);
    return;
  }

  console.log(`✅ Found user:`, {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    currentRoles: user.adminRoles.filter((r) => !r.revokedAt).map((r) => r.role),
  });

  // Ensure email is marked verified
  if (!user.emailVerified) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });
    console.log("-> Automatically verified user email status (emailVerified = true).");
  }

  // Grant administrator role
  const roleRecord = await prisma.adminRole.upsert({
    where: {
      userId_role: {
        userId: user.id,
        role: "administrator",
      },
    },
    update: {
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      reason: "Superadmin role granted via admin grant CLI",
      grantedAt: new Date(),
    },
    create: {
      userId: user.id,
      role: "administrator",
      reason: "Superadmin role granted via admin grant CLI",
      grantedBy: "system",
    },
  });

  console.log(`\n🎉 Full 'administrator' role successfully granted to ${targetEmail}!`);
  console.log(`Admin Role Details:`, {
    id: roleRecord.id,
    role: roleRecord.role,
    grantedAt: roleRecord.grantedAt,
    reason: roleRecord.reason,
  });

  console.log(`\n========================================`);
  console.log(`Admin Console Access:`);
  console.log(`URL: http://localhost:3000/app/admin`);
  console.log(`Included Permissions:`);
  console.log(`- ops.read (Operational figures, users, books, jobs)`);
  console.log(`- users.manage (Account actions)`);
  console.log(`- credits.adjust (Manual credit balance adjustments)`);
  console.log(`- billing.read & billing.refund (Payments, subscriptions, refunds)`);
  console.log(`- jobs.intervene (Retry & cancel jobs)`);
  console.log(`- deliveries.read & support.reply (Support tickets & queues)`);
  console.log(`- roles.manage (Assign support, finance, and admin roles)`);
  console.log(`- backup.manage (SQL dumps & sandbox restore rehearsals)`);
  console.log(`- audit.read (Immutable security audit log)`);
  console.log(`========================================\n`);
}

main()
  .catch((err) => {
    console.error("Error running grant-admin script:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
