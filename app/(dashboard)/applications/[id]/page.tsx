import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, btn, input, label } from '@/components/ui';
import { InvokeButton } from '@/components/client';
import { regenerateAppSecret, updateAppSettings } from '@/actions/applications';

export default async function AppDetailsPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { secret?: string };
}) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const app = await db.application.findUnique({
    where: { id: params.id },
    include: {
      credentials: { orderBy: { createdAt: 'desc' }, take: 5 },
      _count: { select: { users: true, licenses: true, sessions: true } },
    },
  });
  if (!app) notFound();

  const apiLogs = await db.auditLog.findMany({
    where: { entityType: 'API', entityId: app.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const activeCred = app.credentials.find((c) => c.status === 'ACTIVE');
  const newSecret = searchParams.secret;

  return (
    <div className="space-y-6">
      {/* Alerta de novo secret */}
      {newSecret && (
        <div className="bg-green-900/20 border border-green-700/50 rounded p-4">
          <p className="text-green-300 font-bold">✅ Novo Secret gerado!</p>
          <code className="block bg-black/50 p-2 rounded text-sm font-mono text-white break-all">{newSecret}</code>
          <p className="text-xs text-gray-400 mt-1">Este secret é mostrado apenas uma vez. Guarde-o com segurança.</p>
        </div>
      )}

      <PageHeader title={app.name} subtitle={`slug: ${app.slug}`}>
        <Badge status={app.status} />
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="API Credentials"
          actions={
            <InvokeButton
              fn={regenerateAppSecret}
              arg={app.id}
              label="Regenerate Secret"
              className={btn.yellow}
            />
          }
        >
          <div className="space-y-3 text-sm">
            <div>
              <span className={label}>Public ID (header X-App-Id)</span>
              <code className="text-xs text-gray-300 bg-black border border-gray-800 rounded px-2 py-1 block break-all">
                {activeCred?.publicId ?? '—'}
              </code>
            </div>
            <div>
              <span className={label}>Secret (header X-App-Secret)</span>
              <code className="text-xs text-red-400 bg-black border border-red-900/40 rounded px-2 py-1 block">
                ••••••••••••••••••••••••••••••••••••
              </code>
            </div>
            <p className="text-[11px] text-gray-600">
              Secrets are stored as bcrypt hashes and shown only once at generation/regeneration.
            </p>
            <div className="text-xs text-gray-500">
              Last used: {activeCred?.lastUsedAt ? new Date(activeCred.lastUsedAt).toLocaleString('pt-BR') : 'never'}
            </div>
          </div>
        </Card>

        <Card title="Usage">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white">{app._count.users}</p>
              <p className="text-xs text-gray-500">Users</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{app._count.licenses}</p>
              <p className="text-xs text-gray-500">Licenses</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{app._count.sessions}</p>
              <p className="text-xs text-gray-500">Sessions</p>
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <Link href={`/users?app=${app.id}`} className={btn.blue}>
              View Users
            </Link>
            <Link href={`/licenses?app=${app.id}`} className={btn.blue}>
              View Licenses
            </Link>
          </div>
        </Card>
      </div>

      <Card title="Security Settings (enforced server-side on every API call)">
        <form action={updateAppSettings.bind(null, app.id)} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <span className={label}>Version</span>
            <input name="version" defaultValue={app.version ?? '1.0.0'} className={input} />
          </div>
          <div>
            <span className={label}>Min HWID Length</span>
            <input
              name="minHwidLength"
              type="number"
              min={0}
              defaultValue={app.minHwidLength ?? 16}
              className={input}
            />
          </div>
          <div>
            <span className={label}>Session Expiry (min)</span>
            <input
              name="sessionExpirationMinutes"
              type="number"
              min={5}
              defaultValue={app.sessionExpirationMinutes ?? 1440}
              className={input}
            />
          </div>
          <div>
            <span className={label}>Min Username Length</span>
            <input
              name="minUsernameLength"
              type="number"
              min={1}
              defaultValue={(app as any).minUsernameLength ?? 3}
              className={input}
            />
          </div>
          <div>
            <span className={label}>HWID Reset Cooldown (min)</span>
            <input
              name="hwidResetCooldownMinutes"
              type="number"
              min={0}
              defaultValue={(app as any).hwidResetCooldownMinutes ?? 0}
              className={input}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-300 mt-5">
            <input type="checkbox" name="hwidLock" defaultChecked={app.hwidLock} className="accent-red-600" />
            HWID Lock
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 mt-5">
            <input type="checkbox" name="forceHwid" defaultChecked={app.forceHwid} className="accent-red-600" />
            Force HWID
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 mt-5">
            <input type="checkbox" name="vpnBlock" defaultChecked={app.vpnBlock} className="accent-red-600" />
            VPN Block
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300 mt-5">
            <input type="checkbox" name="maintenanceMode" defaultChecked={app.maintenanceMode} className="accent-red-600" />
            Maintenance Mode
          </label>
          <div className="col-span-2 md:col-span-4">
            <button className={btn.primary}>Save Settings</button>
          </div>
        </form>
      </Card>

      <Card title="Recent API Activity">
        <div className="space-y-1">
          {apiLogs.length === 0 && <p className="text-gray-600 text-sm text-center py-6">No API activity yet</p>}
          {apiLogs.map((l) => (
            <div key={l.id} className="flex justify-between px-3 py-2 rounded hover:bg-[#111] text-sm">
              <span className="text-white font-medium">{l.action}</span>
              <span className="text-xs text-gray-600 font-mono">
                {l.ip} • {new Date(l.createdAt).toLocaleTimeString('pt-BR')}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}