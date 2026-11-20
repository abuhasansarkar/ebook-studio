import { prisma } from '../src/database/prisma.js';
import { emailRuntimeId } from '../src/services/email/otpDelivery.js';
try {
  const counts = await prisma.emailDelivery.groupBy({ by: ['status', 'type'], where: { runtimeId: emailRuntimeId }, _count: { _all: true } });
  const pending = await prisma.emailDelivery.findFirst({ where: { runtimeId: emailRuntimeId, status: { in: ['queued', 'sending'] } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  console.log(JSON.stringify({ counts, oldestPendingAgeSeconds: pending ? Math.round((Date.now() - pending.createdAt.getTime()) / 1000) : null }, null, 2));
} finally { await prisma.$disconnect(); }
