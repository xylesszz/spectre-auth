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

export async function revokeSession(sessionId: string) {
  const s = await admin();
  await db.userSession.delete({ where: { id: sessionId } });
  await logAudit({
    action: 'SESSION_REVOKED',
    entityType: 'UserSession',
    entityId: sessionId,
    actorId: s.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown'
  });
  revalidatePath('/sessions');
}

export async function cleanupExpiredSessions() {
  const s = await admin();
  const { count } = await db.userSession.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  await logAudit({
    action: 'SESSIONS_CLEANUP',
    actorId: s.adminId,
    actorType: 'Admin',
    metadata: { removed: count } as any
  });
  revalidatePath('/sessions');
}