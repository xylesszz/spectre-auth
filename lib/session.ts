import { cookies } from 'next/headers';
import { db } from './db';
import { createHash } from 'crypto';

export interface AdminSession {
  adminId: string;
  email: string;
}

function hashToken(token: string): string {
  return createHash('sha256').update(`admin_session:${token}`).digest('hex');
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const c = cookies().get('spectre_admin_session');
    if (!c?.value || c.value.length < 32) return null;

    const session = await db.adminSession.findUnique({
      where: { tokenHash: hashToken(c.value) },
      include: { admin: true },
    });

    if (!session) return null;
    if (session.expiresAt < new Date()) {
      await db.adminSession.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return { adminId: session.admin.id, email: session.admin.email };
  } catch {
    return null;
  }
}