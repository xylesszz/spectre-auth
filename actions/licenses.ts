'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

export async function generateLicenseAction() {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  const app = await db.application.findFirst({ where: { status: 'ACTIVE' } });
  if (!app) throw new Error('No active application found.');

  const bytes = randomBytes(15);
  const hex = bytes.toString('hex').toUpperCase();
  const key = `${hex.slice(0,5)}-${hex.slice(5,10)}-${hex.slice(10,15)}-${hex.slice(15,20)}-${hex.slice(20,25)}`;

  const license = await db.license.create({
    data: {
      key,
      appId: app.id,
      status: 'UNUSED',
      maxActivations: 1,
      durationDays: 30,
    }
  });

  await logAudit({
    action: 'LICENSE_CREATED',
    entityType: 'License',
    entityId: license.id,
    actorId: session.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown'
  });

  revalidatePath('/licenses');
}

export async function revokeLicenseAction(licenseId: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  await db.license.update({
    where: { id: licenseId },
    data: { status: 'REVOKED', revokedAt: new Date() }
  });

  await logAudit({
    action: 'LICENSE_REVOKED',
    entityType: 'License',
    entityId: licenseId,
    actorId: session.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown'
  });

  revalidatePath('/licenses');
}