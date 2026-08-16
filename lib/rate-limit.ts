const inMemoryStore = new Map<string, { count: number; expiresAt: number }>();

export async function rateLimit(identifier: string, limit: number, windowMs: number) {
  if (process.env.NODE_ENV === 'production') {
    // In production, this MUST be replaced with a distributed store like Upstash Redis.
    throw new Error("In-memory rate limiting is not safe for production. Configure Upstash Redis.");
  }
  
  const now = Date.now();
  const record = inMemoryStore.get(identifier);
  
  if (!record || record.expiresAt < now) {
    inMemoryStore.set(identifier, { count: 1, expiresAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }
  
  if (record.count >= limit) {
    return { success: false, remaining: 0, retryAfter: Math.ceil((record.expiresAt - now) / 1000) };
  }
  
  record.count++;
  return { success: true, remaining: limit - record.count };
}