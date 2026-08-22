import { cookies } from 'next/headers';
import { createHmac } from 'crypto';

const COOKIE_NAME = 'admin_session';
const SECRET = process.env.ADMIN_KEY || 'super_secret_fallback_key_change_me';

function sign(data: string) {
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

function verify(data: string, signature: string) {
  return createHmac('sha256', SECRET).update(data).digest('hex') === signature;
}

export async function getAdminSession() {
  const c = cookies().get(COOKIE_NAME);
  
  if (!c?.value) return null;
  
  const [payload, sig] = c.value.split('.');
  
  // Verifica se a assinatura é válida (evita que alguém forge o cookie)
  if (!payload || !sig || !verify(payload, sig)) return null;

  // Como o login é apenas com a chave mestra, o payload sempre será 'MASTER'
  return { adminId: 'MASTER', email: 'master@system.local' };
}

export async function createAdminSession() {
  const payload = 'MASTER';
  const sig = sign(payload);
  
  cookies().set(COOKIE_NAME, `${payload}.${sig}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    path: '/',
  });
}