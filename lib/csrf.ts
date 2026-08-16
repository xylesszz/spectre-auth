import { headers } from 'next/headers';

export function validateCsrf() {
  const origin = headers().get('origin');
  const host = headers().get('host');
  if (!origin || !host) return false;
  try {
    const originUrl = new URL(origin);
    return originUrl.host === host;
  } catch {
    return false;
  }
}