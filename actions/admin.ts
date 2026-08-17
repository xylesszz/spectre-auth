'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { headers } from 'next/headers';

const COOKIE_NAME = 'spectre_admin_session';
const SESSION_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(`admin_session:${token}`).digest('hex');
}

export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const ip = headers().get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown';

  if (!email || !password) redirect('/login?error=1');

  const admin = await db.admin.findUnique({ where: { email } });

  const dummyHash = '$2a$12$invalidhashpaddingtomakeconstanttime000000000000000000000';
  const ok = await bcrypt.compare(password, admin?.passwordHash ?? dummyHash);

  if (!admin || !ok) {
    // log falha
    redirect('/login?error=1');
  }

  const rawToken = randomBytes(48).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);

  await db.adminSession.create({
    data: { tokenHash, adminId: admin.id, expiresAt, ip },
  });

  cookies().set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });

  redirect('/');
}

export async function logout() {
  const c = cookies().get(COOKIE_NAME);
  if (c?.value) {
    const tokenHash = hashToken(c.value);
    await db.adminSession.deleteMany({ where: { tokenHash } }).catch(() => {});
  }
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}