import { db } from './db';

// Lista de campos sensíveis a remover do metadata
const SENSITIVE_KEYS = ['password', 'token', 'secret', 'key', 'hwid', 'licenseKey', 'passwordHash'];

function sanitizeMetadata(meta: any): any {
  if (!meta || typeof meta !== 'object') return meta;
  const clean = { ...meta };
  for (const key of SENSITIVE_KEYS) {
    if (key in clean) {
      delete clean[key];
    }
  }
  // Se ainda houver objetos aninhados, sanitizar recursivamente
  for (const [k, v] of Object.entries(clean)) {
    if (v && typeof v === 'object') {
      clean[k] = sanitizeMetadata(v);
    }
  }
  return clean;
}

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
    const sanitized = sanitizeMetadata(params.metadata);
    await db.auditLog.create({
      data: {
        ...params,
        metadata: sanitized,
      },
    });
  } catch (e) {
    // Log para monitoramento (não falhar)
    console.error('Failed to write audit log:', e);
    // Em produção, enviar para serviço de monitoramento
  }
}