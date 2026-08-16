'use server';

import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminSession, deleteAdminSession } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { validateCsrf } from '@/lib/csrf';
import { loginSchema } from '@/lib/validations';

export async function login(formData: FormData) {
  if (!validateCsrf()) throw new Error('Invalid request origin.');

  const ip = headers().get('x-forwarded-for') || 'unknown';
  const rl = await rateLimit(`admin_login:${ip}`, 5, 60000);
  if (!rl.success) throw new Error('Too many login attempts.');

  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) throw new Error('Invalid credentials.');

  const admin = await db.admin.findUnique({ where: { email: parsed.data.email } });
  if (!admin) {
    await logAudit({ action: 'ADMIN_LOGIN_FAILED', ip, metadata: { email: parsed.data.email } });
    throw new Error('Invalid credentials.');
  }

  const isValid = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!isValid) {
    await logAudit({ action: 'ADMIN_LOGIN_FAILED', actorId: admin.id, ip });
    throw new Error('Invalid credentials.');
  }

  const session = await createAdminSession(admin.id, ip, headers().get('user-agent') || '');
  
  cookies().set('spectre_admin_session', session.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });

  await logAudit({ action: 'ADMIN_LOGIN', actorId: admin.id, ip });
  redirect('/');
}

export async function logout() {
  const cookieStore = cookies();
  const sessionId = cookieStore.get('spectre_admin_session')?.value;
  if (sessionId) {
    await deleteAdminSession(sessionId);
  }
  cookieStore.delete('spectre_admin_session');
  redirect('/login');
}