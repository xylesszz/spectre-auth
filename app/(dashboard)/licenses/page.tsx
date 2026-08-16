import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn, input } from '@/components/ui';
import { ClientForm } from '@/components/client';
import { generateLicenses } from '@/actions/licenses';

export default async function LicensesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const q = searchParams.q ?? '';
  const status = searchParams.status;
  const app = searchParams.app;

  const where: any = {};
  if (q) {
    where.OR = [
      { key: { contains: q.toUpperCase() } },
      { id: { contains: q } },
      { user: { username: { contains: q, mode: 'insensitive' } } },
    ];
  }
  if (status) where.status = status;
  if (app) where.appId = app;

  const [licenses, apps] = await db.$transaction([
    db.license.findMany({
      where,
      include: { app: true, user: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Licenses" subtitle={`${licenses.length} licenses`} />

      {/* Search + Filters (server-side) */}
      <form className="flex flex-wrap gap-3">
        <input name="q" defaultValue={q} placeholder="Search key / ID / username" className={`${input} max-w-md`} />
        <select name="status" defaultValue={status ?? ''} className={`${input} w-40`}>
          <option value="">All statuses</option>
          {['UNUSED', 'ACTIVE', 'EXPIRED', 'REVOKED', 'SUSPENDED', 'BANNED'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select name="app" defaultValue={app ?? ''} className={`${input} w-48`}>
          <option value="">All applications</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button className={btn.primary}>Filter</button>
      </form>

      {/* License Generator */}
      <Card title="License Generator (cryptographically secure keys)">
        <ClientForm
          submitLabel="Generate"
          fn={generateLicenses}
          cols="grid-cols-2 md:grid-cols-4"
          fields={[
            {
              name: 'appId',
              label: 'Application (optional)',
              type: 'select',
              options: [
                { value: '', label: '— none (general) —' },
                ...apps.map((a) => ({ value: a.id, label: a.name })),
              ],
            },
            {
              name: 'mode',
              label: 'Mode',
              type: 'select',
              default: 'random',
              options: [
                { value: 'random', label: 'Random keys' },
                { value: 'custom', label: 'Custom keys' },
              ],
            },
            { name: 'quantity', label: 'Quantity (1-500)', type: 'number', default: '1' },
            {
              name: 'duration',
              label: 'Duration',
              type: 'select',
              default: '30',
              options: ['1', '3', '7', '14', '30', '60', '90', '180', '365']
                .map((d) => ({ value: d, label: `${d} Days` }))
                .concat([{ value: 'lifetime', label: 'Lifetime' }]),
            },
            { name: 'maxActivations', label: 'Max Activations', type: 'number', default: '1' },
            { name: 'prefix', label: 'Prefix (optional)', type: 'text', placeholder: 'SPC' },
            {
              name: 'separator',
              label: 'Separator',
              type: 'select',
              default: 'dash',
              options: [
                { value: 'dash', label: 'Dash (XXXX-XXXX-XXXX-XXXX)' },
                { value: 'none', label: 'None (XXXXXXXXXXXXXXXX)' },
              ],
            },
            {
              name: 'customKeys',
              label: 'Custom keys (one per line — letters/numbers/dashes only)',
              type: 'textarea',
              placeholder: 'SPC-AB12-CD34-EF56\nMYKEY2026A',
            },
          ]}
        />
      </Card>

      {/* Licenses Table */}
      <TableShell
        colSpan={7}
        empty={licenses.length === 0}
        head={
          <>
            <Th>Key</Th>
            <Th>Status</Th>
            <Th>Application</Th>
            <Th>User</Th>
            <Th>Expiration</Th>
            <Th>Activations</Th>
            <Th></Th>
          </>
        }
      >
        {licenses.map((l) => (
          <tr key={l.id} className="hover:bg-[#111] transition-colors">
            <Td className="font-mono text-xs text-gray-300">{l.key}</Td>
            <Td><Badge status={l.status} /></Td>
            <Td>{l.app?.name ?? <span className="text-gray-600">General</span>}</Td>
            <Td>
              {l.user ? (
                <Link className="text-red-400 hover:text-red-300 transition-colors" href={`/users/${l.user.id}`}>
                  {l.user?.username ?? '—'}
                </Link>
              ) : (
                '—'
              )}
            </Td>
            <Td className="text-xs">
              {l.expiresAt ? (
                new Date(l.expiresAt).toLocaleDateString('pt-BR')
              ) : (
                <span className="text-purple-400">Lifetime</span>
              )}
            </Td>
            <Td className="text-xs">{l.activationCount}/{l.maxActivations}</Td>
            <Td>
              <Link href={`/licenses/${l.id}`} className={btn.blue}>Manage</Link>
            </Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}