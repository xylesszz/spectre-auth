import crypto from 'crypto';

export async function triggerWebhook(event: string, payload: any) {
  const webhookUrl = process.env.WEBHOOK_URL;
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookUrl) return;

  // Validar URL (evitar SSRF)
  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)) return;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') return;
    // Bloquear IPs privados em produção (opcional)
    const hostname = parsed.hostname;
    if (process.env.NODE_ENV === 'production' && (
      hostname === 'localhost' || hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') || hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') || hostname.startsWith('172.19.') ||
      hostname.startsWith('172.20.') || hostname.startsWith('172.21.') ||
      hostname.startsWith('172.22.') || hostname.startsWith('172.23.') ||
      hostname.startsWith('172.24.') || hostname.startsWith('172.25.') ||
      hostname.startsWith('172.26.') || hostname.startsWith('172.27.') ||
      hostname.startsWith('172.28.') || hostname.startsWith('172.29.') ||
      hostname.startsWith('172.30.') || hostname.startsWith('172.31.')
    )) {
      console.warn('[webhook] Blocked request to private IP:', hostname);
      return;
    }
  } catch {
    return;
  }

  // Sanitizar payload — remover chaves sensíveis
  const safePayload = { ...payload };
  delete safePayload.license;
  delete safePayload.passwordHash;
  delete safePayload.token;
  delete safePayload.hwid; // se quiser enviar hash truncado, faça explicitamente
  delete safePayload.secret;
  delete safePayload.key;

  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), ...safePayload });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (webhookSecret) {
    const sig = crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
    headers['x-spectre-signature'] = `sha256=${sig}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    await fetch(webhookUrl, { method: 'POST', headers, body, signal: controller.signal });
  } catch (e) {
    console.error('[webhook] dispatch failed:', e);
  } finally {
    clearTimeout(timeout);
  }
}