import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, btn, input, label, Th, Td, TableShell } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { setUserStatus, banUser, unbanUser, resetUserHwid, resetUserPassword, revokeUserSessions, deleteUser, setUserVariable, deleteUserVariable } from '@/actions/users';

export default async function UserDetailsPage({ params }: { params: { id: string } }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const user = await db.user.findUnique({
    where: { id: params.id },
    include: { app: true, licenses: { include: { app: true }, orderBy: { createdAt: 'desc' } }, sessions: { orderBy: { lastActivity: 'desc' }, take: 10 }, variables: true },
  });
  if (!user) notFound();

  const history = await db.auditLog.findMany({ where: { metadata: { path: ['username'], equals: user.username } }, orderBy: { createdAt: 'desc' }, take: 10 }).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader title={user.username} subtitle={`ID: ${user.id}`}>
        <div className="flex items-center gap-3">
          <Badge status={user.status} />
          <ActionForm action={deleteUser.bind(null, user.id)} confirmText="Permanently delete this user?">
            <button className={btn.red}>Delete User</button>
          </ActionForm>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Information">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Application</span><span className="text-white">{user.app?.name ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Email</span><span className="text-white">{user.email ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-white">{new Date(user.createdAt).toLocaleString('pt-BR')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last Login</span><span className="text-white">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('pt-BR') : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last IP</span><span className="text-white font-mono text-xs">{user.lastIp ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">PC / Device</span><span className="text-white">{user.pcName ?? '—'}</span></div>
            <div><span className="text-gray-500 block mb-1">HWID</span><code className="text-xs text-gray-300 bg-black border border-gray-800 rounded px-2 py-1 block break-all">{user.hwidHash ?? '—'}</code></div>
            {user.status === 'BANNED' && <div className="text-xs text-red-400">Reason: {user.banReason}{user.bannedUntil ? ` (until ${new Date(user.bannedUntil).toLocaleString('pt-BR')})` : ' (permanent)'}</div>}
          </div>
        </Card>

        <Card title="Actions">
          <div className="grid grid-cols-2 gap-2">
            {user.status === 'BANNED' ? (
              <ActionForm action={unbanUser.bind(null, user.id)}><button className={`${btn.green} w-full`}>Unban</button></ActionForm>
            ) : (
              <form action={banUser.bind(null, user.id)} className="col-span-2 space-y-2">
                <input name="reason" placeholder="Ban reason" className={input} />
                <input name="hours" type="number" min={0} placeholder="Hours (0 = permanent)" className={input} />
                <button className={`${btn.red} w-full`}>Ban User</button>
              </form>
            )}
            <ActionForm action={setUserStatus.bind(null, user.id, user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED')}>
              <button className={`${user.status === 'DISABLED' ? btn.green : btn.yellow} w-full`}>{user.status === 'DISABLED' ? 'Enable' : 'Disable'}</button>
            </ActionForm>
            <ActionForm action={resetUserHwid.bind(null, user.id)} confirmText="Reset HWID for this user?"><button className={`${btn.blue} w-full`}>Reset HWID</button></ActionForm>
            <ActionForm action={revokeUserSessions.bind(null, user.id)} confirmText="Revoke all sessions?"><button className={`${btn.yellow} w-full`}>Revoke Sessions</button></ActionForm>
            <form action={resetUserPassword.bind(null, user.id)} className="col-span-2 space-y-2">
              <input name="password" type="password" placeholder="New password (min 6)" className={input} required minLength={6} />
              <button className={`${btn.gray} w-full`}>Reset Password</button>
            </form>
          </div>
        </Card>

        <Card title="User Variables">
          <form action={setUserVariable.bind(null, user.id)} className="grid grid-cols-1 gap-2 mb-4">
            <input name="name" placeholder="name" className={input} required />
            <input name="value" placeholder="value" className={input} />
            <button className={btn.blue}>Set Variable</button>
          </form>
          <div className="space-y-1">
            {user.variables.map((v) => (
              <div key={v.id} className="flex justify-between items-center px-2 py-1.5 bg-black/50 border border-gray-800 rounded text-xs">
                <span className="text-gray-300 font-mono">{v.name} = {v.value}</span>
                <ActionForm action={deleteUserVariable.bind(null, v.id)}><button className="text-red-500 hover:text-red-400">✕</button></ActionForm>
              </div>
            ))}
            {user.variables.length === 0 && <p className="text-gray-600 text-xs text-center py-3">No variables</p>}
          </div>
        </Card>
      </div>

      <Card title={`Licenses (${user.licenses.length})`}>
        <div className="space-y-2">
          {user.licenses.map((l) => (
            <div key={l.id} className="flex justify-between items-center p-3 bg-black/50 border border-gray-800 rounded">
              <div><Link href={`/licenses/${l.id}`} className="text-sm text-white font-mono hover:text-red-500">{l.key}</Link><p className="text-xs text-gray-600">{l.app?.name ?? '—'}</p></div>
              <div className="flex items-center gap-3"><span className="text-xs text-gray-500">{l.expiresAt ? new Date(l.expiresAt).toLocaleDateString('pt-BR') : 'Lifetime'}</span><Badge status={l.status} /></div>
            </div>
          ))}
          {user.licenses.length === 0 && <p className="text-gray-600 text-sm text-center py-4">No licenses</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Sessions">
          <div className="space-y-2">
            {user.sessions.map((s) => (
              <div key={s.id} className="flex justify-between items-center px-3 py-2 bg-black/50 border border-gray-800 rounded text-xs">
                <div><p className="text-gray-300 font-mono">{s.ip} • {s.pcName ?? 'unknown PC'}</p><p className="text-gray-600">{new Date(s.lastActivity).toLocaleString('pt-BR')} {s.expiresAt < new Date() && '(expired)'}</p></div>
                {s.expiresAt > new Date() && <span className="text-green-400">ACTIVE</span>}
              </div>
            ))}
            {user.sessions.length === 0 && <p className="text-gray-600 text-xs text-center py-3">No sessions</p>}
          </div>
        </Card>
        <Card title="Authentication History">
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex justify-between px-3 py-1.5 rounded hover:bg-[#111] text-xs">
                <span className="text-white">{h.action}</span>
                <span className="text-gray-600 font-mono">{new Date(h.createdAt).toLocaleString('pt-BR')}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-gray-600 text-xs text-center py-3">No events</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}