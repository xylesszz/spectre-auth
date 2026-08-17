import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Th, Td, TableShell, btn, input, label } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { setAppVariable, deleteAppVariable } from '@/actions/variables';

export default async function VariablesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const appFilter = searchParams.app;
  
  // CORREÇÃO: db.variable em vez de db.appVariable
  const [vars, apps] = await db.$transaction([
    db.variable.findMany({ 
      where: appFilter ? { appId: appFilter } : {}, 
      include: { app: true }, 
      orderBy: { createdAt: 'desc' } 
    }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Variables" subtitle="Manage global and application-specific variables" />

      <Card title="Create Variable">
        <form action={async (fd) => { await setAppVariable(fd); }} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <span className={label}>Application</span>
            <select name="appId" className={input} required>
              <option value="">Select App</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Key</span>
            <input name="key" required className={input} placeholder="e.g. API_VERSION" />
          </div>
          <div>
            <span className={label}>Value</span>
            <input name="value" required className={input} placeholder="e.g. 1.0.4" />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btn.primary} w-full`}>Set Variable</button>
          </div>
        </form>
      </Card>

      <Card title={`Variables (${vars.length})`}>
        <TableShell 
          colSpan={4} 
          empty={vars.length === 0} 
          head={
            <>
              <Th>Key</Th>
              <Th>Value</Th>
              <Th>Application</Th>
              <Th></Th>
            </>
          }
        >
          {vars.map((v) => (
            <tr key={v.id} className="hover:bg-[#111]">
              <Td className="font-mono text-xs text-white">{v.key}</Td>
              <Td className="font-mono text-xs text-gray-300">{v.value}</Td>
              <Td className="text-xs">{v.app?.name ?? 'Unknown'}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  <ActionForm action={deleteAppVariable.bind(null, v.id)} confirmText="Delete this variable?">
                    <button type="submit" className={btn.red}>Delete</button>
                  </ActionForm>
                </div>
              </Td>
            </tr>
          ))}
        </TableShell>
      </Card>
    </div>
  );
}