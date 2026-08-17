import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn, input, label } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { createToken, deleteToken, revokeToken } from '@/actions/tokens';

export default async function TokensPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  // CORREÇÃO: db.applicationCredential em vez de db.appToken
  const [tokens, apps] = await db.$transaction([
    db.applicationCredential.findMany({ include: { app: true }, orderBy: { createdAt: 'desc' } }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="API Credentials" subtitle="Manage API tokens and secrets for your applications" />

      <Card title="Create Credential">
        <form action={async (fd) => { await createToken(fd); }} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <span className={label}>Application</span>
            <select name="appId" className={input} required>
              <option value="">Select App</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <span className={label}>Description</span>
            <input name="name" required className={input} placeholder="e.g. Production Loader" />
          </div>
          <div className="flex items-end">
            <button type="submit" className={`${btn.primary} w-full`}>Generate Credential</button>
          </div>
        </form>
      </Card>

      <Card title={`Credentials (${tokens.length})`}>
        <TableShell 
          colSpan={5} 
          empty={tokens.length === 0} 
          head={
            <>
              <Th>Public ID</Th>
              <Th>Application</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th></Th>
            </>
          }
        >
          {tokens.map((t) => (
            <tr key={t.id} className="hover:bg-[#111]">
              <Td className="font-mono text-xs text-white">{t.publicId}</Td>
              <Td className="text-xs">{t.app?.name ?? 'Unknown'}</Td>
              <Td><Badge status={t.status} /></Td>
              <Td className="text-xs text-gray-400">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</Td>
              <Td>
                <div className="flex gap-2 justify-end">
                  {t.status === 'ACTIVE' && (
                    <ActionForm action={revokeToken.bind(null, t.id)} confirmText="Revoke this credential?">
                      <button type="submit" className={btn.yellow}>Revoke</button>
                    </ActionForm>
                  )}
                  <ActionForm action={deleteToken.bind(null, t.id)} confirmText="Delete permanently?">
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