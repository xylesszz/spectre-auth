import { createHash, randomBytes } from 'crypto';
import { db } from './db';

export const hashSha256 = (v: string) => createHash('sha256').update(v).digest('hex');
export const normalizeHwid = (v: string) => v.trim().toLowerCase();
export const hashHwid = (v: string) => hashSha256(normalizeHwid(v));
export const hashToken = (v: string) => hashSha256(`spectre:${v}`);

export function generateLicenseKey(prefix?: string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const seg = (n: number) =>
    Array.from(randomBytes(n)).map((b) => alphabet[b % alphabet.length]).join('');
  return `${prefix ? prefix + '-' : ''}${seg(4)}-${seg(4)}-${seg(4)}-${seg(4)}`;
}

export const generateSecret = () => `sk_live_${randomBytes(32).toString('hex')}`;
export const generatePublicId = () => `pub_${randomBytes(12).toString('hex')}`;
export const generateRawToken = (p: string) => `${p}_${randomBytes(24).toString('hex')}`;

function notExpired(r: { expiresAt: Date | null }) {
  return !r.expiresAt || r.expiresAt > new Date();
}

export async function findBlockingRule(
  appId: string,
  targets: { ip?: string; hwidHash?: string; username?: string; licenseKey?: string }
) {
  const rules = await db.blacklistRule.findMany({
    where: { active: true, OR: [{ appId }, { appId: null }] },
  });
  const live = rules.filter(notExpired);

  const whitelisted = (type: string, value?: string) =>
    !!value && live.some(
      (r) => r.kind === 'WHITELIST' && r.type === type &&
      r.value.toLowerCase() === value.toLowerCase() // CORRIGIDO: case-insensitive
    );

  const wlIp = whitelisted('IP', targets.ip);
  const wlHwid = whitelisted('HWID', targets.hwidHash);

  return (
    live.find((r) => {
      if (r.kind !== 'BLACKLIST') return false;
      if (r.type === 'IP') return !wlIp && !!targets.ip && r.value === targets.ip;
      if (r.type === 'HWID') return !wlHwid && !!targets.hwidHash && r.value === targets.hwidHash;
      if (r.type === 'USER')
        return !!targets.username && r.value.toLowerCase() === targets.username.toLowerCase();
      if (r.type === 'LICENSE')
        return !!targets.licenseKey && r.value.toUpperCase() === targets.licenseKey.toUpperCase();
      return false;
    }) ?? null
  );
}

export function daysLeft(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
}