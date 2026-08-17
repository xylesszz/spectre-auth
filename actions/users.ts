'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession } from '@/lib/session';
import bcrypt from 'bcryptjs';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function deleteUser(userId: string) {
  await admin();
  // Deleta sessões primeiro para evitar erro de integridade
  await db.session.deleteMany({ where: { userId } });
  // Desvincula licenças
  await db.license.updateMany({ where: { userId }, data: { userId: null } });
  await db.user.delete({ where: { id: userId } });
  revalidatePath('/users');
}

export async function banUser(userId: string, formData: FormData) {
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
  // Revoga sessões ativas
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

export async function unbanUser(userId: string) {
  await admin();
  await db.user.update({
    where: { id: userId },
    data: { status: 'ACTIVE', banReason: null, bannedUntil: null },
  });
  revalidatePath(`/users/${userId}`);
}

export async function setUserStatus(userId: string, status: string) {
  await admin();
  await db.user.update({ where: { id: userId }, data: { status: status as any } });
  revalidatePath(`/users/${userId}`);
}

export async function resetUserHwid(userId: string) {
  await admin();
  await db.user.update({ where: { id: userId }, data: { hwidHash: null } });
  await db.license.updateMany({ where: { userId }, data: { hwidHash: null } });
  revalidatePath(`/users/${userId}`);
}

export async function revokeUserSessions(userId: string) {
  await admin();
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

export async function resetUserPassword(userId: string, formData: FormData) {
  await admin();
  const password = formData.get('password') as string;
  if (!password || password.length < 6) throw new Error('Password too short');
  
  const hash = await bcrypt.hash(password, 12);
  await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  await db.session.deleteMany({ where: { userId } });
  revalidatePath(`/users/${userId}`);
}

// Funções stub para variáveis de usuário (já que removemos do schema)
// Se você quiser essa funcionalidade real, precisa adicionar o modelo UserVariable no prisma/schema.prisma
export async function setUserVariable(userId: string, formData: FormData) {
  await admin();
  console.log('setUserVariable called (stub)');
  revalidatePath(`/users/${userId}`);
}

export async function deleteUserVariable(varId: string) {
  await admin();
  console.log('deleteUserVariable called (stub)');
  // revalidatePath precisa do userId, mas aqui só temos varId. 
  // Em um sistema real, buscaríamos a variável primeiro.
}