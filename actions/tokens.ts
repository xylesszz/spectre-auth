'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAdminSession } from '@/lib/session';
import { headers } from 'next/headers';
import { randomBytes, createHash } from 'crypto';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function createToken(fd: FormData) {
  const s = await admin();
  const appId = fd.get('appId') as string;
  const name = fd.get('name') as string; // Usado apenas para log/auditoria

  if (!appId) throw new Error('Application is required');

  const app = await db.application.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Application not found');

  const publicId = `pub_${randomBytes(8).toString('hex')}`;
  const rawSecret = `sk_live_${randomBytes(24).toString('hex')}`;
  
  await db.applicationCredential.create({
    data: {
      publicId,
      secretHash: hashToken(rawSecret), // Nunca salvamos o secret em texto puro
      appId,
      status: 'ACTIVE',
    }
  });

  await logAudit({ 
    action: 'TOKEN_CREATED', 
    entityType: 'ApplicationCredential', 
    actorId: s.adminId, 
    actorType: 'Admin', 
    ip: headers().get('x-forwarded-for') || 'unknown', 
    metadata: { name, appId, publicId } 
  });
  
  revalidatePath('/tokens');
}

export async function revokeToken(id: string) {
  await admin();
  await db.applicationCredential.update({
    where: { id },
    data: { status: 'REVOKED' }
  });
  revalidatePath('/tokens');
}

export async function deleteToken(id: string) {
  await admin();
  await db.applicationCredential.delete({ where: { id } });
  revalidatePath('/tokens');
}