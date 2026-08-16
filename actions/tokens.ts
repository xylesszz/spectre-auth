'use server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import { generateRawToken, hashToken } from '@/lib/security';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function createToken(fd: FormData) {
  const s = await admin();
  const appId = fd.get('appId') as string;
  const name = (fd.get('name') as string)?.trim();
  if (!name) throw new Error('Token name required');
  if (!(await db.application.findUnique({ where: { id: appId } }))) throw new Error('Application not found');
  const raw = generateRawToken('spt');
  const token = await db.appToken.create({ data: { appId, name, tokenHash: hashToken(raw) } });
  await logAudit({ action: 'TOKEN_CREATED', entityType: 'AppToken', entityId: token.id, actorId: s.adminId, actorType: 'Admin', ip: headers().get('x-forwarded-for') || 'unknown', metadata: { name } as any });
  revalidatePath('/tokens');
  return { token: raw };
}

export async function revokeToken(tokenId: string) {
  const s = await admin();
  await db.appToken.update({ where: { id: tokenId }, data: { status: 'REVOKED', revokedAt: new Date() } });
  await logAudit({ action: 'TOKEN_REVOKED', entityType: 'AppToken', entityId: tokenId, actorId: s.adminId, actorType: 'Admin', ip: headers().get('x-forwarded-for') || 'unknown' });
  revalidatePath('/tokens');
}

export async function deleteToken(tokenId: string) {
  const s = await admin();
  await db.appToken.delete({ where: { id: tokenId } });
  await logAudit({ action: 'TOKEN_DELETED', entityType: 'AppToken', entityId: tokenId, actorId: s.adminId, actorType: 'Admin', ip: headers().get('x-forwarded-for') || 'unknown' });
  revalidatePath('/tokens');
}
