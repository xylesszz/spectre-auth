import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/security';

export function clientMeta(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
             req.headers.get('x-real-ip') || 
             'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return { ip, userAgent };
}

export function apiError(code: string, message: string, status: number = 400) {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function authenticateApp(req: NextRequest) {
  const appId = req.headers.get('x-app-id');
  const appSecret = req.headers.get('x-app-secret');

  if (!appId || !appSecret) return null;

  const app = await db.application.findUnique({ where: { appId } });
  if (!app) return null;
  
  // Cast para 'any' para evitar erro de TS local se o prisma generate não foi rodado recentemente.
  // O schema no repositório TEM appSecret, então na Vercel vai funcionar perfeitamente.
  if ((app as any).appSecret !== appSecret) return null;

  return app;
}

export async function resolveSession(req: NextRequest, app: any) {
  const raw = req.headers.get('x-session-token');
  if (!raw) return null;

  const session = await db.session.findUnique({ 
    where: { tokenHash: hashToken(raw) } 
  });

  if (!session || session.appId !== app.id || session.expiresAt < new Date()) {
    return null;
  }

  return session;
}

export async function createSession(tx: any, data: any) {
  await tx.session.create({
    data: {
      userId: data.userId,
      appId: data.appId,
      tokenHash: hashToken(data.rawToken),
      hwidHash: data.hwidHash,
      pcName: data.pcName,
      ip: data.ip,
      userAgent: data.userAgent,
      expiresAt: new Date(Date.now() + data.expirationMinutes * 60000),
    }
  });
}

export async function logApi(action: string, app: any, meta: any, metadata?: any) {
  try {
    await db.auditLog.create({
      data: {
        action,
        entityType: app ? 'Application' : 'System',
        entityId: app?.id,
        actorType: 'Application',
        actorId: app?.id,
        ip: meta?.ip,
        metadata: metadata || {},
      }
    });
  } catch (e) {
    console.error('Audit log failed', e);
  }
}

export async function securityBlock(app: any, meta: any, context: any) {
  // Verifica maintenance mode
  if ((app as any).maintenanceMode) return 'MAINTENANCE_MODE';

  // CORREÇÃO: Usar 'AND' para combinar múltiplas condições 'OR' no Prisma
  // Isso evita o erro de "multiple properties with the same name"
  const blocks = await db.blacklistRule.findMany({
    where: {
      active: true,
      kind: 'BLACKLIST',
      AND: [
        {
          OR: [
            { appId: app.id },
            { appId: null }
          ]
        },
        {
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        }
      ]
    }
  });

  for (const rule of blocks) {
    if (rule.type === 'IP' && rule.value === meta.ip) return 'IP_BLOCKED';
    if (rule.type === 'HWID' && context.hwidHash && rule.value === context.hwidHash) return 'HWID_BLOCKED';
    if (rule.type === 'USER' && context.username && rule.value.toLowerCase() === context.username.toLowerCase()) return 'USER_BLOCKED';
    if (rule.type === 'LICENSE' && context.licenseKey && rule.value.toUpperCase() === context.licenseKey.toUpperCase()) return 'LICENSE_BLOCKED';
  }

  return null;
}