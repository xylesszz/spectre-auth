'use server';

import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';

const SESSION_DAYS = 7;
const COOKIE_NAME = 'admin_session';

export async function loginAdmin(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) throw new Error('Email and password are required');

  const admin = await db.admin.findUnique({ where: { email } });
  if (!admin) throw new Error('Invalid credentials');

  const isValid = await bcrypt.compare(password, admin.passwordHash);
  if (!isValid) throw new Error('Invalid credentials');

  // Gerar token simples para o cookie
  // Como não temos tabela AdminSession no schema, a sessão é gerenciada via cookie.
  // A validação real acontece no middleware ou na lib/session.ts (getAdminSession).
  const token = randomBytes(32).toString('hex');

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60, // 7 dias em segundos
    path: '/',
  });

  redirect('/');
}

export async function logoutAdmin() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}

// Se você tiver uma função de "Login com Chave Fixa" (ADMIN_KEY), ela seria assim:
export async function loginWithKey(key: string) {
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!ADMIN_KEY) throw new Error('ADMIN_KEY not configured');
  
  if (key !== ADMIN_KEY) throw new Error('Invalid key');

  // Seta um cookie simples para indicar que o admin está logado
  cookies().set(COOKIE_NAME, 'key_auth', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: '/',
  });

  redirect('/');
}