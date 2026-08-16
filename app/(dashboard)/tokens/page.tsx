import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn } from '@/components/ui';
import { ClientForm, ActionForm } from '@/components/client';
import { createToken, revokeToken, deleteToken } from '@/actions/tokens';

export default async function TokensPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const [tokens, apps] = await db.$transaction([
    db.appToken.findMany({ include: { app: true }, orderBy: { createdAt: 'desc' } }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Tokens" subtitle="Optional pre-authentication tokens per application" />
      <Card title="Create Token">
        <ClientForm submitLabel="Create Token" fn={createToken} fields={[
          { name: 'appId', label: 'Application', type: 'select', required: true, options: apps.map((a) => ({ value: a.id, label: a.name })) },
          { name: 'name', label: 'Token Name', type: 'text', required: true, placeholder: 'beta-access' },
        ]} />
      </Card>
      <TableShell colSpan={6} empty={tokens.length === 0} head={<><Th>Name</Th><Th>Application</Th><Th>Status</Th><Th>Created</Th><Th>Last Used</Th><Th></Th></>}>
        {tokens.map((t) => (
          <tr key={t.id} className="hover:bg-[#111]">
            <Td className="text-white">{t.name}</Td>
            <Td>{t.app?.name ?? '—'}</Td>
            <Td><Badge status={t.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED'} /></Td>
            <Td className="text-xs">{new Date(t.createdAt).toLocaleString('pt-BR')}</Td>
            <Td className="text-xs">{t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleString('pt-BR') : 'â€”'}</Td>
            <Td>
              <div className="flex gap-2">
                {t.status === 'ACTIVE' && <ActionForm action={revokeToken.bind(null, t.id)}><button className={btn.yellow}>Revoke</button></ActionForm>}
                <ActionForm action={deleteToken.bind(null, t.id)} confirmText="Delete token?"><button className={btn.red}>Delete</button></ActionForm>
              </div>
            </Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}