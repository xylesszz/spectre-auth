'use server';

import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { validateCsrf } from '@/lib/csrf';
import { logAudit } from '@/lib/audit';
import { headers } from 'next/headers';

async function admin() {
  const s = await getAdminSession();
  if (!s) throw new Error('Unauthorized');
  return s;
}

export async function createRule(fd: FormData) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  const s = await admin();

  const type = fd.get('type') as string;
  const kind = (fd.get('kind') as string) || 'BLACKLIST';
  const value = fd.get('value') as string;
  const appId = (fd.get('appId') as string) || null;
  const reason = (fd.get('reason') as string) || null;
  const hours = parseInt(fd.get('hours') as string, 10);

  if (!type || !value) throw new Error('Type and Value are required');

  await db.blacklistRule.create({
    data: {
      type,
      kind,
      value,
      appId: appId || null,
      reason,
      createdBy: s.adminId,
      expiresAt: Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null,
      active: true,
    },
  });

  await logAudit({
    action: 'RULE_CREATED',
    entityType: 'BlacklistRule',
    actorId: s.adminId,
    actorType: 'Admin',
    ip: headers().get('x-forwarded-for') || 'unknown',
    metadata: { type, kind, value, appId },
  });

  revalidatePath('/security');
}

export async function toggleRule(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();

  const rule = await db.blacklistRule.findUnique({ where: { id } });
  if (!rule) throw new Error('Rule not found');

  await db.blacklistRule.update({
    where: { id },
    data: { active: !rule.active },
  });

  revalidatePath('/security');
}

export async function deleteRule(id: string) {
  if (!validateCsrf()) throw new Error('CSRF validation failed');
  await admin();

  await db.blacklistRule.delete({
    where: { id },
  });

  revalidatePath('/security');
}