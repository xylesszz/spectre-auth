'use server';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function setAppVariable(fd: FormData) {
  const s = await admin();
  const appId = fd.get('appId') as string;
  const name = (fd.get('name') as string)?.trim();
  const value = (fd.get('value') as string) ?? '';
  if (!name) throw new Error('Variable name required');
  if (!(await db.application.findUnique({ where: { id: appId } }))) throw new Error('Application not found');
  await db.appVariable.upsert({ where: { appId_name: { appId, name } }, update: { value }, create: { appId, name, value } });
  await logAudit({ action: 'VARIABLE_SET', entityType: 'AppVariable', actorId: s.adminId, actorType: 'Admin', ip: headers().get('x-forwarded-for') || 'unknown', metadata: { name } as any });
  revalidatePath('/variables');
}

export async function deleteAppVariable(varId: string) {
  const s = await admin();
  await db.appVariable.delete({ where: { id: varId } });
  await logAudit({ action: 'VARIABLE_DELETED', entityType: 'AppVariable', entityId: varId, actorId: s.adminId, actorType: 'Admin', ip: headers().get('x-forwarded-for') || 'unknown' });
  revalidatePath('/variables');
}