'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { headers } from 'next/headers';

const COOKIE_NAME = 'spectre_admin_session';
const SESSION_DAYS = 7;

function hashToken(token: string): string {
  return createHash('sha256').update(`admin_session:${token}`).digest('hex');
}

export async function login(formData: FormData) {
  const key = String(formData.get('key') ?? '').trim();
  const ip = headers().get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? 'unknown';

  const admin = await db.admin.findFirst();
  if (!admin) {
    throw new Error('Admin not found. Run bootstrap first.');
  }

  const expectedKey = process.env.ADMIN_KEY;
  if (!expectedKey) {
    throw new Error('ADMIN_KEY not configured in environment');
  }

  const keyBuffer = Buffer.from(key);
  const expectedBuffer = Buffer.from(expectedKey);

  let valid = false;
  if (keyBuffer.length === expectedBuffer.length) {
    try {
      valid = timingSafeEqual(keyBuffer, expectedBuffer);
    } catch {
      valid = false;
    }
  }

  if (!valid) {
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