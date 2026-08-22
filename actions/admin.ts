'use server';

import { redirect } from 'next/navigation';
import { createAdminSession } from '@/lib/session';
import { cookies } from 'next/headers';

export async function login(formData: FormData) {
  // Pega a senha do formulário (pode vir como 'key' ou 'password')
  const key = (formData.get('key') as string) || (formData.get('password') as string);
  const ADMIN_KEY = process.env.ADMIN_KEY;

  if (!ADMIN_KEY) throw new Error('ADMIN_KEY not configured in environment variables');

  if (key === ADMIN_KEY) {
    await createAdminSession();
    redirect('/');
  }

  throw new Error('Senha incorreta');
}

export async function logout() {
  cookies().delete('admin_session');
  redirect('/login');
}