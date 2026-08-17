import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { authenticateApp, apiError, clientMeta, securityBlock, logApi } from '@/server/api';
import { hashHwid, daysLeft } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';
import { triggerWebhook } from '@/lib/webhook';

const schema = z.object({
  key: z.string().min(4).max(120),
  hwid: z.string().max(256).optional(),
  username: z.string().max(64).optional(),
  pcName: z.string().max(120).optional(),
});

const errorStatus: Record<string, number> = {
  INVALID_LICENSE: 404,
  APP_MISMATCH: 403,
  LICENSE_BLOCKED: 403,
  LICENSE_EXPIRED: 403,
  HWID_MISMATCH: 403,
  INVALID_STATE: 409,
};

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);

  const rl = await rateLimit(`activate:${meta.ip}`, 30, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) {
    await logApi('API_ACTIVATE_FAILED', null, meta, { reason: 'UNAUTHORIZED' });
    return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return apiError('INVALID_INPUT', 'Invalid payload.', 400);
  }

  if (app.forceHwid && !body.hwid) return apiError('HWID_REQUIRED', 'HWID is required.', 422);
  if (body.hwid && body.hwid.trim().length < app.minHwidLength)
    return apiError('HWID_TOO_SHORT', `HWID below minimum length (${app.minHwidLength}).`, 422);

  const hwidHash = body.hwid ? hashHwid(body.hwid) : null;

  const block = await securityBlock(app, meta, {
    ip: meta.ip,
    hwidHash: hwidHash ?? undefined,
    username: body.username,
    licenseKey: body.key,
  });
  if (block) {
    await logApi('API_ACTIVATE_BLOCKED', app, meta, { reason: block });
    return apiError(block, 'Access denied.', 403);
  }
  if (app.status !== 'ACTIVE') return apiError('APPLICATION_NOT_ACTIVE', 'Application is not active.', 403);

  try {
    const result = await db.$transaction(async (tx) => {
      const license = await tx.license.findUnique({
        where: { key: body.key.toUpperCase() },
        include: { user: true },
      });

      if (!license) throw new Error('INVALID_LICENSE');
      if (license.appId !== app.id) throw new Error('APP_MISMATCH');
      if (license.status === 'REVOKED' || license.status === 'BANNED')
        throw new Error('LICENSE_BLOCKED');

      if (license.expiresAt && license.expiresAt < new Date()) {
        await tx.license.update({ where: { id: license.id }, data: { status: 'EXPIRED' } });
        throw new Error('LICENSE_EXPIRED');
      }

      if (app.hwidLock && license.hwidHash && hwidHash && license.hwidHash !== hwidHash)
        throw new Error('HWID_MISMATCH');

      let updated;

      if (license.status === 'UNUSED') {
        const expiresAt = license.durationDays
          ? new Date(Date.now() + license.durationDays * 86400000)
          : license.expiresAt;

        let userId = license.userId;
        if (!userId && body.username) {
          const uname = body.username.trim();
          if (/^[a-zA-Z0-9]{1,32}$/.test(uname)) {
            const existing = await tx.user.findUnique({ where: { username: uname } });
            if (existing) {
              userId = existing.id;
            } else {
              // Schema exige passwordHash, geramos um dummy para usuário criado via ativação
              const dummyHash = await bcrypt.hash(Math.random().toString(36), 4);
              const user = await tx.user.create({
                data: { 
                  username: uname, 
                  appId: app.id, 
                  lastIp: meta.ip,
                  passwordHash: dummyHash,
                },
              });
              userId = user.id;
            }
          }
        }

        updated = await tx.license.update({
          where: { id: license.id },
          data: {
            status: 'ACTIVE',
            activatedAt: new Date(),
            expiresAt,
            hwidHash: app.hwidLock ? (license.hwidHash ?? hwidHash) : license.hwidHash,
            lastValidationAt: new Date(),
            lastIp: meta.ip,
            userId,
          },
        });
      } else if (license.status === 'ACTIVE') {
        updated = await tx.license.update({
          where: { id: license.id },
          data: { lastValidationAt: new Date(), lastIp: meta.ip },
        });
      } else {
        throw new Error('INVALID_STATE');
      }

      // Removido: tx.licenseActivation.create (não existe no schema)

      return updated;
    });

    await logApi('API_LICENSE_ACTIVATED', app, meta, { license: result.id });
    await triggerWebhook('license_activated', {
      username: body.username ?? null,
      hwid: hwidHash ? hwidHash.slice(0, 12) : null,
      pc: body.pcName ?? null,
      ip: meta.ip,
      license: result.key,
      application: app.name,
      expiration: result.expiresAt,
      date: new Date().toISOString(),
      action: 'license_activated',
    });

    return NextResponse.json({
      success: true,
      message: 'License activated',
      data: {
        status: result.status,
        expiration: result.expiresAt,
        daysLeft: daysLeft(result.expiresAt),
      },
    });
  } catch (e: any) {
    const code = typeof e.message === 'string' ? e.message : 'ACTIVATION_FAILED';
    await logApi('API_LICENSE_ACTIVATE_FAILED', app, meta, { reason: code });
    return apiError(code, 'Activation failed.', errorStatus[code] ?? 400);
  }
}