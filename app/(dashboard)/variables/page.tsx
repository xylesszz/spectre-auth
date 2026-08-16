import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Th, Td, TableShell, btn } from '@/components/ui';
import { ClientForm, ActionForm } from '@/components/client';
import { setAppVariable, deleteAppVariable } from '@/actions/variables';

export default async function VariablesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const appFilter = searchParams.app;
  const [vars, apps] = await db.$transaction([
    db.appVariable.findMany({ where: appFilter ? { appId: appFilter } : {}, include: { app: true }, orderBy: { createdAt: 'desc' } }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Variables" subtitle="Global application variables served by /api/v1/variables" />
      <Card title="Set Variable">
        <ClientForm submitLabel="Save Variable" fn={setAppVariable} cols="grid-cols-2 md:grid-cols-4" fields={[
          { name: 'appId', label: 'Application', type: 'select', required: true, options: apps.map((a) => ({ value: a.id, label: a.name })) },
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'latest_version' },
          { name: 'value', label: 'Value', type: 'text', required: true, placeholder: '1.2.0' },
        ]} />
      </Card>
      <form className="flex gap-3">
        <select name="app" defaultValue={appFilter ?? ''} className="bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white">
          <option value="">All applications</option>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className={btn.primary}>Filter</button>
      </form>
      <TableShell colSpan={5} empty={vars.length === 0} head={<><Th>Name</Th><Th>Value</Th><Th>Application</Th><Th></Th></>}>
        {vars.map((v) => (
          <tr key={v.id} className="hover:bg-[#111]">
            <Td className="text-white font-mono text-xs">{v.name}</Td>
            <Td className="font-mono text-xs">{v.value}</Td>
            <Td>{v.app?.name ?? '—'}</Td>
            <Td><ActionForm action={deleteAppVariable.bind(null, v.id)} confirmText="Delete variable?"><button className={btn.red}>Delete</button></ActionForm></Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}