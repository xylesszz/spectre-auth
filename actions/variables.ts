'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAdminSession } from '@/lib/session';
import { headers } from 'next/headers';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function setVariable(fd: FormData) {
  const s = await admin();
  const appId = fd.get('appId') as string;
  const key = fd.get('key') as string; // Mudado de 'name' para 'key'
  const value = fd.get('value') as string;

  if (!appId || !key) throw new Error('App ID and Key required');
  if (!(await db.application.findUnique({ where: { id: appId } }))) throw new Error('Application not found');

  // Usando db.variable (minúsculo) e os campos corretos (appId, key)
  // O @@unique([appId, key]) cria um índice implícito, mas para upsert precisamos referenciar os campos
  await db.variable.upsert({
    where: { 
      appId_key: { appId, key } // Prisma gera esse nome baseado no @@unique([appId, key])
    },
    update: { value },
    create: { appId, key, value }
  });

  await logAudit({ 
    action: 'VARIABLE_SET', 
    entityType: 'Variable', 
    entityId: appId,
    actorId: s.adminId, 
    actorType: 'Admin', 
    ip: headers().get('x-forwarded-for') || 'unknown', 
    metadata: { key } as any 
  });
  
  revalidatePath('/variables');
}

export async function deleteVariable(id: string) {
  const s = await admin();
  
  const variable = await db.variable.findUnique({ where: { id } });
  if (!variable) throw new Error('Variable not found');

  await db.variable.delete({ where: { id } });

  await logAudit({ 
    action: 'VARIABLE_DELETED', 
    entityType: 'Variable', 
    entityId: id,
    actorId: s.adminId, 
    actorType: 'Admin', 
    ip: headers().get('x-forwarded-for') || 'unknown',
    metadata: { key: variable.key } as any
  });

  revalidatePath('/variables');
}

export async function setAppVariable(fd: FormData) {
  const s = await admin();
  const appId = fd.get('appId') as string;
  const key = fd.get('key') as string;
  const value = fd.get('value') as string;

  if (!appId || !key) throw new Error('Missing fields');

  await db.variable.upsert({
    where: { appId_key: { appId, key } },
    update: { value },
    create: { appId, key, value },
  });

  await logAudit({
    action: 'VARIABLE_SET',
    entityType: 'Variable',
    entityId: appId,
    actorId: s.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown',
    metadata: { key }
  });

  revalidatePath('/variables');
}