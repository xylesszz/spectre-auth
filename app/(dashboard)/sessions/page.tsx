import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Th, Td, TableShell, Badge, btn } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { revokeSession, cleanupExpiredSessions } from '@/actions/sessions';

export default async function SessionsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const now = new Date();
  const sessions = await db.userSession.findMany({ include: { user: true, app: true }, orderBy: { lastActivity: 'desc' }, take: 100 });

  return (
    <div className="space-y-6">
      <PageHeader title="Sessions" subtitle="Client sessions across all applications">
        <ActionForm action={cleanupExpiredSessions} confirmText="Remove all expired sessions?"><button className={btn.gray}>Cleanup Expired</button></ActionForm>
      </PageHeader>
      <TableShell colSpan={7} empty={sessions.length === 0} head={<><Th>User</Th><Th>Application</Th><Th>IP</Th><Th>PC / Device</Th><Th>Last Activity</Th><Th>Status</Th><Th></Th></>}>
        {sessions.map((s) => (
          <tr key={s.id} className="hover:bg-[#111]">
            <Td className="text-white">{s.user.username}</Td>
            <Td>{s.app?.name ?? '—'}</Td>
            <Td className="font-mono text-xs">{s.ip}</Td>
            <Td className="text-xs">{s.pcName ?? '—'}</Td>
            <Td className="text-xs">{new Date(s.lastActivity).toLocaleString('pt-BR')}</Td>
            <Td>{s.expiresAt > now ? <Badge status="ACTIVE" /> : <Badge status="EXPIRED" />}</Td>
            <Td>{s.expiresAt > now && <ActionForm action={revokeSession.bind(null, s.id)} confirmText="Revoke this session?"><button className={btn.red}>Revoke</button></ActionForm>}</Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}