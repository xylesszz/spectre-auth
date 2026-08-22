import crypto from 'crypto';

/**
 * Gera um hash SHA-256 para um token
 * Armazenar hash ao invés do token em plaintext por segurança
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Gera um hash para HWID
 * Usa SHA-256 para consistência
 */
export function hashHwid(hwid: string): string {
  return crypto.createHash('sha256').update(hwid.toLowerCase()).digest('hex');
}

/**
 * Gera um token aleatório seguro
 */
export function generateRawToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Calcula dias restantes até uma data de expiração
 */
export function daysLeft(expiresAt: Date | null): number {
  if (!expiresAt) return -1;
  const now = Date.now();
  const diff = expiresAt.getTime() - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Valida se um token tem o prefixo correto
 */
export function validateTokenPrefix(token: string, expectedPrefix: string): boolean {
  return token.startsWith(`${expectedPrefix}_`);
}

/**
 * Extrai o prefixo de um token
 */
export function getTokenPrefix(token: string): string | null {
  const match = token.match(/^([a-z]+)_/);
  return match ? match[1] : null;
}
