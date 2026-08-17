import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, Card, Badge, Th, Td, TableShell, btn, input } from '@/components/ui';
import { ClientForm } from '@/components/client';
import { createUser } from '@/actions/users';

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const q = searchParams.q ?? '';
  const status = searchParams.status;
  const app = searchParams.app;

  const where: any = {};

  // email NÃO existe no model User — removido da busca
  if (q) {
    where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { id: { contains: q } },
      { hwidHash: { contains: q } },
      { lastIp: { contains: q } },
    ];
  }

  if (status) where.status = status;
  if (app) where.appId = app;

  const [users, apps] = await db.$transaction([
    db.user.findMany({
      where,
      include: { app: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    db.application.findMany({ orderBy: { name: 'asc' } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle={`${users.length} users`} />

      <form className="flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search username / ID / HWID / IP"
          className={`${input} max-w-md`}
        />
        <select name="status" defaultValue={status ?? ''} className={`${input} w-40`}>
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="DISABLED">DISABLED</option>
          <option value="BANNED">BANNED</option>
        </select>
        <select name="app" defaultValue={app ?? ''} className={`${input} w-48`}>
          <option value="">All applications</option>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className={btn.primary}>Filter</button>
      </form>

      <Card title="Create User">
        <ClientForm
          submitLabel="Create User"
          fn={createUser}
          cols="grid-cols-2 md:grid-cols-3"
          fields={[
            { name: 'username', label: 'Username', type: 'text', required: true },
            { name: 'password', label: 'Password', type: 'password', required: true },
            {
              name: 'appId',
              label: 'Application',
              type: 'select',
              required: true,
              options: [
                { value: '', label: '— select —' },
                ...apps.map((a) => ({ value: a.id, label: a.name })),
              ],
            },
            // email e licenseKey removidos:
            // - email não existe no schema
            // - licenseKey não é tratado pela action createUser
          ]}
        />
      </Card>

      <TableShell
        colSpan={7}
        empty={users.length === 0}
        head={
          <>
            <Th>Username</Th>
            <Th>Status</Th>
            <Th>Application</Th>
            <Th>HWID</Th>
            <Th>Last IP</Th>
            <Th>Last Login</Th>
            <Th></Th>
          </>
        }
      >
        {users.map((u) => (
          <tr key={u.id} className="hover:bg-[#111] transition-colors">
            <Td className="text-white font-medium">
              <Link href={`/users/${u.id}`} className="hover:text-red-500">
                {u.username}
              </Link>
              <p className="text-[11px] text-gray-600 font-mono">{u.id.slice(0, 12)}…</p>
            </Td>
            <Td>
              <Badge status={u.status} />
            </Td>
            <Td>{u.app?.name ?? '—'}</Td>
            <Td className="font-mono text-xs">
              {u.hwidHash ? u.hwidHash.slice(0, 10) + '…' : '—'}
            </Td>
            <Td className="font-mono text-xs">{u.lastIp ?? '—'}</Td>
            <Td className="text-xs">
              {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('pt-BR') : '—'}
            </Td>
            <Td>
              <Link href={`/users/${u.id}`} className={btn.blue}>
                Manage
              </Link>
            </Td>
          </tr>
        ))}
      </TableShell>
    </div>
  );
}