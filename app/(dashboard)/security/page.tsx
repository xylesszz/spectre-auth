import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn, input, label } from '@/components/ui';
import { ActionForm } from '@/components/client';
import { createRule, toggleRule, deleteRule } from '@/actions/security';

export default async function SecurityPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const kind = searchParams.kind === 'WHITELIST' ? 'WHITELIST' : 'BLACKLIST';
  const [rules, apps] = await db.$transaction([
    db.blacklistRule.findMany({ where: { kind }, include: { app: true }, orderBy: { createdAt: 'desc' } }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Security Rules" subtitle="IP / HWID / User / License blacklists and whitelists">
        <div className="flex gap-2">
          <a href="/security?kind=BLACKLIST" className={kind === 'BLACKLIST' ? btn.red : btn.gray}>Blacklists</a>
          <a href="/security?kind=WHITELIST" className={kind === 'WHITELIST' ? btn.green : btn.gray}>Whitelists</a>
        </div>
      </PageHeader>

      <Card title={`Create ${kind.toLowerCase()} rule`}>
        <form action={createRule} className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <input type="hidden" name="kind" value={kind} />
          <div><span className={label}>Type</span><select name="type" className={input}>{['IP', 'HWID', 'USER', 'LICENSE'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div className="col-span-2"><span className={label}>Value</span><input name="value" required className={input} placeholder="value to block/allow" /></div>
          <div><span className={label}>Application</span><select name="appId" className={input}><option value="">Global (all apps)</option>{apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div><span className={label}>Reason</span><input name="reason" className={input} /></div>
          <div><span className={label}>Expires (hours, 0=∞)</span><input name="hours" type="number" min={0} defaultValue={0} className={input} /></div>
          <div className="col-span-2 md:col-span-6"><button className={btn.primary}>Create Rule</button></div>
        </form>
      </Card>

      <TableShell colSpan={7} empty={rules.length === 0} head={<><Th>Type</Th><Th>Value</Th><Th>Scope</Th><Th>Reason</Th><Th>Expires</Th><Th>Status</Th><Th></Th></>}>
        {rules.map((r) => (
          <tr key={r.id} className="hover:bg-[#111]">
            <Td><Badge status={r.kind} /></Td>
            <Td className="font-mono text-xs text-white">{r.value}</Td>
            <Td className="text-xs">{r.app?.name ?? 'Global'}</Td>
            <Td className="text-xs">{r.reason ?? '—'}</Td>
            <Td className="text-xs">{r.expiresAt ? new Date(r.expiresAt).toLocaleString('pt-BR') : 'Permanent'}</Td>
            <Td>{r.active ? <Badge status="ACTIVE" /> : <Badge status="DISABLED" />}</Td>
            <Td>
              <div className="flex gap-2">
                <ActionForm action={toggleRule.bind(null, r.id)}><button className={btn.yellow}>{r.active ? 'Disable' : 'Enable'}</button></ActionForm>
                <ActionForm action={deleteRule.bind(null, r.id)} confirmText="Delete rule?"><button className={btn.red}>Delete</button></ActionForm>
              </div>
            </Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}