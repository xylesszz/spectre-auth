import { cookies } from 'next/headers';

export interface AdminSession {
  adminId: string;
  email: string;
}

export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const c = cookies().get('spectre_admin_key');
    if (!c || c.value !== 'ok') return null;
    return { adminId: 'key-admin', email: 'admin' };
  } catch {
    return null;
  }
}