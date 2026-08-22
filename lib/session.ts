import { cookies } from 'next/headers';
import { createHmac } from 'crypto';

const COOKIE_NAME = 'admin_session';
const SECRET = process.env.ADMIN_KEY || 'super_secret_fallback_key_change_me';

function verify(data: string, signature: string) {
  return createHmac('sha256', SECRET).update(data).digest('hex') === signature;
}

export async function getAdminSession() {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  
  const [payload, sig] = c.value.split('.');
  
  // Verifica se a assinatura é válida (evita que alguém forge o cookie)
  if (!payload || !sig || !verify(payload, sig)) return null;

  // Se o payload for 'MASTER', é o login via ADMIN_KEY
  if (payload === 'MASTER') {
    return { adminId: 'MASTER', email: 'master@system.local' };
  }

  // Caso contrário, o payload é o ID do Admin do banco de dados
  return { adminId: payload, email: 'admin@system.local' };
}