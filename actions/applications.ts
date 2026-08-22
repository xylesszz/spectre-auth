'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { randomBytes, createHash } from 'crypto';
import { getAdminSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

function generateSecret() {
  return `sk_live_${randomBytes(32).toString('hex')}`;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
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
  const slug = formData.get('slug') as string;
  const version = (formData.get('version') as string) || '1.0.0';
  const description = (formData.get('description') as string) || null;
  
  if (!name || name.length < 2) throw new Error('Name must be at least 2 characters');
  if (!slug) throw new Error('Slug / ID is required');
  
  const secret = generateSecret();
  const secretHash = hashToken(secret);

  try {
    const app = await db.$transaction(async (tx) => {
      // 1. Cria a Aplicação (sem appSecret)
      const newApp = await tx.application.create({
        data: {
          name,
          slug,
          appId: slug, // Usando o slug como o identificador público (X-App-Id)
          status: 'ACTIVE',
          version,
          description,
          hwidLock: true,
          minHwidLength: 16,
          maintenanceMode: false,
          forceHwid: false,
          vpnBlock: false,
          sessionExpirationMinutes: 1440,
          minUsernameLength: 3,
          hwidResetCooldownMinutes: 0,
        } as any, // <--- ADICIONE ESTE "as any" AQUI PARA BURLAR O CACHE DO TS
      });

      // 2. Cria a Credencial da API vinculada à aplicação
      await tx.applicationCredential.create({
        data: {
          publicId: slug,
          secretHash: secretHash,
          appId: newApp.id,
          status: 'ACTIVE',
        }
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
    // Retorna o secret em texto puro para o modal mostrar UMA VEZ
    return { success: true, appId: app.appId, secret: secret };
  } catch (error: any) {
    if (error.code === 'P2002') {
      throw new Error('Application slug already exists');
    }
    throw error;
  }
}

export async function deleteApplication(id: string) {
  const session = await admin();
  
  const app = await db.application.findUnique({ where: { id } });
  if (!app) throw new Error('Application not found');

  // Deleta a aplicação (o Cascade no schema vai deletar as credenciais junto)
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
  const secretHash = hashToken(newSecret);
  
  // Busca a credencial ativa atual
  const cred = await db.applicationCredential.findFirst({ where: { appId: id, status: 'ACTIVE' } });
  
  if (cred) {
    // Atualiza o hash da credencial existente
    await db.applicationCredential.update({
      where: { id: cred.id },
      data: { secretHash },
    });
  } else {
    // Se não existir, cria uma nova
    const app = await db.application.findUnique({ where: { id } });
    if (!app) throw new Error('Application not found');
    
    await db.applicationCredential.create({
      data: {
        publicId: app.appId,
        secretHash,
        appId: id,
        status: 'ACTIVE',
      }
    });
  }

  await logAudit({
    action: 'APPLICATION_SECRET_REGENERATED',
    entityType: 'Application',
    entityId: id,
    actorId: session.adminId,
    actorType: 'Admin',
    ip: ip()
  });

  revalidatePath(`/applications/${id}`);
  revalidatePath('/applications');
  
  // Retorna o novo secret para ser exibido no modal
  return { success: true, secret: newSecret };
}

export async function updateAppSettings(id: string, formData: FormData) {
  await admin();

  const version = formData.get('version') as string;
  const hwidLock = formData.get('hwidLock') === 'on';
  const maintenanceMode = formData.get('maintenanceMode') === 'on';
  const forceHwid = formData.get('forceHwid') === 'on';
  const vpnBlock = formData.get('vpnBlock') === 'on';
  const sessionExpirationMinutes = parseInt(formData.get('sessionExpirationMinutes') as string) || 1440;
  const minHwidLength = parseInt(formData.get('minHwidLength') as string) || 16;
  const minUsernameLength = parseInt(formData.get('minUsernameLength') as string) || 3;
  const hwidResetCooldownMinutes = parseInt(formData.get('hwidResetCooldownMinutes') as string) || 0;

  await db.application.update({
    where: { id },
    data: {
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
  await admin();
  
  if (!['ACTIVE', 'DISABLED', 'MAINTENANCE', 'PAUSED'].includes(status)) {
    throw new Error('Invalid status');
  }

  await db.application.update({
    where: { id },
    data: { status: status as any },
  });

  revalidatePath('/applications');
}