import { db } from './db';

export async function logAudit(params: {
  action: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  actorType?: string;
  ip?: string;
  metadata?: any;
}) {
  try {
    await db.auditLog.create({ data: params });
  } catch (e) {
    console.error('Failed to write audit log', e);
  }
}