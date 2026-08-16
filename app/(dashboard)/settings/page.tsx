import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, btn, input, label, Th, Td, TableShell } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { changeAdminPassword, revokeAdminSession } from '@/actions/admin';

export default async function SettingsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const admin = await db.admin.findUnique({ where: { id: session.adminId } });
  const sessions = await db.adminSession.findMany({ where: { adminId: session.adminId }, orderBy: { lastActivity: 'desc' } });

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle={`Signed in as ${admin?.email}`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Change Password (invalidates other sessions)">
          <form action={changeAdminPassword} className="space-y-3">
            <div><span className={label}>Current password</span><input name="current" type="password" required className={input} /></div>
            <div><span className={label}>New password (min 8)</span><input name="next" type="password" required minLength={8} className={input} /></div>
            <button className={btn.primary}>Update Password</button>
          </form>
        </Card>
        <Card title="Environment">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Webhook</span><span className={process.env.WEBHOOK_URL ? 'text-green-400' : 'text-gray-600'}>{process.env.WEBHOOK_URL ? 'Configured' : 'Not configured'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Rate Limiter</span><span className={process.env.NODE_ENV === 'production' ? 'text-red-400' : 'text-yellow-400'}>{process.env.NODE_ENV === 'production' ? 'Requires distributed store' : 'In-memory (dev only)'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Database</span><span className="text-green-400">PostgreSQL</span></div>
          </div>
        </Card>
      </div>
      <Card title="Admin Sessions">
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex justify-between items-center px-3 py-2 bg-black/50 border border-gray-800 rounded text-xs">
              <div><p className="text-gray-300 font-mono">{s.ip} • {s.userAgent?.slice(0, 50)}</p><p className="text-gray-600">last activity {new Date(s.lastActivity).toLocaleString('pt-BR')}{s.id === session.id && ' (current)'}</p></div>
              {s.id !== session.id && <ActionForm action={revokeAdminSession.bind(null, s.id)}><button className={btn.red}>Revoke</button></ActionForm>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}