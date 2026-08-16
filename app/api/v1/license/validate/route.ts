import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAppCredentials } from '@/lib/auth';
import { normalizeAndHashHwid } from '@/lib/hwid';
import { rateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { licenseSchema } from '@/lib/validations';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown';
  const rl = await rateLimit(`activate:${ip}`, 30, 60000);
  if (!rl.success) {
    return NextResponse.json({ success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests.' } }, { status: 429 });
  }

  const auth = await verifyAppCredentials(req);
  if (!auth) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid app credentials.' } }, { status: 401 });
  }

  let body;
  try {
    body = licenseSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'Invalid payload.' } }, { status: 400 });
  }

  const hwidHash = normalizeAndHashHwid(body.hwid);

  try {
    const result = await db.$transaction(async (tx) => {
      const license = await tx.license.findUnique({ 
        where: { key: body.key }, 
        include: { app: true } 
      });
      
      if (!license) throw new Error('INVALID_LICENSE');
      if (license.appId !== auth.app.id) throw new Error('APP_MISMATCH');
      if (license.status === 'REVOKED' || license.status === 'SUSPENDED') throw new Error('LICENSE_BLOCKED');
      
      if (license.expiresAt && license.expiresAt < new Date()) {
        await tx.license.update({ where: { id: license.id }, data: { status: 'EXPIRED' } });
        throw new Error('LICENSE_EXPIRED');
      }

      if (license.hwidHash && license.hwidHash !== hwidHash) {
        throw new Error('HWID_MISMATCH');
      }

      let updatedLicense;

      if (license.status === 'UNUSED') {
        if (license.activationCount >= license.maxActivations) throw new Error('ACTIVATION_LIMIT');
        
        const expiresAt = license.durationDays 
          ? new Date(Date.now() + license.durationDays * 86400000) 
          : license.expiresAt;

        let userId = license.userId;
        if (!userId && body.username) {
          const user = await tx.user.upsert({
            where: { username: body.username },
            update: {},
            create: { username: body.username }
          });
          userId = user.id;
        }

        updatedLicense = await tx.license.update({
          where: { id: license.id },
          data: {
            status: 'ACTIVE',
            activatedAt: new Date(),
            expiresAt,
            activationCount: { increment: 1 },
            hwidHash,
            lastValidationAt: new Date(),
            userId
          }
        });
      } else if (license.status === 'ACTIVE') {
        updatedLicense = await tx.license.update({
          where: { id: license.id },
          data: { lastValidationAt: new Date() }
        });
      } else {
        throw new Error('INVALID_STATE');
      }

      await tx.licenseActivation.create({
        data: { 
          licenseId: updatedLicense.id, 
          hwidHash, 
          ip, 
          userAgent: req.headers.get('user-agent') || '' 
        }
      });

      return updatedLicense;
    });

    await logAudit({
      action: 'LICENSE_ACTIVATED',
      entityType: 'License',
      entityId: result.id,
      actorType: 'Application',
      actorId: auth.app.id,
      ip,
      metadata: { hwid: hwidHash.slice(0, 8) + '...' }
    });

    return NextResponse.json({
      success: true,
      data: {
        status: result.status,
        expiresAt: result.expiresAt,
        username: body.username
      }
    });

  } catch (e: any) {
    const code = e.message || 'UNKNOWN_ERROR';
    return NextResponse.json({ 
      success: false, 
      error: { code, message: 'Activation failed.' } 
    }, { status: 400 });
  }
}