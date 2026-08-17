'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const COOKIE_NAME = 'spectre_admin_key';

export async function login(formData: FormData) {
  const key = String(formData.get('key') ?? '').trim();
  
  // 🔒 SEGURANÇA: Lê APENAS da variável de ambiente. 
  // Se ADMIN_KEY não estiver definida no .env ou na Vercel, o acesso é negado.
  const expectedKey = process.env.ADMIN_KEY;

  if (!expectedKey) {
    console.error("CRITICAL: ADMIN_KEY environment variable is not set.");
    // Em produção, nunca mostre o erro real ao usuário, apenas redirecione
    redirect('/login?error=1'); 
  }

  if (!key || key !== expectedKey) {
    redirect('/login?error=1');
  }

  cookies().set(COOKIE_NAME, 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });

  redirect('/');
}

export async function logout() {
  cookies().delete(COOKIE_NAME);
  redirect('/login');
}