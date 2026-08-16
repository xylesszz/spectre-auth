import { db } from './db';

const memory = new Map<string, { count: number; expiresAt: number }>();

function memoryLimit(identifier: string, limit: number, windowMs: number) {
  const now = Date.now();
  const rec = memory.get(identifier);
  if (!rec || rec.expiresAt < now) {
    memory.set(identifier, { count: 1, expiresAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }
  if (rec.count >= limit) return { success: false, remaining: 0 };
  rec.count += 1;
  return { success: true, remaining: limit - rec.count };
}

export async function rateLimit(identifier: string, limit: number, windowMs: number) {
  try {
    const now = new Date();
    const entry = await db.rateLimitEntry.findUnique({ where: { key: identifier } });

    if (!entry || entry.expiresAt < now) {
      await db.rateLimitEntry.upsert({
        where: { key: identifier },
        update: { count: 1, expiresAt: new Date(now.getTime() + windowMs) },
        create: { key: identifier, count: 1, expiresAt: new Date(now.getTime() + windowMs) },
      });
      return { success: true, remaining: limit - 1 };
    }

    if (entry.count >= limit) return { success: false, remaining: 0 };

    await db.rateLimitEntry.update({
      where: { key: identifier },
      data: { count: { increment: 1 } },
    });
    return { success: true, remaining: limit - entry.count - 1 };
  } catch {
    // Fallback seguro: tabela não sincronizada ou client não gerado.
    // Em produção (Vercel) o caminho do banco funciona após `prisma db push` no build.
    return memoryLimit(identifier, limit, windowMs);
  }
}