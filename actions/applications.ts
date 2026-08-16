'use server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { generatePublicId, generateSecret } from '@/lib/security';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}
const ip = () => headers().get('x-forwarded-for') || 'unknown';
async function audit(action: string, entityId: string | null, meta?: Record<string, unknown>) {
  const s = await getAdminSession();
  await logAudit({ action, entityType: 'Application', entityId, actorId: s?.adminId, actorType: 'Admin', ip: ip(), metadata: (meta ?? {}) as any });
}

export async function createApplication(fd: FormData) {
  await admin();
  const name = (fd.get('name') as string)?.trim();
  const slug = (fd.get('slug') as string)?.trim().toLowerCase();
  if (!name || name.length < 2) throw new Error('Invalid name');
  if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) throw new Error('Invalid slug (a-z, 0-9, dashes)');
  if (await db.application.findUnique({ where: { slug } })) throw new Error('Slug already in use');

  const app = await db.application.create({ data: { name, slug, version: (fd.get('version') as string) || '1.0.0', description: (fd.get('description') as string) || null } });
  const publicId = generatePublicId();
  const secret = generateSecret();
  await db.applicationCredential.create({ data: { appId: app.id, publicId, secretHash: await bcrypt.hash(secret, 12) } });
  await audit('APPLICATION_CREATED', app.id, { name, slug, publicId });
  revalidatePath('/applications');
  return { publicId, secret };
}

export async function regenerateAppSecret(appId: string) {
  await admin();
  await db.applicationCredential.updateMany({ where: { appId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
  const publicId = generatePublicId();
  const secret = generateSecret();
  await db.applicationCredential.create({ data: { appId, publicId, secretHash: await bcrypt.hash(secret, 12) } });
  await audit('APPLICATION_SECRET_REGENERATED', appId, { publicId });
  revalidatePath('/applications');
  revalidatePath(`/applications/${appId}`);
  return { publicId, secret };
}

export async function setAppStatus(appId: string, status: string) {
  await admin();
  if (!['ACTIVE', 'DISABLED', 'PAUSED'].includes(status)) throw new Error('Invalid status');
  await db.application.update({ where: { id: appId }, data: { status: status as any } });
  await audit(`APPLICATION_STATUS_${status}`, appId);
  revalidatePath('/applications');
  revalidatePath(`/applications/${appId}`);
}

export async function updateAppSettings(appId: string, fd: FormData) {
  await admin();
  const num = (k: string, d: number) => { const v = parseInt(fd.get(k) as string, 10); return Number.isFinite(v) && v >= 0 ? v : d; };
  await db.application.update({
    where: { id: appId },
    data: {
      version: (fd.get('version') as string) || '1.0.0',
      hwidLock: fd.get('hwidLock') === 'on',
      forceHwid: fd.get('forceHwid') === 'on',
      vpnBlock: fd.get('vpnBlock') === 'on',
      maintenanceMode: fd.get('maintenanceMode') === 'on',
      minHwidLength: num('minHwidLength', 10),
      hwidResetCooldownMinutes: num('hwidResetCooldownMinutes', 0),
      sessionExpirationMinutes: num('sessionExpirationMinutes', 60),
      minUsernameLength: num('minUsernameLength', 3),
    },
  });
  await audit('APPLICATION_SETTINGS_UPDATED', appId);
  revalidatePath(`/applications/${appId}`);
}

export async function deleteApplication(appId: string) {
  await admin();
  await db.$transaction([
    db.licenseActivation.deleteMany({ where: { license: { appId } } }),
    db.license.deleteMany({ where: { appId } }),
    db.applicationCredential.deleteMany({ where: { appId } }),
    db.appVariable.deleteMany({ where: { appId } }),
    db.appToken.deleteMany({ where: { appId } }),
    db.blacklistRule.deleteMany({ where: { appId } }),
    db.userSession.deleteMany({ where: { appId } }),
    db.user.updateMany({ where: { appId }, data: { appId: null } }),
    db.application.delete({ where: { id: appId } }),
  ]);
  await audit('APPLICATION_DELETED', appId);
  revalidatePath('/applications');
}