import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn } from '@/components/ui';
import { ClientForm, ActionForm, InvokeButton } from '@/components/client';
import { createApplication, setAppStatus, deleteApplication, regenerateAppSecret } from '@/actions/applications';

export default async function ApplicationsPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const apps = await db.application.findMany({
    include: { _count: { select: { users: true, licenses: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Applications" subtitle="Private applications and API credentials" />
      <Card title="Create Application (secret shown once)">
        <ClientForm submitLabel="Create Application" fn={createApplication} cols="grid-cols-2 md:grid-cols-5" fields={[
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'SPECTRE CLIENT' },
          { name: 'slug', label: 'ID / Slug', type: 'text', required: true, placeholder: 'spectre-client' },
          { name: 'version', label: 'Version', type: 'text', default: '1.0.0' },
          { name: 'description', label: 'Description', type: 'text', placeholder: 'optional' },
        ]} />
      </Card>
      <TableShell colSpan={7} empty={apps.length === 0} head={<><Th>Name</Th><Th>Status</Th><Th>Version</Th><Th>Users</Th><Th>Licenses</Th><Th>Last API Activity</Th><Th></Th></>}>
        {apps.map((app) => (
          <tr key={app.id} className="hover:bg-[#111] transition-colors">
            <Td className="text-white font-medium"><Link href={`/applications/${app.id}`} className="hover:text-red-500 transition-colors">{app.name}</Link><p className="text-[11px] text-gray-600 font-mono">{app.slug}</p></Td>
            <Td><Badge status={app.status} /></Td>
            <Td>{app.version}</Td>
            <Td>{app._count.users}</Td>
            <Td>{app._count.licenses}</Td>
            <Td className="text-xs">{new Date(app.updatedAt).toLocaleString('pt-BR')}</Td>
            <Td>
              <div className="flex gap-2 justify-end flex-wrap">
                <Link href={`/applications/${app.id}`} className={btn.blue}>Settings</Link>
                <InvokeButton fn={regenerateAppSecret} arg={app.id} label="Regenerate Secret" className={btn.yellow} />
                <ActionForm action={setAppStatus.bind(null, app.id, app.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE')}>
                  <button className={app.status === 'ACTIVE' ? btn.yellow : btn.green}>{app.status === 'ACTIVE' ? 'Pause' : 'Enable'}</button>
                </ActionForm>
                {app.status !== 'DISABLED' ? (
                  <ActionForm action={setAppStatus.bind(null, app.id, 'DISABLED')}><button className={btn.red}>Disable</button></ActionForm>
                ) : (
                  <ActionForm action={deleteApplication.bind(null, app.id)} confirmText="Delete this application?"><button className={btn.red}>Delete</button></ActionForm>
                )}
              </div>
            </Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}