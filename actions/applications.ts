'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getAdminSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';
import bcrypt from 'bcryptjs';
import { validateCsrf } from '@/lib/csrf';

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
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const session = await admin();

  const name = formData.get('name') as string;
  if (!name || name.length < 2) throw new Error('Name must be at least 2 characters');

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const slug = `${slugBase}-${randomBytes(3).toString('hex')}`;

  const publicId = generatePublicId();
  const secret = generateSecret();
  const secretHash = await bcrypt.hash(secret, 10);

  try {
    const app = await db.$transaction(async (tx) => {
      const newApp = await tx.application.create({
        data: {
          name,
          slug,
          appId: publicId,
          appSecret: '', // campo obrigatório no schema, mas não usado
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

      await tx.applicationCredential.create({
        data: {
          publicId,
          secretHash,
          appId: newApp.id,
          status: 'ACTIVE',
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
      metadata: { name: app.name },
    });

    revalidatePath('/applications');
    // Retorna o secret para exibição única (não via URL)
    return { success: true, appId: app.id, secret };
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error('Application name or ID already exists');
    }
    throw error;
  }
}

export async function regenerateAppSecret(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const session = await admin();

  const app = await db.application.findUnique({ where: { id } });
  if (!app) throw new Error('Application not found');

  const newSecret = generateSecret();
  const secretHash = await bcrypt.hash(newSecret, 10);

  const existingCred = await db.applicationCredential.findFirst({
    where: { appId: id, status: 'ACTIVE' },
  });

  if (existingCred) {
    await db.applicationCredential.update({
      where: { id: existingCred.id },
      data: { secretHash },
    });
  } else {
    const newPublicId = generatePublicId();
    await db.applicationCredential.create({
      data: {
        publicId: newPublicId,
        secretHash,
        appId: id,
        status: 'ACTIVE',
      },
    });
    await db.application.update({
      where: { id },
      data: { appId: newPublicId },
    });
  }

  await db.applicationCredential.updateMany({
    where: { appId: id, status: 'ACTIVE', NOT: { id: existingCred?.id } },
    data: { status: 'INACTIVE' },
  });

  await logAudit({
    action: 'APP_SECRET_REGENERATED',
    entityType: 'Application',
    entityId: id,
    actorId: session.adminId,
    actorType: 'Admin',
  });

  revalidatePath(`/applications/${id}`);
  return { success: true, newSecret };
}

export async function deleteApplication(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
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
    ip: ip(),
  });

  revalidatePath('/applications');
}

export async function regenerateSecret(id: string) {
  return regenerateAppSecret(id);
}

export async function updateAppSettings(id: string, formData: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();

  const name = formData.get('name') as string;
  const hwidLock = formData.get('hwidLock') === 'on';
  const maintenanceMode = formData.get('maintenanceMode') === 'on';
  const forceHwid = formData.get('forceHwid') === 'on';
  const vpnBlock = formData.get('vpnBlock') === 'on';
  const sessionExpirationMinutes = parseInt(formData.get('sessionExpirationMinutes') as string) || 1440;
  const minHwidLength = parseInt(formData.get('minHwidLength') as string) || 16;
  const minUsernameLength = parseInt(formData.get('minUsernameLength') as string) || 3;
  const hwidResetCooldownMinutes = parseInt(formData.get('hwidResetCooldownMinutes') as string) || 0;
  const version = formData.get('version') as string || '1.0.0';

  if (!name) throw new Error('Name is required');

  await db.application.update({
    where: { id },
    data: {
      name,
      version,
      hwidLock,
      maintenanceMode,
      forceHwid,
      vpnBlock,
      sessionExpirationMinutes,
      minHwidLength,
      minUsernameLength,
      hwidResetCooldownMinutes,
    },
  });

  revalidatePath(`/applications/${id}`);
  revalidatePath('/applications');
}

export async function setAppStatus(id: string, status: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
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