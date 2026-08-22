'use server';

import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHmac } from 'crypto';

const SESSION_DAYS = 7;
const COOKIE_NAME = 'admin_session';
// Usa a ADMIN_KEY como segredo para assinar os cookies
const SECRET = process.env.ADMIN_KEY || 'super_secret_fallback_key_change_me';

function sign(data: string) {
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

export async function login(formData: FormData) {
  const key = formData.get('key') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  const ADMIN_KEY = process.env.ADMIN_KEY;

  // 1. Tenta login com Chave Mestra (ADMIN_KEY)
  if (key && ADMIN_KEY && key === ADMIN_KEY) {
    const payload = 'MASTER';
    const sig = sign(payload);
    cookies().set(COOKIE_NAME, `${payload}.${sig}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
      path: '/',
    });
    redirect('/');
  }

  // 2. Tenta login com Email/Senha (Admin cadastrado no banco)
  if (email && password) {
    const admin = await db.admin.findUnique({ where: { email } });
    if (!admin) throw new Error('Invalid credentials');

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) throw new Error('Invalid credentials');

    const payload = admin.id;
    const sig = sign(payload);
    cookies().set(COOKIE_NAME, `${payload}.${sig}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
      path: '/',
    });
    redirect('/');
  }

  // 3. Se passou a senha mestra no campo de senha normal
  if (password && ADMIN_KEY && password === ADMIN_KEY) {
    const payload = 'MASTER';
    const sig = sign(payload);
    cookies().set(COOKIE_NAME, `${payload}.${sig}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
      path: '/',
    });
    redirect('/');
  }

  throw new Error('Invalid credentials');
}

export async function logout() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}