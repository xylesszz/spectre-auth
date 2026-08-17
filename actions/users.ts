'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';

const USERNAME_RE = new RegExp('^[a-zA-Z0-9]{1,32}$');

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

const ip = () => headers().get('x-forwarded-for') || 'unknown';

async function audit(action: string, entityId: string | null, meta?: Record<string, unknown>) {
  const s = await getAdminSession();
  await logAudit({ 
    action, 
    entityType: 'User', 
    entityId: entityId ?? undefined, 
    actorId: s?.adminId, 
    actorType: 'Admin', 
    ip: ip(), 
    metadata: (meta ?? {}) as any 
  });
}

function reval(id?: string) {
  revalidatePath('/users');
  if (id) revalidatePath(`/users/${id}`);
}

export async function createUser(fd: FormData) {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');

  const username = (fd.get('username') as string)?.trim();
  const password = fd.get('password') as string;
  const appId = fd.get('appId') as string;
  const licenseId = fd.get('licenseId') as string | null;

  if (!username || !password || !appId) throw new Error('Missing required fields');
  if (!USERNAME_RE.test(username)) throw new Error('Invalid username format');

  // Verifica se a aplicação existe
  const app = await db.application.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Application not found');

  // Verifica se usuário já existe
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) throw new Error('Username already taken');

  let license = null;
  if (licenseId) {
    license = await db.license.findUnique({ where: { id: licenseId } });
    if (!license) throw new Error('License not found');
  }

  // Cria o usuário (sem email, pois não está no schema atual)
  const user = await db.user.create({
    data: { 
      username, 
      passwordHash: await bcrypt.hash(password, 12), 
      appId: appId,
      status: 'ACTIVE'
    },
  });

  // Vincula a licença se fornecida
  if (license) {
    await db.license.update({ 
      where: { id: license.id }, 
      data: { userId: user.id, status: 'ACTIVE', activatedAt: new Date() } 
    });
  }

  await audit('USER_CREATED', user.id, { username });
  revalidatePath('/users');
  return { success: true };
}

export async function setUserStatus(userId: string, status: string) {
  await admin();
  if (status !== 'ACTIVE' && status !== 'DISABLED' && status !== 'BANNED') {
    throw new Error('Invalid status');
  }
  
  await db.user.update({ 
    where: { id: userId }, 
    data: { 
      status: status as any, 
      banReason: status === 'ACTIVE' ? null : undefined, 
      bannedUntil: status === 'ACTIVE' ? null : undefined 
    } 
  });
  
  await audit(status === 'ACTIVE' ? 'USER_ENABLED' : `USER_${status}`, userId);
  reval(userId);
}

export async function banUser(userId: string, fd: FormData) {
  await admin();
  const hours = parseInt(fd.get('hours') as string, 10);
  const reason = (fd.get('reason') as string) || 'Banned by administrator';
  
  await db.user.update({
    where: { id: userId },
    data: {
      status: 'BANNED',
      banReason: reason,
      bannedUntil: Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null,
    },
  });

  // CORREÇÃO: db.session em vez de db.userSession
  await db.session.deleteMany({ where: { userId } });
  
  await audit('USER_BANNED', userId, { reason, hours });
  reval(userId);
}

export async function unbanUser(userId: string) {
  await admin();
  await db.user.update({ 
    where: { id: userId }, 
    data: { status: 'ACTIVE', banReason: null, bannedUntil: null } 
  });
  await audit('USER_UNBANNED', userId);
  reval(userId);
}

export async function resetUserHwid(userId: string) {
  await admin();
  
  // CORREÇÃO: Removido lastHwidResetAt pois não existe no schema
  await db.user.update({ 
    where: { id: userId }, 
    data: { hwidHash: null } 
  });
  
  // Reseta HWID das licenças do usuário também
  await db.license.updateMany({ 
    where: { userId }, 
    data: { hwidHash: null } 
  });
  
  await audit('USER_HWID_RESET', userId);
  reval(userId);
}

export async function resetUserPassword(userId: string, fd: FormData) {
  await admin();
  const password = fd.get('password') as string;
  if (!password || password.length < 1) throw new Error('Password is required');
  
  await db.user.update({ 
    where: { id: userId }, 
    data: { passwordHash: await bcrypt.hash(password, 12) } 
  });
  
  // CORREÇÃO: db.session em vez de db.userSession
  await db.session.deleteMany({ where: { userId } });
  
  await audit('USER_PASSWORD_RESET', userId);
  reval(userId);
}

export async function revokeUserSessions(userId: string) {
  await admin();
  // CORREÇÃO: db.session em vez de db.userSession
  await db.session.deleteMany({ where: { userId } });
  await audit('USER_SESSIONS_REVOKED', userId);
  reval(userId);
}

export async function deleteUser(userId: string) {
  await admin();
  
  // Deleta sessões primeiro para evitar erro de integridade referencial
  await db.session.deleteMany({ where: { userId } });
  
  // Desvincula licenças (opcional, ou pode deletar)
  await db.license.updateMany({ where: { userId }, data: { userId: null } });
  
  await db.user.delete({ where: { id: userId } });
  await audit('USER_DELETED', userId);
  reval();
}

// REMOVIDO: setUserVariable e deleteUserVariable
// Pois o modelo UserVariable não existe no schema atual.
// Se precisar dessa funcionalidade, adicione o modelo ao prisma/schema.prisma primeiro.