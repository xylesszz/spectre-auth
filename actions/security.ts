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
const ip = () => headers().get('x-forwarded-for') || 'unknown';

export async function createRule(fd: FormData) {
  const s = await admin();
  const type = fd.get('type') as string;
  const kind = (fd.get('kind') as string) || 'BLOCK'; // Default para BLOCK se não vier
  const value = fd.get('value') as string;
  
  if (!type || !value) throw new Error('Type and Value are required');

  const hours = parseInt(fd.get('hours') as string, 10);
  
  const rule = await db.blacklistRule.create({
    data: { 
      type: type, 
      kind: kind, // Agora existe no schema
      value: value, 
      appId: (fd.get('appId') as string) || null, 
      reason: (fd.get('reason') as string) || null, 
      createdBy: s.adminId, // Agora existe no schema
      expiresAt: Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null 
    },
  });

  // Log de auditoria
  // await logAudit(...)

  revalidatePath('/security');
  return { success: true };
}

export async function toggleRule(id: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  // Em vez de tentar atualizar um campo 'active' que não existe,
  // nós deletamos a regra. Se quiser "reativar", o admin cria uma nova.
  await db.blacklistRule.delete({
    where: { id },
  });

  revalidatePath('/security');
}

// Se você tiver uma função deleteRule separada, ela pode ser igual a esta:
export async function deleteRule(id: string) {
  const session = await getAdminSession();
  if (!session) throw new Error('Unauthorized');

  await db.blacklistRule.delete({
    where: { id },
  });

  revalidatePath('/security');
}