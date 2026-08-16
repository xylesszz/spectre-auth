import { db } from './db';
import { cookies } from 'next/headers';
import { cache } from 'react';

export const getAdminSession = cache(async () => {
  const sessionId = cookies().get('spectre_admin_session')?.value;
  if (!sessionId) return null;

  const session = await db.adminSession.findUnique({
    where: { id: sessionId },
    include: { admin: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await db.adminSession.delete({ where: { id: session.id } });
    return null;
  }

  await db.adminSession.update({
    where: { id: session.id },
    data: { lastActivity: new Date() }
  });

  return session;
});

export async function createAdminSession(adminId: string, ip: string, userAgent: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  return db.adminSession.create({
    data: {
      adminId,
      expiresAt,
      ip,
      userAgent,
    },
  });
}

export async function deleteAdminSession(sessionId: string) {
  try {
    await db.adminSession.delete({ where: { id: sessionId } });
  } catch {}
}