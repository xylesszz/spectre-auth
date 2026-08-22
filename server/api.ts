import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashToken } from '@/lib/security';
import bcrypt from 'bcryptjs';

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

/**
 * Autentica a aplicação usando ApplicationCredential (publicId + secretHash)
 * Substitui o antigo sistema de appSecret direto na tabela Application
 */
export async function authenticateApp(req: NextRequest) {
  const publicId = req.headers.get('x-app-id');
  const rawSecret = req.headers.get('x-app-secret');

  if (!publicId || !rawSecret) return null;

  try {
    // Busca a credential ativa
    const credential = await db.applicationCredential.findUnique({
      where: { publicId },
      include: { app: true },
    });

    if (!credential) return null;
    if (credential.status !== 'ACTIVE') return null;

    // Valida o secret contra o hash armazenado
    const secretMatches = await bcrypt.compare(rawSecret, credential.secretHash);
    if (!secretMatches) return null;

    // Atualiza lastUsedAt para auditoria
    try {
      await db.applicationCredential.update({
        where: { id: credential.id },
        data: { lastUsedAt: new Date() },
      });
    } catch (e) {
      // Silenciosamente ignora erro em auditoria
      console.error('Failed to update credential lastUsedAt:', e);
    }

    return credential.app;
  } catch (error) {
    console.error('Error authenticating app:', error);
    return null;
  }
}

export async function resolveSession(req: NextRequest, app: any) {
  const raw = req.headers.get('x-session-token');
  if (!raw) return null;

  try {
    const session = await db.session.findUnique({ 
      where: { tokenHash: hashToken(raw) } 
    });

    if (!session || session.appId !== app.id || session.expiresAt < new Date()) {
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error resolving session:', error);
    return null;
  }
}

export async function createSession(tx: any, data: any) {
  await tx.session.create({
    data: {
      userId: data.userId,
      appId: data.appId,
      tokenHash: hashToken(data.rawToken),
      hwidHash: data.hwidHash ?? null,
      pcName: data.pcName ?? null,
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

/**
 * Verifica regras de bloqueio (IP, HWID, usuário, licença)
 * Combina múltiplas condições sem erro de "duplicate properties"
 */
export async function securityBlock(app: any, meta: any, context: any) {
  // Verifica maintenance mode
  if ((app as any).maintenanceMode) return 'MAINTENANCE_MODE';

  try {
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
  } catch (error) {
    console.error('Error checking security blocks:', error);
    // Em caso de erro, permite o acesso mas registra o erro
    // Isso evita que erros de banco derrubem o sistema
    return null;
  }
}
