'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';

const USERNAME_RE = new RegExp('^[a-zA-Z0-9]{1,32}$');

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

const ip = () => headers().get('x-forwarded-for') || 'unknown';

async function audit(action: string, entityId: string | null, meta?: Record<string, unknown>) {
  const s = await getAdminSession();
  await logAudit({ action, entityType: 'User', entityId, actorId: s?.adminId, actorType: 'Admin', ip: ip(), metadata: (meta ?? {}) as any });
}

function reval(id?: string) {
  revalidatePath('/users');
  if (id) revalidatePath('/users/' + id);
}

export async function createUser(fd: FormData) {
  await admin();
  const username = (fd.get('username') as string)?.trim();
  const password = fd.get('password') as string;
  const email = (fd.get('email') as string)?.trim() || null;
  const appId = (fd.get('appId') as string) || null;
  const licenseKey = (fd.get('licenseKey') as string)?.trim().toUpperCase() || null;

  if (!username || !USERNAME_RE.test(username)) {
    throw new Error('Username: 1-32 chars, letters and numbers only');
  }
  if (!password || password.length < 1) {
    throw new Error('Password is required');
  }

  const app = appId ? await db.application.findUnique({ where: { id: appId } }) : null;
  if (appId && !app) throw new Error('Application not found');
  if (await db.user.findUnique({ where: { username } })) throw new Error('Username already exists');

  let license = null;
  if (licenseKey) {
    license = await db.license.findUnique({ where: { key: licenseKey } });
    if (!license || (appId && license.appId !== appId)) throw new Error('License not found for this application');
    if (license.status !== 'UNUSED') throw new Error('License already used');
  }

  const user = await db.user.create({
    data: { username, email, passwordHash: await bcrypt.hash(password, 12), appId },
  });
  if (license) await db.license.update({ where: { id: license.id }, data: { userId: user.id } });

  await audit('USER_CREATED', user.id, { username });
  reval();
  return null;
}

export async function setUserStatus(userId: string, status: string) {
  await admin();
  if (status !== 'ACTIVE' && status !== 'DISABLED') throw new Error('Invalid status');
  await db.user.update({ where: { id: userId }, data: { status: status as any, banReason: null, bannedUntil: null } });
  await audit(status === 'ACTIVE' ? 'USER_ENABLED' : 'USER_DISABLED', userId);
  reval(userId);
}

export async function banUser(userId: string, fd: FormData) {
  await admin();
  const hours = parseInt(fd.get('hours') as string, 10);
  await db.user.update({
    where: { id: userId },
    data: {
      status: 'BANNED',
      banReason: (fd.get('reason') as string) || 'Banned by administrator',
      bannedUntil: Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null,
    },
  });
  await db.userSession.deleteMany({ where: { userId } });
  await audit('USER_BANNED', userId);
  reval(userId);
}

export async function unbanUser(userId: string) {
  await admin();
  await db.user.update({ where: { id: userId }, data: { status: 'ACTIVE', banReason: null, bannedUntil: null } });
  await audit('USER_UNBANNED', userId);
  reval(userId);
}

export async function resetUserHwid(userId: string) {
  await admin();
  await db.user.update({ where: { id: userId }, data: { hwidHash: null, lastHwidResetAt: new Date() } });
  await db.license.updateMany({ where: { userId }, data: { hwidHash: null } });
  await audit('USER_HWID_RESET', userId);
  reval(userId);
}

export async function resetUserPassword(userId: string, fd: FormData) {
  await admin();
  const password = fd.get('password') as string;
  if (!password || password.length < 1) throw new Error('Password is required');
  await db.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  await db.userSession.deleteMany({ where: { userId } });
  await audit('USER_PASSWORD_RESET', userId);
  reval(userId);
}

export async function revokeUserSessions(userId: string) {
  await admin();
  await db.userSession.deleteMany({ where: { userId } });
  await audit('USER_SESSIONS_REVOKED', userId);
  reval(userId);
}

export async function deleteUser(userId: string) {
  await admin();
  await db.user.delete({ where: { id: userId } });
  await audit('USER_DELETED', userId);
  reval();
}

export async function setUserVariable(userId: string, fd: FormData) {
  await admin();
  const name = (fd.get('name') as string)?.trim();
  const value = (fd.get('value') as string) ?? '';
  if (!name) throw new Error('Variable name required');
  await db.userVariable.upsert({ where: { userId_name: { userId, name } }, update: { value }, create: { userId, name, value } });
  await audit('USER_VARIABLE_SET', userId, { name });
  reval(userId);
}

export async function deleteUserVariable(varId: string) {
  await admin();
  const v = await db.userVariable.delete({ where: { id: varId } });
  await audit('USER_VARIABLE_DELETED', v.userId, { name: v.name });
  reval(v.userId);
}