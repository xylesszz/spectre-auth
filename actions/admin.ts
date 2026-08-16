'use server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminSession, deleteAdminSession, getAdminSession } from '@/lib/session';
import { rateLimit } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { validateCsrf } from '@/lib/csrf';
import { loginSchema } from '@/lib/validations';

export async function login(formData: FormData) {
  if (!validateCsrf()) throw new Error('Invalid request origin.');
  const ip = headers().get('x-forwarded-for') || 'unknown';
  const rl = await rateLimit(`admin_login:${ip}`, 5, 60000);
  if (!rl.success) throw new Error('Too many login attempts.');

  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) throw new Error('Invalid credentials.');

  const admin = await db.admin.findUnique({ where: { email: parsed.data.email } });
  if (!admin) { await logAudit({ action: 'ADMIN_LOGIN_FAILED', ip }); throw new Error('Invalid credentials.'); }

  const ok = await bcrypt.compare(parsed.data.password, admin.passwordHash);
  if (!ok) { await logAudit({ action: 'ADMIN_LOGIN_FAILED', actorId: admin.id, ip }); throw new Error('Invalid credentials.'); }

  const session = await createAdminSession(admin.id, ip, headers().get('user-agent') || '');
  cookies().set('spectre_admin_session', session.id, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24, path: '/' });
  await logAudit({ action: 'ADMIN_LOGIN', actorId: admin.id, ip });
  redirect('/');
}

export async function logout() {
  const id = cookies().get('spectre_admin_session')?.value;
  if (id) { await deleteAdminSession(id); await logAudit({ action: 'ADMIN_LOGOUT' }); }
  cookies().delete('spectre_admin_session');
  redirect('/login');
}

export async function changeAdminPassword(fd: FormData) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');
  const current = fd.get('current') as string;
  const next = fd.get('next') as string;
  if (!next || next.length < 8) throw new Error('New password min length: 8');
  const admin = await db.admin.findUnique({ where: { id: session.adminId } });
  if (!admin || !(await bcrypt.compare(current, admin.passwordHash))) throw new Error('Current password incorrect');
  await db.admin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
  await db.adminSession.deleteMany({ where: { adminId: admin.id, NOT: { id: session.id } } });
  await logAudit({ action: 'ADMIN_PASSWORD_CHANGED', actorId: admin.id });
  revalidatePath('/settings');
}

export async function revokeAdminSession(sessionId: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');
  const target = await db.adminSession.findUnique({ where: { id: sessionId } });
  if (target && target.adminId === session.adminId) await deleteAdminSession(sessionId);
  await logAudit({ action: 'ADMIN_SESSION_REVOKED', actorId: session.adminId, entityId: sessionId });
  revalidatePath('/settings');
}