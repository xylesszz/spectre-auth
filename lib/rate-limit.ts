import { db } from '@/lib/db';

export async function rateLimit(identifier: string, limit: number, windowMs: number) {
  const now = new Date();
  
  const entry = await db.rateLimitEntry.findUnique({ where: { key: identifier } });

  // CORREÇÃO: entry.resetAt em vez de entry.expiresAt
  if (!entry || entry.resetAt < now) {
    await db.rateLimitEntry.upsert({
      where: { key: identifier },
      // CORREÇÃO: resetAt em vez de expiresAt
      update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      create: { key: identifier, count: 1, resetAt: new Date(now.getTime() + windowMs) },
    });
    return { success: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt };
  }

  await db.rateLimitEntry.update({
    where: { key: identifier },
    data: { count: { increment: 1 } },
  });

  return { success: true, remaining: limit - entry.count - 1, resetAt: entry.resetAt };
}