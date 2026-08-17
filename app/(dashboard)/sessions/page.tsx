import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { revokeSession } from '@/actions/sessions';

export default async function SessionsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const now = new Date();
  
  // CORREÇÃO: db.session em vez de db.userSession
  const sessions = await db.session.findMany({ 
    include: { user: true, app: true }, 
    orderBy: { lastActivity: 'desc' }, 
    take: 100 
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Active Sessions" subtitle="Manage and revoke active user sessions across all applications" />

      <Card title={`Sessions (${sessions.length})`}>
        <TableShell 
          colSpan={6} 
          empty={sessions.length === 0} 
          head={
            <>
              <Th>User</Th>
              <Th>Application</Th>
              <Th>IP / Device</Th>
              <Th>Last Activity</Th>
              <Th>Expires</Th>
              <Th></Th>
            </>
          }
        >
          {sessions.map((s) => {
            const isExpired = s.expiresAt < now;
            return (
              <tr key={s.id} className="hover:bg-[#111]">
                <Td>
                  <div className="text-sm text-white">{s.user?.username ?? 'Unknown'}</div>
                  <div className="text-xs text-gray-500 font-mono">{s.hwidHash ? `${s.hwidHash.substring(0, 8)}...` : 'No HWID'}</div>
                </Td>
                <Td className="text-xs">{s.app?.name ?? 'Unknown App'}</Td>
                <Td>
                  <div className="text-xs text-gray-300 font-mono">{s.ip ?? '—'}</div>
                  <div className="text-xs text-gray-500">{s.pcName ?? s.userAgent ?? 'Unknown Device'}</div>
                </Td>
                <Td className="text-xs text-gray-400">
                  {new Date(s.lastActivity).toLocaleString('pt-BR')}
                </Td>
                <Td className="text-xs">
                  {isExpired ? (
                    <Badge status="EXPIRED" />
                  ) : (
                    <span className="text-green-400">{new Date(s.expiresAt).toLocaleString('pt-BR')}</span>
                  )}
                </Td>
                <Td>
                  {!isExpired && (
                    <ActionForm action={revokeSession.bind(null, s.id)} confirmText="Revoke this session? The user will be logged out immediately.">
                      <button type="submit" className={btn.red}>Revoke</button>
                    </ActionForm>
                  )}
                </Td>
              </tr>
            );
          })}
        </TableShell>
      </Card>
    </div>
  );
}