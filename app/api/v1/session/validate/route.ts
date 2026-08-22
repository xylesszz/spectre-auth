import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApp, apiError, clientMeta, logApi } from '@/server/api';
import { hashToken, daysLeft } from '@/lib/security';

export async function POST(req: NextRequest) {
  const meta = clientMeta(req);
  const app = await authenticateApp(req);
  if (!app) return apiError('UNAUTHORIZED', 'Invalid application credentials.', 401);

  const raw = req.headers.get('x-session-token');
  if (!raw) return apiError('NO_SESSION', 'Session token missing.', 400);

  // CORREÇÃO REAL: Adicionado 'include' para buscar o usuário e suas licenças em uma única query
  const session = await db.session.findUnique({ 
    where: { tokenHash: hashToken(raw) },
    include: {
      user: {
        include: {
          licenses: {
            where: { appId: app.id } // Filtra apenas as licenças deste aplicativo
          }
        }
      }
    }
  });

  // Valida se a sessão existe, pertence ao app e não expirou
  if (!session || session.appId !== app.id || session.expiresAt < new Date()) {
    return apiError('INVALID_SESSION', 'Session invalid or expired.', 401);
  }

  // Segurança extra: garante que o usuário foi carregado
  if (!session.user) {
    return apiError('INVALID_SESSION', 'User associated with session not found.', 401);
  }

  // Atualiza a última atividade da sessão (keep-alive)
  await db.session.update({
    where: { id: session.id },
    data: { lastActivity: new Date() }
  });

  // Pega a primeira licença válida do usuário para este app
  const license = session.user.licenses[0];

  await logApi('API_SESSION_VALIDATED', app, meta, { username: session.user.username });

  return NextResponse.json({
    success: true,
    data: {
      user: { 
        username: session.user.username, 
        id: session.user.id 
      },
      license: license ? {
        key: license.key,
        status: license.status,
        expiration: license.expiresAt,
        daysLeft: daysLeft(license.expiresAt),
      } : null,
      session: {
        expiresAt: session.expiresAt,
      }
    }
  });
}