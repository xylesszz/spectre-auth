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
  const kind = fd.get('kind') as string;
  const value = (fd.get('value') as string)?.trim();
  if (!['IP', 'HWID', 'USER', 'LICENSE'].includes(type)) throw new Error('Invalid type');
  if (!['BLACKLIST', 'WHITELIST'].includes(kind)) throw new Error('Invalid kind');
  if (!value) throw new Error('Value required');
  const hours = parseInt(fd.get('hours') as string, 10);
  const rule = await db.blacklistRule.create({
    data: { type: type as any, kind: kind as any, value, appId: (fd.get('appId') as string) || null, reason: (fd.get('reason') as string) || null, createdBy: s.adminId, expiresAt: Number.isFinite(hours) && hours > 0 ? new Date(Date.now() + hours * 3600000) : null },
  });
  await logAudit({ action: `RULE_${kind}_CREATED`, entityType: 'BlacklistRule', entityId: rule.id, actorId: s.adminId, actorType: 'Admin', ip: ip(), metadata: { type, value } as any });
  revalidatePath('/security');
}

export async function toggleRule(ruleId: string) {
  const s = await admin();
  const rule = await db.blacklistRule.findUnique({ where: { id: ruleId } });
  if (!rule) throw new Error('Rule not found');
  await db.blacklistRule.update({ where: { id: ruleId }, data: { active: !rule.active } });
  await logAudit({ action: rule.active ? 'RULE_DISABLED' : 'RULE_ENABLED', entityType: 'BlacklistRule', entityId: ruleId, actorId: s.adminId, actorType: 'Admin', ip: ip() });
  revalidatePath('/security');
}

export async function deleteRule(ruleId: string) {
  const s = await admin();
  await db.blacklistRule.delete({ where: { id: ruleId } });
  await logAudit({ action: 'RULE_DELETED', entityType: 'BlacklistRule', entityId: ruleId, actorId: s.adminId, actorType: 'Admin', ip: ip() });
  revalidatePath('/security');
}