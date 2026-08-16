import { NextRequest, NextResponse } from 'next/server';
import { authenticateApp, apiError, clientMeta, resolveSession } from '@/server/api';
import { rateLimit } from '@/lib/rate-limit';
import { daysLeft } from '@/lib/security';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const rl = await rateLimit(`session:${meta.ip}`, 120, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  const session = await resolveSession(req, app);
  if (!session) return apiError('INVALID_SESSION', 'Session invalid or expired.', 401);

  const license = session.user.licenses[0];
  return NextResponse.json({
    success: true,
    data: {
      user: { username: session.user.username, status: session.user.status },
      license: license ? { key: license.key, expiration: license.expiresAt, daysLeft: daysLeft(license.expiresAt) } : null,
      session: { expiresAt: session.expiresAt },
    },
  });
}