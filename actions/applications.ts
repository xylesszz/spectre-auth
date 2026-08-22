'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getAdminSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

function generatePublicId() {
  return `pub_${randomBytes(16).toString('hex')}`;
}

function generateSecret() {
  return `sk_live_${randomBytes(32).toString('hex')}`;
}

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

const ip = () => headers().get('x-forwarded-for') || 'unknown';

export async function createApplication(formData: FormData) {
  const session = await admin();

  const name = formData.get('name') as string;
  
  if (!name || name.length < 2) throw new Error('Name must be at least 2 characters');

  // Gera um slug automático baseado no nome + random para garantir unicidade
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = `${slugBase}-${randomBytes(3).toString('hex')}`;
  
  const publicId = generatePublicId();
  const secret = generateSecret(); // <--- CORREÇÃO: Gerando o secret

  try {
    const app = await db.$transaction(async (tx) => {
      const newApp = await tx.application.create({
        data: {
          name,
          slug,
          appId: publicId,
          appSecret: secret, // <--- CORREÇÃO: Adicionado appSecret aqui
          status: 'ACTIVE',
          hwidLock: true,
          minHwidLength: 16,
          maintenanceMode: false,
          forceHwid: false,
          vpnBlock: false,
          sessionExpirationMinutes: 1440,
          minUsernameLength: 3,
          hwidResetCooldownMinutes: 0,
        },
      });
      return newApp;
    });    

    await logAudit({
      action: 'APPLICATION_CREATED',
      entityType: 'Application',
      entityId: app.id,
      actorId: session.adminId,
      actorType: 'Admin',
      ip: ip(),
      metadata: { name: app.name }
    });

    revalidatePath('/applications');
    return { success: true, appId: app.appId, appSecret: secret };
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error('Application name or ID already exists');
    }
    throw error;
  }
}

export async function deleteApplication(id: string) {
  const session = await admin();
  
  const app = await db.application.findUnique({ where: { id } });
  if (!app) throw new Error('Application not found');

  await db.application.delete({ where: { id } });
  
  await logAudit({
    action: 'APPLICATION_DELETED',
    entityType: 'Application',
    entityId: id,
    actorId: session.adminId,
    actorType: 'Admin',
    ip: ip()
  });

  revalidatePath('/applications');
}

export async function regenerateAppSecret(id: string) {
  const session = await admin();
  
  const newSecret = generateSecret();
  
  await db.application.update({
    where: { id },
    data: { appSecret: newSecret },
  });

  await logAudit({
    action: 'APPLICATION_SECRET_REGENERATED',
    entityType: 'Application',
    entityId: id,
    actorId: session.adminId,
    actorType: 'Admin',
    ip: ip()
  });

  revalidatePath(`/applications/${id}`);
  return { success: true, newSecret };
}

export async function updateAppSettings(id: string, formData: FormData) {
  await admin();

  const name = formData.get('name') as string;
  const hwidLock = formData.get('hwidLock') === 'on';
  const maintenanceMode = formData.get('maintenanceMode') === 'on';
  const forceHwid = formData.get('forceHwid') === 'on';
  const vpnBlock = formData.get('vpnBlock') === 'on';
  const sessionExpirationMinutes = parseInt(formData.get('sessionExpirationMinutes') as string) || 1440;

  if (!name) throw new Error('Name is required');

  await db.application.update({
    where: { id },
    data: {
      name,
      hwidLock,
      maintenanceMode,
      forceHwid,
      vpnBlock,
      sessionExpirationMinutes,
    },
  });

  revalidatePath(`/applications/${id}`);
  revalidatePath('/applications');
}

export async function setAppStatus(id: string, status: string) {
  await admin();
  
  if (!['ACTIVE', 'DISABLED', 'MAINTENANCE'].includes(status)) {
    throw new Error('Invalid status');
  }

  await db.application.update({
    where: { id },
    data: { status: status as any },
  });

  revalidatePath('/applications');
}