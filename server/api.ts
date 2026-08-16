import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { findBlockingRule, hashToken } from '@/lib/security';
import { logAudit } from '@/lib/audit';

export function apiError(code: string, message: string, status = 400) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export function clientMeta(req: NextRequest) {
  return {
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    userAgent: req.headers.get('user-agent') || 'unknown',
  };
}

export async function authenticateApp(req: NextRequest) {
  const publicId = req.headers.get('x-app-id');
  const secret = req.headers.get('x-app-secret');
  if (!publicId || !secret) return null;

  const credential = await db.applicationCredential.findUnique({
    where: { publicId },
    include: { app: true },
  });
  if (!credential || credential.status !== 'ACTIVE') return null;

  const ok = await bcrypt.compare(secret, credential.secretHash);
  if (!ok) return null;

  await db.$transaction([
    db.applicationCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } }),
    db.application.update({ where: { id: credential.app.id }, data: { lastApiActivity: new Date() } }),
  ]);
  return credential.app;
}

export async function securityBlock(
  app: { id: string; status: string; maintenanceMode: boolean },
  meta: { ip: string },
  targets: { ip?: string; hwidHash?: string; username?: string; licenseKey?: string }
): Promise<string | null> {
  if (app.status === 'DISABLED') return 'APPLICATION_DISABLED';
  if (app.maintenanceMode) return 'MAINTENANCE_MODE';
  const rule = await findBlockingRule(app.id, targets);
  if (rule) return `BLACKLISTED_${rule.type}`;
  void meta;
  return null;
}

export async function createSession(
  tx: any,
  data: { userId: string; appId: string; rawToken: string; hwidHash?: string | null; pcName?: string | null; ip: string; userAgent: string; expirationMinutes: number }
) {
  return tx.userSession.create({
    data: {
      userId: data.userId,
      appId: data.appId,
      tokenHash: hashToken(data.rawToken),
      hwidHash: data.hwidHash ?? null,
      pcName: data.pcName ?? null,
      ip: data.ip,
      userAgent: data.userAgent,
      expiresAt: new Date(Date.now() + data.expirationMinutes * 60000),
    },
  });
}

export async function resolveSession(req: NextRequest, app: { id: string }) {
  const raw = req.headers.get('x-session-token');
  if (!raw) return null;
  const session = await db.userSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { user: { include: { licenses: { where: { appId: app.id, status: 'ACTIVE' }, take: 1 } } } },
  });
  if (!session || session.appId !== app.id || session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;
  await db.userSession.update({ where: { id: session.id }, data: { lastActivity: new Date() } });
  return session;
}

export async function logApi(action: string, app: { id: string } | null, meta: { ip: string }, extra?: Record<string, unknown>) {
  await logAudit({
    action,
    entityType: 'API',
    entityId: app?.id ?? null,
    actorType: 'Application',
    actorId: app?.id ?? null,
    ip: meta.ip,
    metadata: (extra ?? {}) as any,
  });
}