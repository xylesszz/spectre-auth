import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApp, apiError, clientMeta, resolveSession } from '@/server/api';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  const session = await resolveSession(req, app);
  if (!session) {
    return apiError('SESSION_REQUIRED', 'User session required to access variables.', 401);
  }

  // Agora só retorna variáveis se o usuário estiver autenticado
  const appVars = await db.variable.findMany({ where: { appId: app.id } });
  const userVars: any[] = []; // não existe UserVariable

  return NextResponse.json({
    success: true,
    data: {
      global: Object.fromEntries(appVars.map((v: any) => [v.key, v.value])),
      user: Object.fromEntries(userVars.map((v: any) => [v.key, v.value])),
    },
  });
}