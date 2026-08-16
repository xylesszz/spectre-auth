import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, btn, input, label, Th, Td, TableShell } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { setLicenseStatus, extendLicense, resetLicenseHwid, resetLicenseActivations, assignLicense, unassignLicense, deleteLicense } from '@/actions/licenses';

export default async function LicenseDetailsPage({ params }: { params: { id: string } }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const lic = await db.license.findUnique({ where: { id: params.id }, include: { app: true, user: true, activations: { orderBy: { createdAt: 'desc' }, take: 15 } } });
  if (!lic) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={lic.key} subtitle={`ID: ${lic.id}`}>
        <div className="flex items-center gap-3">
          <Badge status={lic.status} />
          <ActionForm action={deleteLicense.bind(null, lic.id)} confirmText="Delete this license permanently?"><button className={btn.red}>Delete</button></ActionForm>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Details">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Application</span><span className="text-white">{lic.app.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">User</span>{lic.user ? <Link href={`/users/${lic.user.id}`} className="text-red-400">{lic.user.username}</Link> : <span>—</span>}</div>
            <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-white">{new Date(lic.createdAt).toLocaleString('pt-BR')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Activated</span><span className="text-white">{lic.activatedAt ? new Date(lic.activatedAt).toLocaleString('pt-BR') : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Expires</span><span className="text-white">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleString('pt-BR') : 'Lifetime'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last Validation</span><span className="text-white">{lic.lastValidationAt ? new Date(lic.lastValidationAt).toLocaleString('pt-BR') : '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last IP</span><span className="text-white font-mono text-xs">{lic.lastIp ?? '—'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Activations</span><span className="text-white">{lic.activationCount}/{lic.maxActivations}</span></div>
            <div><span className="text-gray-500 block mb-1">HWID</span><code className="text-xs text-gray-300 bg-black border border-gray-800 rounded px-2 py-1 block break-all">{lic.hwidHash ?? '—'}</code></div>
          </div>
        </Card>

        <Card title="Status Actions">
          <div className="grid grid-cols-2 gap-2">
            {lic.status !== 'REVOKED' && <ActionForm action={setLicenseStatus.bind(null, lic.id, 'REVOKED')} confirmText="Revoke license?"><button className={`${btn.red} w-full`}>Revoke</button></ActionForm>}
            {(lic.status === 'REVOKED' || lic.status === 'SUSPENDED' || lic.status === 'BANNED') && <ActionForm action={setLicenseStatus.bind(null, lic.id, 'ACTIVE')}><button className={`${btn.green} w-full`}>Restore</button></ActionForm>}
            {lic.status !== 'SUSPENDED' && <ActionForm action={setLicenseStatus.bind(null, lic.id, 'SUSPENDED')}><button className={`${btn.yellow} w-full`}>Suspend</button></ActionForm>}
            {lic.status !== 'BANNED' && <ActionForm action={setLicenseStatus.bind(null, lic.id, 'BANNED')}><button className={`${btn.red} w-full`}>Ban</button></ActionForm>}
            <ActionForm action={resetLicenseHwid.bind(null, lic.id)} confirmText="Reset HWID?"><button className={`${btn.blue} w-full`}>Reset HWID</button></ActionForm>
            <ActionForm action={resetLicenseActivations.bind(null, lic.id)} confirmText="Reset activation count?"><button className={`${btn.blue} w-full`}>Reset Activations</button></ActionForm>
            {lic.userId ? (
              <ActionForm action={unassignLicense.bind(null, lic.id)}><button className={`${btn.gray} w-full`}>Unassign User</button></ActionForm>
            ) : (
              <form action={assignLicense.bind(null, lic.id)} className="col-span-2 space-y-2">
                <input name="username" placeholder="username to assign" className={input} required />
                <button className={`${btn.gray} w-full`}>Assign to User</button>
              </form>
            )}
          </div>
          <form action={extendLicense.bind(null, lic.id)} className="flex gap-2 mt-3">
            <input name="days" type="number" min={1} placeholder="days" className={input} required />
            <button className={btn.green}>Extend</button>
          </form>
        </Card>

        <Card title="Activation History">
          <div className="space-y-2">
            {lic.activations.map((a) => (
              <div key={a.id} className="px-3 py-2 bg-black/50 border border-gray-800 rounded text-xs">
                <div className="flex justify-between"><span className="text-gray-300 font-mono">{a.hwidHash ? a.hwidHash.slice(0, 14) + '…' : 'no HWID'}</span><span className="text-gray-600 font-mono">{a.ip}</span></div>
                <p className="text-gray-600 mt-1">{a.pcName ?? 'unknown PC'} • {new Date(a.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))}
            {lic.activations.length === 0 && <p className="text-gray-600 text-xs text-center py-3">Never activated</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}