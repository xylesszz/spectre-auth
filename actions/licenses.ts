'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { validateCsrf } from '@/lib/csrf';

const USERNAME_RE = new RegExp('^[a-zA-Z0-9]{1,32}$');
const MAX_CUSTOM_KEYS = 500;

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

const ip = () => headers().get('x-forwarded-for') || 'unknown';

async function audit(action: string, entityId: string | null, meta?: Record<string, unknown>) {
  const s = await getAdminSession();
  await logAudit({
    action,
    entityType: 'License',
    entityId: entityId ?? undefined,
    actorId: s?.adminId,
    actorType: 'Admin',
    ip: ip(),
    metadata: (meta ?? {}) as any,
  });
}

function reval(id?: string) {
  revalidatePath('/licenses');
  if (id) revalidatePath(`/licenses/${id}`);
}

function randomKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = () => Array.from(randomBytes(4)).map((b) => alphabet[b % alphabet.length]).join('');
  return `SPC-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export async function resetLicenseHwid(licenseId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  await db.license.update({
    where: { id: licenseId },
    data: { hwidHash: null },
  });

  await logAudit({
    action: 'LICENSE_HWID_RESET',
    entityType: 'License',
    entityId: licenseId,
    actorId: session.adminId,
    actorType: 'Admin',
  });

  revalidatePath(`/licenses/${licenseId}`);
}

export async function generateLicenses(fd: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();

  const appId = fd.get('appId') as string;
  const count = Math.min(Math.max(parseInt(fd.get('count') as string) || 1, 1), 100);
  const duration = fd.get('duration') as string;
  const mode = fd.get('mode') as string;

  if (!appId) throw new Error('Application ID is required');

  // Validação: app existe
  const app = await db.application.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Application not found');

  const durationDays = duration === 'lifetime' ? null : parseInt(duration);
  if (duration !== 'lifetime' && (isNaN(durationDays as number) || (durationDays as number) < 1)) {
    throw new Error('Invalid duration');
  }

  let keys: string[] = [];

  if (mode === 'custom') {
    const customKeys = fd.get('customKeys') as string;
    keys = customKeys.split('\n').map(k => k.trim()).filter(k => k.length > 0);
    if (keys.length > MAX_CUSTOM_KEYS) {
      throw new Error(`Max ${MAX_CUSTOM_KEYS} keys per batch`);
    }
    keys = keys.slice(0, MAX_CUSTOM_KEYS).map(k => k.toUpperCase().slice(0, 120));
  } else {
    for (let i = 0; i < count; i++) {
      keys.push(randomKey());
    }
  }

  if (keys.length === 0) throw new Error('No keys generated');

  await db.license.createMany({
    data: keys.map((key) => ({
      key,
      appId,
      durationDays,
      status: 'UNUSED',
    })),
    skipDuplicates: true,
  });

  await audit('LICENSES_BULK_CREATED', null, { count: keys.length, appId, duration, mode });
  revalidatePath('/licenses');
  return { success: true, count: keys.length };
}

export async function setLicenseStatus(licenseId: string, status: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const allowed = ['REVOKED', 'ACTIVE', 'UNUSED', 'EXPIRED'];
  if (!allowed.includes(status)) throw new Error('Invalid status');

  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  const data: any = { status };
  if (status === 'UNUSED') {
    data.hwidHash = null;
    data.activatedAt = null;
    data.userId = null;
    data.expiresAt = null;
    data.lastValidationAt = null;
    data.lastIp = null;
  }

  await db.license.update({ where: { id: licenseId }, data });
  await audit(`LICENSE_STATUS_${status}`, licenseId);
  reval(licenseId);
}

export async function extendLicense(licenseId: string, fd: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const days = parseInt(fd.get('days') as string, 10);
  if (!days || days < 1 || days > 3650) throw new Error('Invalid days (1-3650)');

  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  const base = lic.expiresAt && lic.expiresAt > new Date() ? lic.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 86400000);

  await db.license.update({
    where: { id: licenseId },
    data: { expiresAt, status: 'ACTIVE' },
  });

  await audit('LICENSE_EXTENDED', licenseId, { days });
  reval(licenseId);
}

export async function resetLicenseActivations(licenseId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  await db.license.update({
    where: { id: licenseId },
    data: { hwidHash: null },
  });

  revalidatePath('/licenses');
  revalidatePath(`/licenses/${licenseId}`);
}

export async function assignLicense(licenseId: string, fd: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const username = (fd.get('username') as string)?.trim();
  if (!username || !USERNAME_RE.test(username)) throw new Error('Invalid username');

  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error('User not found');

  await db.license.update({
    where: { id: licenseId },
    data: { userId: user.id },
  });

  await audit('LICENSE_ASSIGNED', licenseId, { username });
  reval(licenseId);
}

export async function unassignLicense(licenseId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.license.update({
    where: { id: licenseId },
    data: { userId: null },
  });
  await audit('LICENSE_UNASSIGNED', licenseId);
  reval(licenseId);
}

export async function deleteLicense(licenseId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  await db.license.delete({ where: { id: licenseId } });
  await audit('LICENSE_DELETED', licenseId, { key: lic.key });
  reval();
}