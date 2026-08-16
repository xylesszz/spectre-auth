import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApp, apiError, clientMeta, logApi } from '@/server/api';
import { hashToken } from '@/lib/security';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  const raw = req.headers.get('x-session-token');
  if (!raw) return apiError('NO_SESSION', 'Session token missing.', 400);

  const session = await db.userSession.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (session && session.appId === app.id) {
    await db.userSession.delete({ where: { id: session.id } });
    await logApi('API_LOGOUT', app, meta);
  }
  return NextResponse.json({ success: true, message: 'Logged out' });
}