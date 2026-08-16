FILE: app/api/v1/license/validate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { authenticateApp, apiError, clientMeta, securityBlock } from '@/server/api';
import { hashHwid, daysLeft } from '@/lib/security';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({ key: z.string().min(10).max(120), hwid: z.string().max(256).optional() });

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const rl = await rateLimit(`validate:${meta.ip}`, 120, 60000);
  if (!rl.success) return apiError('RATE_LIMIT', 'Too many requests.', 429);

  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch { return apiError('INVALID_INPUT', 'Invalid payload.', 400); }

  const hwidHash = body.hwid ? hashHwid(body.hwid) : null;
  const block = await securityBlock(app, meta, { ip: meta.ip, hwidHash: hwidHash ?? undefined, licenseKey: body.key });
  if (block) return apiError(block, 'Access denied.', 403);

  const license = await db.license.findUnique({ where: { key: body.key.toUpperCase() }, include: { user: true } });
  if (!license || license.appId !== app.id) return apiError('INVALID_LICENSE', 'License not found.', 404);
  if (license.status !== 'ACTIVE') return apiError('LICENSE_NOT_ACTIVE', `Status: ${license.status}`, 403);
  if (license.expiresAt && license.expiresAt < new Date()) {
    await db.license.update({ where: { id: license.id }, data: { status: 'EXPIRED' } });
    return apiError('LICENSE_EXPIRED', 'License expired.', 403);
  }
  if (app.hwidLock && license.hwidHash && hwidHash && license.hwidHash !== hwidHash)
    return apiError('HWID_MISMATCH', 'HWID does not match.', 403);

  await db.license.update({ where: { id: license.id }, data: { lastValidationAt: new Date(), lastIp: meta.ip } });

  return NextResponse.json({
    success: true,
    message: 'License is valid',
    data: {
      username: license.user?.username ?? null,
      license: { status: license.status, expiration: license.expiresAt, daysLeft: daysLeft(license.expiresAt), activatedAt: license.activatedAt },
    },
  });
}