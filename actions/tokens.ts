'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAdminSession } from '@/lib/session';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { validateCsrf } from '@/lib/csrf';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function createToken(fd: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const s = await admin();
  const appId = fd.get('appId') as string;
  const name = fd.get('name') as string;

  if (!appId) throw new Error('Application is required');

  const app = await db.application.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Application not found');

  const publicId = `pub_${randomBytes(8).toString('hex')}`;
  const rawSecret = `sk_live_${randomBytes(24).toString('hex')}`;
  const secretHash = await bcrypt.hash(rawSecret, 10);

  await db.applicationCredential.create({
    data: {
      publicId,
      secretHash,
      appId,
      status: 'ACTIVE',
    },
  });

  await logAudit({
    action: 'TOKEN_CREATED',
    entityType: 'ApplicationCredential',
    actorId: s.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown',
    metadata: { name, appId, publicId },
  });

  revalidatePath('/tokens');
  return { success: true, publicId, secret: rawSecret };
}

export async function revokeToken(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.applicationCredential.update({
    where: { id },
    data: { status: 'REVOKED' },
  });
  revalidatePath('/tokens');
}

export async function deleteToken(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.applicationCredential.delete({ where: { id } });
  revalidatePath('/tokens');
}