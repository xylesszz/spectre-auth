import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticateApp, apiError, clientMeta, securityBlock, createSession, logApi } from '@/server/api';
import { hashHwid, generateRawToken, daysLeft } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { triggerWebhook } from '@/lib/webhook';

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  hwid: z.string().max(256).optional(),
  pcName: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const rl = await rateLimit(`login:${meta.ip}`, 20, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return apiError('INVALID_INPUT', 'Invalid payload.', 400); }

  const hwidHash = body.hwid ? hashHwid(body.hwid) : null;
  if (app.forceHwid && !body.hwid) return apiError('HWID_REQUIRED', 'HWID is required.', 422);

  const block = await securityBlock(app, meta, { ip: meta.ip, hwidHash: hwidHash ?? undefined, username: body.username });
  if (block) { await logApi('API_LOGIN_BLOCKED', app, meta, { reason: block }); return apiError(block, 'Access denied.', 403); }
  if (app.status !== 'ACTIVE') return apiError('APPLICATION_NOT_ACTIVE', 'Application is not active.', 403);

  const user = await db.user.findUnique({
    where: { username: body.username.trim() },
    include: { licenses: { where: { appId: app.id }, orderBy: { createdAt: 'desc' } } },
  });

  if (!user || !user.passwordHash) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'INVALID_CREDENTIALS' });
    return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  }
  if (user.appId && user.appId !== app.id) return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'INVALID_CREDENTIALS' });
    return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  }

  if (user.status === 'BANNED') {
    if (user.bannedUntil && user.bannedUntil < new Date()) {
      await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', banReason: null, bannedUntil: null } });
    } else {
      await logApi('API_LOGIN_FAILED', app, meta, { reason: 'BANNED' });
      return apiError('USER_BANNED', user.banReason || 'Account banned.', 403);
    }
  }
  if (user.status === 'DISABLED') return apiError('USER_DISABLED', 'Account disabled.', 403);

  const license = user.licenses.find((l: any) => l.status === 'ACTIVE');
  if (!license) return apiError('NO_ACTIVE_LICENSE', 'No active license for this application.', 403);
  if (license.expiresAt && license.expiresAt < new Date()) {
    await db.license.update({ where: { id: license.id }, data: { status: 'EXPIRED' } });
    return apiError('LICENSE_EXPIRED', 'License expired.', 403);
  }

  if (app.hwidLock) {
    if (user.hwidHash && hwidHash && user.hwidHash !== hwidHash) {
      await logApi('API_LOGIN_FAILED', app, meta, { reason: 'HWID_MISMATCH' });
      return apiError('HWID_MISMATCH', 'HWID does not match.', 403);
    }
  }

  const rawToken = generateRawToken('sst');
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastIp: meta.ip, pcName: body.pcName ?? user.pcName, hwidHash: app.hwidLock ? (user.hwidHash ?? hwidHash) : user.hwidHash } }),
    db.license.update({ where: { id: license.id }, data: { lastValidationAt: new Date(), lastIp: meta.ip } }),
    createSession(db as any, { userId: user.id, appId: app.id, rawToken, hwidHash, pcName: body.pcName, ip: meta.ip, userAgent: meta.userAgent, expirationMinutes: app.sessionExpirationMinutes }),
  ]);

  await logApi('API_LOGIN_SUCCESS', app, meta, { username: user.username });
  await triggerWebhook('login', { username: user.username, hwid: (user.hwidHash ?? hwidHash)?.slice(0, 12), pc: body.pcName, ip: meta.ip, license: license.key, application: app.name, expiration: license.expiresAt, date: new Date().toISOString() });

  return NextResponse.json({
    success: true,
    message: 'Authenticated',
    data: {
      token: rawToken,
      user: { username: user.username, id: user.id },
      license: { key: license.key, status: license.status, expiration: license.expiresAt, daysLeft: daysLeft(license.expiresAt) },
    },
  });
}