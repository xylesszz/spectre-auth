import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticateApp, apiError, clientMeta, securityBlock, logApi } from '@/server/api';
import { hashHwid, hashToken, daysLeft } from '@/lib/security';
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
  if (!rl.success) {
    await logApi('API_LOGIN_RATE_LIMIT', null, meta);
    return apiError('RATE_LIMIT', 'Too many requests. Try again later.', 429);
  }

  const app = await authenticateApp(req);
  if (!app) {
    await logApi('API_LOGIN_FAILED', null, meta, { reason: 'INVALID_APP_CREDENTIALS' });
    return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'INVALID_INPUT' });
    return apiError('INVALID_INPUT', 'Invalid payload.', 400);
  }

  const hwidHash = body.hwid ? hashHwid(body.hwid) : null;
  if (app.forceHwid && !body.hwid) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'HWID_REQUIRED', username: body.username });
    return apiError('HWID_REQUIRED', 'HWID is required for this application.', 422);
  }
  if (body.hwid && body.hwid.trim().length < app.minHwidLength) {
    return apiError('HWID_TOO_SHORT', `HWID must be at least ${app.minHwidLength} characters.`, 422);
  }

  const block = await securityBlock(app, meta, {
    ip: meta.ip,
    hwidHash: hwidHash ?? undefined,
    username: body.username,
  });
  if (block) {
    await logApi('API_LOGIN_BLOCKED', app, meta, { reason: block, username: body.username });
    return apiError(block, 'Access denied.', 403);
  }
  if (app.status !== 'ACTIVE') {
    return apiError('APPLICATION_NOT_ACTIVE', 'Application is not active.', 403);
  }

  const user = await db.user.findUnique({
    where: { username: body.username.trim() },
    include: {
      licenses: {
        where: { appId: app.id },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!user || !user.passwordHash) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'INVALID_CREDENTIALS', username: body.username });
    return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  }

  if (user.appId && user.appId !== app.id) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'APP_MISMATCH', username: body.username });
    return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  }

  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'INVALID_CREDENTIALS', username: body.username });
    return apiError('INVALID_CREDENTIALS', 'Invalid username or password.', 401);
  }

  if (user.status === 'BANNED') {
    if (user.bannedUntil && user.bannedUntil < new Date()) {
      await db.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', banReason: null, bannedUntil: null } });
    } else {
      await logApi('API_LOGIN_FAILED', app, meta, { reason: 'USER_BANNED', username: body.username });
      return apiError('USER_BANNED', user.banReason || 'Account is banned.', 403);
    }
  }
  if (user.status === 'DISABLED') {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'USER_DISABLED', username: body.username });
    return apiError('USER_DISABLED', 'Account is disabled.', 403);
  }

  let license = user.licenses.find((l) => l.status === 'ACTIVE' && l.appId === app.id);
  if (!license) {
    const unused = user.licenses.find((l) => l.status === 'UNUSED');
    if (unused) {
      const expiresAt = unused.durationDays
        ? new Date(Date.now() + unused.durationDays * 86400000)
        : null;
      license = await db.license.update({
        where: { id: unused.id },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          expiresAt,
          hwidHash: app.hwidLock ? hwidHash : null,
          lastValidationAt: new Date(),
          lastIp: meta.ip,
          appId: app.id,
        },
      });
    }
  }

  if (!license) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'NO_ACTIVE_LICENSE', username: body.username });
    return apiError('NO_ACTIVE_LICENSE', 'No active license for this application.', 403);
  }

  if (license.expiresAt && license.expiresAt < new Date()) {
    await db.license.update({ where: { id: license.id }, data: { status: 'EXPIRED' } });
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'LICENSE_EXPIRED', username: body.username });
    return apiError('LICENSE_EXPIRED', 'License has expired.', 403);
  }

  if (app.hwidLock) {
    if (license.hwidHash && hwidHash && license.hwidHash !== hwidHash) {
      await logApi('API_LOGIN_FAILED', app, meta, { reason: 'HWID_MISMATCH', username: body.username });
      return apiError('HWID_MISMATCH', 'HWID does not match the one bound to this license.', 403);
    }
    if (user.hwidHash && hwidHash && user.hwidHash !== hwidHash) {
      await logApi('API_LOGIN_FAILED', app, meta, { reason: 'HWID_MISMATCH_USER', username: body.username });
      return apiError('HWID_MISMATCH', 'HWID does not match the one bound to this account.', 403);
    }
  }

  const crypto = await import('crypto');
  const rawToken = `sst_${crypto.randomBytes(32).toString('hex')}`;

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          lastIp: meta.ip,
          pcName: body.pcName ?? user.pcName,
          hwidHash: app.hwidLock ? (user.hwidHash ?? hwidHash) : user.hwidHash,
        },
      });

      await tx.license.update({
        where: { id: license!.id },
        data: { lastValidationAt: new Date(), lastIp: meta.ip },
      });

      await tx.session.create({
        data: {
          userId: user.id,
          appId: app.id,
          tokenHash: hashToken(rawToken),
          hwidHash: hwidHash ?? null,
          pcName: body.pcName ?? null,
          ip: meta.ip,
          userAgent: meta.userAgent,
          expiresAt: new Date(Date.now() + app.sessionExpirationMinutes * 60000),
        },
      });
    });
  } catch (err: any) {
    await logApi('API_LOGIN_FAILED', app, meta, { reason: 'DB_ERROR', username: body.username, error: err.message });
    return apiError('LOGIN_FAILED', 'Failed to create session. Try again.', 500);
  }

  await triggerWebhook('login', {
    username: user.username,
    hwid: (user.hwidHash ?? hwidHash)?.slice(0, 16),
    pc: body.pcName,
    ip: meta.ip,
    license: license.key,
    application: app.name,
    expiration: license.expiresAt,
    daysLeft: daysLeft(license.expiresAt),
    date: new Date().toISOString(),
  });

  await logApi('API_LOGIN_SUCCESS', app, meta, { username: user.username });

  return new Response(JSON.stringify({
    success: true,
    message: 'Authenticated',
    data: {
      token: rawToken,
      user: { username: user.username, id: user.id },
      license: {
        key: license.key,
        status: license.status,
        expiration: license.expiresAt ? license.expiresAt.toISOString() : null,
        daysLeft: daysLeft(license.expiresAt),
      },
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
