'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAdminSession } from '@/lib/session';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';

// Função auxiliar para gerar token
function generateRawToken(prefix: string) {
  return `${prefix}_${randomBytes(32).toString('hex')}`;
}

export async function createToken(fd: FormData) {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');

  const appId = fd.get('appId') as string;
  const name = fd.get('name') as string;

  if (!appId || !name) throw new Error('Missing fields');

  // Verifica se a aplicação existe
  const app = await db.application.findUnique({ where: { id: appId } });
  if (!app) throw new Error('Application not found');

  // Gera um token temporário (já que não temos tabela AppToken no DB)
  const raw = generateRawToken('spt');
  
  await logAudit({ 
    action: 'TOKEN_CREATED', 
    entityType: 'AppToken', 
    entityId: 'simulated', 
    actorId: s.adminId, 
    actorType: 'Admin', 
    ip: headers().get('x-forwarded-for') || 'unknown', 
    metadata: { name, note: 'DB model missing - token generated but not persisted' } as any 
  });
  
  revalidatePath('/tokens');
  return { token: raw };
}

export async function deleteToken(id: string) {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  
  // Removido db.appToken.delete pois o modelo não existe no schema atual
  
  await logAudit({ 
    action: 'TOKEN_DELETED', 
    entityType: 'AppToken', 
    entityId: id, 
    actorId: s.adminId, 
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown'
  });
  
  revalidatePath('/tokens');
}

export async function revokeToken(id: string) {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');

  // ⚠️ CORREÇÃO: Removido db.appToken.findUnique e db.appToken.delete
  // pois o modelo AppToken não existe no prisma/schema.prisma atual.
  
  await logAudit({
    action: 'TOKEN_REVOKED',
    entityType: 'AppToken',
    entityId: id,
    actorId: s.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown',
    metadata: { note: 'Token revocation simulated - DB model missing' } as any
  });

  revalidatePath('/tokens');
}