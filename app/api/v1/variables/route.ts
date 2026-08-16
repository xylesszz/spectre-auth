import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApp, apiError, clientMeta, resolveSession } from '@/server/api';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  const appVars = await db.appVariable.findMany({ where: { appId: app.id } });
  const session = await resolveSession(req, app);
  const userVars = session
    ? await db.userVariable.findMany({ where: { userId: session.userId } })
    : [];

  return NextResponse.json({
    success: true,
    data: {
      global: Object.fromEntries(appVars.map((v) => [v.name, v.value])),
      user: Object.fromEntries(userVars.map((v) => [v.name, v.value])),
    },
  });
}