import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, btn, input, label, Th, Td, TableShell } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { 
  setLicenseStatus, 
  extendLicense, 
  resetLicenseHwid, 
  assignLicense, 
  unassignLicense, 
  deleteLicense 
} from '@/actions/licenses';

export default async function LicenseDetailsPage({ params }: { params: { id: string } }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const lic = await db.license.findUnique({ 
    where: { id: params.id }, 
    include: { app: true, user: true } 
  });
  
  if (!lic) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={`License: ${lic.key}`} subtitle={`ID: ${lic.id}`}>
        <div className="flex items-center gap-3">
          <Badge status={lic.status} />
          <ActionForm action={deleteLicense.bind(null, lic.id)} confirmText="Permanently delete this license?">
            <button className={btn.red}>Delete License</button>
          </ActionForm>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Information">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Application</span><Link href={`/applications/${lic.app.id}`} className="text-white hover:text-red-500">{lic.app.name}</Link></div>
            <div className="flex justify-between"><span className="text-gray-500">Status</span><Badge status={lic.status} /></div>
            <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-white">{new Date(lic.createdAt).toLocaleString('pt-BR')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Expires</span><span className="text-white">{lic.expiresAt ? new Date(lic.expiresAt).toLocaleString('pt-BR') : 'Lifetime'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last Validation</span><span className="text-white">{lic.lastValidationAt ? new Date(lic.lastValidationAt).toLocaleString('pt-BR') : 'Never'}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Last IP</span><span className="text-white font-mono text-xs">{lic.lastIp ?? '—'}</span></div>
            <div><span className="text-gray-500 block mb-1">HWID</span><code className="text-xs text-gray-300 bg-black border border-gray-800 rounded px-2 py-1 block break-all">{lic.hwidHash ?? 'Not bound'}</code></div>
          </div>
        </Card>

        <Card title="Actions">
          <div className="grid grid-cols-2 gap-2">
            {lic.status === 'UNUSED' || lic.status === 'ACTIVE' ? (
              <ActionForm action={setLicenseStatus.bind(null, lic.id, 'REVOKED')} confirmText="Revoke this license?">
                <button className={`${btn.red} w-full`}>Revoke</button>
              </ActionForm>
            ) : (
              <ActionForm action={setLicenseStatus.bind(null, lic.id, 'ACTIVE')}>
                <button className={`${btn.green} w-full`}>Activate</button>
              </ActionForm>
            )}
            
            <ActionForm action={resetLicenseHwid.bind(null, lic.id)} confirmText="Reset HWID for this license?">
              <button className={`${btn.blue} w-full`}>Reset HWID</button>
            </ActionForm>

            <form action={extendLicense.bind(null, lic.id)} className="col-span-2 space-y-2">
              <input name="days" type="number" min={1} max={3650} placeholder="Extend days" className={input} required />
              <button className={`${btn.gray} w-full`}>Extend Expiration</button>
            </form>
          </div>
        </Card>

        <Card title="User Assignment">
          {lic.user ? (
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-black/50 border border-gray-800 rounded">
                <div>
                  <Link href={`/users/${lic.user.id}`} className="text-sm text-white font-medium hover:text-red-500">{lic.user.username}</Link>
                  <p className="text-xs text-gray-500">Assigned user</p>
                </div>
                <ActionForm action={unassignLicense.bind(null, lic.id)}>
                  <button className="text-xs text-red-500 hover:text-red-400">Unassign</button>
                </ActionForm>
              </div>
            </div>
          ) : (
            <form action={assignLicense.bind(null, lic.id)} className="space-y-2">
              <input name="username" placeholder="Username to assign" className={input} required />
              <button className={`${btn.blue} w-full`}>Assign User</button>
            </form>
          )}
        </Card>
      </div>

      {/* Removida a seção de "Activation History" pois o schema atual não tem tabela de activations */}
      {/* Se precisar de histórico, teríamos que adicionar uma tabela ActivationLog no schema */}
    </div>
  );
}