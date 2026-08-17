'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession } from '@/lib/session';
import bcrypt from 'bcryptjs';
import { validateCsrf } from '@/lib/csrf';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function deleteUser(userId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.session.deleteMany({ where: { userId } });
  await db.license.updateMany({ where: { userId }, data: { userId: null } });
  await db.user.delete({ where: { id: userId } });
  revalidatePath('/users');
}

export async function banUser(userId: string, formData: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const reason = formData.get('reason') as string;
  const hours = parseInt(formData.get('hours') as string) || 0;

  await db.user.update({
    where: { id: userId },
    data: {
      status: 'BANNED',
      banReason: reason,
      bannedUntil: hours > 0 ? new Date(Date.now() + hours * 3600000) : null,
    },
  });
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

export async function unbanUser(userId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE', banReason: null, bannedUntil: null },
  });
  revalidatePath(`/users/${userId}`);
}

export async function setUserStatus(userId: string, status: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.user.update({ where: { id: userId }, data: { status: status as any } });
  revalidatePath(`/users/${userId}`);
}

export async function resetUserHwid(userId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.user.update({ where: { id: userId }, data: { hwidHash: null } });
  await db.license.updateMany({ where: { userId }, data: { hwidHash: null } });
  revalidatePath(`/users/${userId}`);
}

export async function revokeUserSessions(userId: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

export async function resetUserPassword(userId: string, formData: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();
  const password = formData.get('password') as string;
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const hash = await bcrypt.hash(password, 12);
  await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

export async function createUser(formData: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  const username = formData.get('username') as string;
  const password = formData.get('password') as string;
  const appId = formData.get('appId') as string;

  if (!username || !USERNAME_RE.test(username)) {
    throw new Error('Invalid username format (3-32 chars, a-z A-Z 0-9 _ -)');
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!appId) throw new Error('Application is required');

  const appExists = await db.application.findUnique({ where: { id: appId } });
  if (!appExists) throw new Error('Application not found');

  const hash = await bcrypt.hash(password, 12);

  await db.user.create({
    data: {
      username,
      passwordHash: hash,
      appId,
      status: 'ACTIVE',
    },
  });

  revalidatePath('/users');
}