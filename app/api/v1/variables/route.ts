import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApp, apiError, clientMeta, resolveSession } from '@/server/api';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  // db.variable em vez de db.appVariable
  const appVars = await db.variable.findMany({ where: { appId: app.id } });
  const session = await resolveSession(req, app);
  
  // userVariable não existe no schema, retornamos vazio
  const userVars: any[] = [];
  // Se quiser no futuro, poderia ser: session ? await db.variable.findMany({ where: { userId: session.userId } }) : []

  return NextResponse.json({
    success: true,
    data: {
      // 'key' em vez de 'name'
      global: Object.fromEntries(appVars.map((v: any) => [v.key, v.value])),
      user: Object.fromEntries(userVars.map((v: any) => [v.key, v.value])),
    },
  });
}