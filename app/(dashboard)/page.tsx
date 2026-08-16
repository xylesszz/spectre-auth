import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { Stat, PageHeader, Card } from '@/components/ui';

export default async function OverviewPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  // Função helper para queries seguras (retorna fallback em caso de erro)
  const safe = async <T,>(query: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await query;
    } catch (error) {
      console.error('Query failed:', error);
      return fallback;
    }
  };

  const now = new Date();

  // Buscar estatísticas com fallback seguro
  const [
    apps,
    users,
    activeUsers,
    bannedUsers,
    licenses,
    activeLic,
    expiredLic,
    revokedLic,
    activeSessions,
    apiRequests,
    securityEvents,
    recent
  ] = await Promise.all([
    safe(db.application.count(), 0),
    safe(db.user.count(), 0),
    safe(db.user.count({ where: { status: 'ACTIVE' } }), 0),
    safe(db.user.count({ where: { status: 'BANNED' } }), 0),
    safe(db.license.count(), 0),
    safe(db.license.count({ where: { status: 'ACTIVE' } }), 0),
    safe(db.license.count({ where: { status: 'EXPIRED' } }), 0),
    safe(db.license.count({ where: { status: 'REVOKED' } }), 0),
    safe(db.userSession.count({ where: { expiresAt: { gt: now } } }), 0),
    safe(db.auditLog.count({ where: { action: { startsWith: 'API_' } } }), 0),
    safe(db.auditLog.count({
      where: {
        OR: [
          { action: { contains: 'BLOCKED' } },
          { action: { contains: 'FAILED' } },
          { action: { contains: 'BANNED' } }
        ]
      }
    }), 0),
    safe(db.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12
    }), [] as any[]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" subtitle="Real-time overview of your authentication infrastructure" />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <Stat label="Applications" value={apps} />
        <Stat label="Users" value={users} />
        <Stat label="Active Users" value={activeUsers} accent="text-green-400" />
        <Stat label="Banned Users" value={bannedUsers} accent="text-red-400" />
        <Stat label="Licenses" value={licenses} />
        <Stat label="Active Licenses" value={activeLic} accent="text-green-400" />
        <Stat label="Expired" value={expiredLic} accent="text-yellow-400" />
        <Stat label="Revoked" value={revokedLic} accent="text-red-400" />
        <Stat label="Active Sessions" value={activeSessions} accent="text-blue-400" />
        <Stat label="API Requests" value={apiRequests} accent="text-orange-400" />
        <Stat label="Security Events" value={securityEvents} accent="text-red-400" />
      </div>

      <Card title="Recent Activity">
        <div className="space-y-1">
          {recent.length === 0 ? (
            <p className="text-gray-600 text-sm text-center py-8">No events yet</p>
          ) : (
            recent.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#111] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                  <span className="text-sm text-white font-medium truncate">{e.action}</span>
                  {e.metadata && (
                    <span className="text-xs text-gray-600 font-mono truncate hidden md:block">
                      {JSON.stringify(e.metadata).slice(0, 60)}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500 font-mono">{e.ip || '—'}</p>
                  <p className="text-[10px] text-gray-600">
                    {new Date(e.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}