// actions/sessions.ts
'use server';

import { db } from '@/lib/db';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAdminSession } from '@/lib/session';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function revokeSession(sessionId: string) {
  const s = await admin();
  
  // CORREÇÃO: db.session em vez de db.userSession
  await db.session.delete({ where: { id: sessionId } });
  
  await logAudit({
    action: 'SESSION_REVOKED',
    entityType: 'Session',
    entityId: sessionId,
    actorId: s.adminId,
    actorType: 'Admin',
  });

  revalidatePath('/sessions');
}

export async function cleanupExpiredSessions() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');

  // Deleta sessões expiradas
  await db.session.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });

  revalidatePath('/sessions');
}
