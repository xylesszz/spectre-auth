import { db } from '@/lib/db';

/**
 * Rate limiting simples com Prisma
 * Verifica se uma chave excedeu o limite em uma janela de tempo
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number; resetAt: Date }> {
  try {
    const now = new Date();
    const resetAt = new Date(now.getTime() + windowMs);

    // Tenta encontrar a entrada existente
    let entry = await db.rateLimitEntry.findUnique({
      where: { key },
    });

    if (!entry) {
      // Primeira requisição desta chave
      entry = await db.rateLimitEntry.create({
        data: {
          key,
          count: 1,
          resetAt,
        },
      });

      return {
        success: true,
        remaining: maxRequests - 1,
        resetAt: entry.resetAt,
      };
    }

    // Verifica se a janela expirou
    if (entry.resetAt < now) {
      // Reset a janela
      entry = await db.rateLimitEntry.update({
        where: { key },
        data: {
          count: 1,
          resetAt,
        },
      });

      return {
        success: true,
        remaining: maxRequests - 1,
        resetAt: entry.resetAt,
      };
    }

    // Janela ativa - incrementa o counter
    if (entry.count >= maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    entry = await db.rateLimitEntry.update({
      where: { key },
      data: {
        count: entry.count + 1,
      },
    });

    return {
      success: true,
      remaining: Math.max(0, maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  } catch (error) {
    console.error('Rate limit check failed:', error);
    // Em caso de erro, permite a requisição
    return {
      success: true,
      remaining: maxRequests,
      resetAt: new Date(Date.now() + windowMs),
    };
  }
}

/**
 * Limpa entradas expiradas (ideal para rodar como cron job)
 */
export async function cleanupRateLimit() {
  try {
    const result = await db.rateLimitEntry.deleteMany({
      where: {
        resetAt: { lt: new Date() },
      },
    });

    console.log(`Cleaned up ${result.count} expired rate limit entries`);
    return result.count;
  } catch (error) {
    console.error('Rate limit cleanup failed:', error);
    return 0;
  }
}
