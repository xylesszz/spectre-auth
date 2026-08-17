import { db } from '@/lib/db';

export async function rateLimit(identifier: string, limit: number, windowMs: number) {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  const key = identifier;

  try {
    // Usar upsert em vez de raw SQL (compatível com PostgreSQL)
    const entry = await db.rateLimitEntry.upsert({
      where: { key },
      update: {
        count: {
          increment: 1,
        },
        resetAt: resetAt,
      },
      create: {
        key,
        count: 1,
        resetAt,
      },
    });

    // Se a janela expirou, resetar
    if (entry.resetAt < now) {
      await db.rateLimitEntry.update({
        where: { key },
        data: { count: 1, resetAt },
      });
      return { success: true, remaining: limit - 1, resetAt };
    }

    if (entry.count > limit) {
      return { success: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt };
  } catch (error) {
    console.error('[rate-limit] DB error:', error);
    return { success: true, remaining: 1 };
  }
}