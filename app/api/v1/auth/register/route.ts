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
  licenseKey: z.string().min(10).max(120),
  hwid: z.string().max(256).optional(),
  pcName: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const rl = await rateLimit(`register:${meta.ip}`, 10, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return apiError('INVALID_INPUT', 'Invalid payload.', 400); }

  if (body.username.trim().length < app.minUsernameLength)
    return apiError('USERNAME_TOO_SHORT', `Minimum username length: ${app.minUsernameLength}.`);
  if (app.forceHwid && !body.hwid) return apiError('HWID_REQUIRED', 'HWID is required.', 422);
  const hwidHash = body.hwid ? hashHwid(body.hwid) : null;
  if (body.hwid && body.hwid.trim().length < app.minHwidLength)
    return apiError('HWID_TOO_SHORT', 'HWID below minimum length.', 422);

  const block = await securityBlock(app, meta, { ip: meta.ip, hwidHash: hwidHash ?? undefined, username: body.username, licenseKey: body.licenseKey });
  if (block) { await logApi('API_REGISTER_BLOCKED', app, meta, { reason: block }); return apiError(block, 'Access denied.', 403); }
  if (app.status !== 'ACTIVE') return apiError('APPLICATION_NOT_ACTIVE', 'Application is not active.', 403);

  try {
    const rawToken = generateRawToken('sst');
    const result = await db.$transaction(async (tx) => {
      const license = await tx.license.findUnique({ where: { key: body.licenseKey.toUpperCase() } });
      if (!license || license.appId !== app.id) throw new Error('INVALID_LICENSE');
      if (license.status === 'BANNED' || license.status === 'REVOKED') throw new Error('LICENSE_BLOCKED');
      if (license.status !== 'UNUSED') throw new Error('LICENSE_ALREADY_USED');

      const existing = await tx.user.findUnique({ where: { username: body.username.trim() } });
      if (existing) throw new Error('USERNAME_TAKEN');

      const passwordHash = await bcrypt.hash(body.password, 12);
      const user = await tx.user.create({
        data: {
          username: body.username.trim(),
          passwordHash,
          appId: app.id,
          hwidHash: app.hwidLock ? hwidHash : null,
          pcName: body.pcName ?? null,
          lastIp: meta.ip,
          lastLoginAt: new Date(),
        },
      });

      const expiresAt = license.durationDays ? new Date(Date.now() + license.durationDays * 86400000) : null;
      
      await tx.license.update({
        where: { id: license.id },
        data: { 
          status: 'ACTIVE', 
          userId: user.id, 
          activatedAt: new Date(), 
          expiresAt, 
          hwidHash: app.hwidLock ? hwidHash : null, 
          lastIp: meta.ip, 
          lastValidationAt: new Date() 
        },
      });
      
      await createSession(tx, { userId: user.id, appId: app.id, rawToken, hwidHash, pcName: body.pcName, ip: meta.ip, userAgent: meta.userAgent, expirationMinutes: app.sessionExpirationMinutes });
      return { user, expiresAt };
    });

    await logApi('API_REGISTER_SUCCESS', app, meta, { username: body.username });
    await triggerWebhook('register', { username: body.username, hwid: hwidHash?.slice(0, 12), pc: body.pcName, ip: meta.ip, application: app.name, expiration: result.expiresAt, date: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      message: 'Registered',
      data: {
        token: rawToken,
        user: { username: result.user.username },
        license: { expiration: result.expiresAt, daysLeft: daysLeft(result.expiresAt) },
      },
    }, { status: 201 });
  } catch (e: any) {
    await logApi('API_REGISTER_FAILED', app, meta, { reason: e.message });
    return apiError(e.message || 'REGISTER_FAILED', 'Registration failed.', 400);
  }
}
