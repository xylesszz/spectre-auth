'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'spectre_admin_key';

export async function login(formData: FormData) {
  const key = String(formData.get('key') ?? '').trim();
  const expected = process.env.ADMIN_KEY || 'brenner123';

  if (!key || key !== expected) {
    redirect('/login?error=1');
  }

  cookies().set(COOKIE_NAME, 'ok', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });

  redirect('/');
}

export async function logout() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}