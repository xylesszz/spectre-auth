import { NextRequest, NextResponse } from 'next/server';
import { authenticateApp, apiError, clientMeta, logApi } from '@/server/api';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const rl = await rateLimit(`init:${meta.ip}`, 60, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) {
    await logApi('API_INIT_FAILED', null, meta);
    return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);
  }
  if (app.status === 'DISABLED') return apiError('APPLICATION_DISABLED', 'Application disabled.', 403);

  await logApi('API_INIT', app, meta);
  return NextResponse.json({
    success: true,
    message: 'Initialized',
    data: {
      application: { name: app.name, slug: app.slug, version: app.version, status: app.status },
      maintenance: app.maintenanceMode,
    },
  });
}