import { createHash } from 'crypto';

export function normalizeAndHashHwid(hwid: string): string {
  const normalized = hwid.trim().toLowerCase();
  return createHash('sha256').update(normalized).digest('hex');
}