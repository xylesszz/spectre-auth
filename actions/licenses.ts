'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

const CUSTOM_KEY_RE = new RegExp('^[A-Za-z0-9-]{4,64}$');
const USERNAME_RE = new RegExp('^[a-zA-Z0-9]{1,32}$');

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
    entityId,
    actorId: s?.adminId,
    actorType: 'Admin',
    ip: ip(),
    metadata: (meta ?? {}) as any,
  });
}

function reval(id?: string) {
  revalidatePath('/licenses');
  if (id) revalidatePath('/licenses/' + id);
}

function randomKey(prefix: string, separator: string): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const seg = () => Array.from(randomBytes(5)).map((b) => alphabet[b % alphabet.length]).join('');
  const body = separator
    ? seg() + separator + seg() + separator + seg() + separator + seg()
    : seg() + seg() + seg();
  return prefix ? prefix.toUpperCase() + separator + body : body;
}

export async function generateLicenses(fd: FormData) {
  await admin();

  const appId = (fd.get('appId') as string) || null;
  const mode = (fd.get('mode') as string) === 'custom' ? 'custom' : 'random';
  const quantity = parseInt(fd.get('quantity') as string, 10) || 1;
  const duration = fd.get('duration') as string;
  const maxActivations = parseInt(fd.get('maxActivations') as string, 10) || 1;
  const prefix = (fd.get('prefix') as string)?.trim() || '';
  const separator = (fd.get('separator') as string) === 'none' ? '' : '-';

  if (appId && !(await db.application.findUnique({ where: { id: appId } }))) {
    throw new Error('Application not found');
  }
  if (maxActivations < 1 || maxActivations > 50) throw new Error('Invalid max activations');

  const durationDays = duration === 'lifetime' || !duration ? null : parseInt(duration, 10);
  if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays < 1)) {
    throw new Error('Invalid duration');
  }

  const keys: string[] = [];

  if (mode === 'custom') {
    const lines = ((fd.get('customKeys') as string) ?? '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0 || lines.length > 500) {
      throw new Error('Provide 1-500 custom keys (one per line)');
    }
    for (const k of lines) {
      if (!CUSTOM_KEY_RE.test(k)) {
        throw new Error('Invalid key "' + k + '". Only letters, numbers and dashes allowed.');
      }
      keys.push(k.toUpperCase());
    }
    const dupes = await db.license.findMany({ where: { key: { in: keys } }, select: { key: true } });
    if (dupes.length) {
      throw new Error('Keys already exist: ' + dupes.map((d) => d.key).join(', '));
    }
  } else {
    if (quantity < 1 || quantity > 500) throw new Error('Quantity must be 1-500');
    const seen = new Set<string>();
    for (let i = 0; i < quantity; i++) {
      let k = randomKey(prefix, separator);
      while (seen.has(k)) k = randomKey(prefix, separator);
      seen.add(k);
      keys.push(k);
    }
  }

  await db.license.createMany({
    data: keys.map((key) => ({ key, appId, maxActivations, durationDays })),
  });

  await audit('LICENSES_BULK_CREATED', null, { count: keys.length, appId, duration, mode });
  reval();
  return { keys };
}

export async function setLicenseStatus(licenseId: string, status: string) {
  await admin();
  const allowed = ['REVOKED', 'SUSPENDED', 'BANNED', 'ACTIVE', 'UNUSED'];
  if (allowed.indexOf(status) === -1) throw new Error('Invalid status');

  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  const data: any = { status: status as any };
  if (status === 'REVOKED') data.revokedAt = new Date();
  if (status === 'ACTIVE' || status === 'UNUSED') data.revokedAt = null;
  if (status === 'UNUSED') {
    data.activationCount = 0;
    data.hwidHash = null;
    data.activatedAt = null;
    data.userId = null;
    data.expiresAt = null;
  }

  await db.license.update({ where: { id: licenseId }, data });
  await audit('LICENSE_STATUS_' + status, licenseId);
  reval(licenseId);
}

export async function extendLicense(licenseId: string, fd: FormData) {
  await admin();
  const days = parseInt(fd.get('days') as string, 10);
  if (!days || days < 1 || days > 3650) throw new Error('Invalid days (1-3650)');

  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  const base = lic.expiresAt && lic.expiresAt > new Date() ? lic.expiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 86400000);

  await db.license.update({ where: { id: licenseId }, data: { expiresAt } });
  await audit('LICENSE_EXTENDED', licenseId, { days });
  reval(licenseId);
}

export async function resetLicenseHwid(licenseId: string) {
  await admin();
  await db.license.update({ where: { id: licenseId }, data: { hwidHash: null } });
  await audit('LICENSE_HWID_RESET', licenseId);
  reval(licenseId);
}

export async function resetLicenseActivations(licenseId: string) {
  await admin();
  await db.license.update({ where: { id: licenseId }, data: { activationCount: 0, hwidHash: null } });
  await audit('LICENSE_ACTIVATIONS_RESET', licenseId);
  reval(licenseId);
}

export async function assignLicense(licenseId: string, fd: FormData) {
  await admin();
  const username = (fd.get('username') as string)?.trim();
  if (!username || !USERNAME_RE.test(username)) throw new Error('Invalid username');

  const user = await db.user.findUnique({ where: { username } });
  if (!user) throw new Error('User not found');

  await db.license.update({ where: { id: licenseId }, data: { userId: user.id } });
  await audit('LICENSE_ASSIGNED', licenseId, { username });
  reval(licenseId);
}

export async function unassignLicense(licenseId: string) {
  await admin();
  await db.license.update({ where: { id: licenseId }, data: { userId: null } });
  await audit('LICENSE_UNASSIGNED', licenseId);
  reval(licenseId);
}

export async function deleteLicense(licenseId: string) {
  await admin();
  const lic = await db.license.findUnique({ where: { id: licenseId } });
  if (!lic) throw new Error('License not found');

  await db.license.delete({ where: { id: licenseId } });
  await audit('LICENSE_DELETED', licenseId, { key: lic.key });
  reval();
}