import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { authenticateApp, apiError, clientMeta, logApi } from '@/server/api';
import { hashToken } from '@/lib/security';

const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return apiError('INVALID_INPUT', 'Invalid payload.', 400); }

  const token = await db.appToken.findUnique({ where: { tokenHash: hashToken(body.token) } });
  if (!token || token.appId !== app.id || token.status !== 'ACTIVE') {
    await logApi('API_TOKEN_INVALID', app, meta);
    return apiError('INVALID_TOKEN', 'Token invalid or revoked.', 403);
  }

  await db.appToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
  return NextResponse.json({ success: true, data: { name: token.name, valid: true } });
}