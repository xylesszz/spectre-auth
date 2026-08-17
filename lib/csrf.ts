import { headers } from 'next/headers';

export function validateCsrf(): boolean {
  try {
    const origin = headers().get('origin');
    const host = headers().get('host');
    if (!origin || !host) return false;
    const originUrl = new URL(origin);
    // Verifica se a origem é igual ao host (inclui porta)
    return originUrl.host === host;
  } catch {
    return false;
  }
}