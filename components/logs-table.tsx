import { db } from '@/lib/db';
import { Th, Td, TableShell, btn } from './ui';

export default async function LogsTable({ apiOnly, page }: { apiOnly: boolean; page: number }) {
  const where = apiOnly ? { action: { startsWith: 'API_' } } : {};
  const [logs, total] = await db.$transaction([
    db.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50 }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 50));
  const base = apiOnly ? '/api-logs' : '/audit';

  return (
    <div className="space-y-4">
      <TableShell colSpan={5} empty={logs.length === 0} head={<><Th>Timestamp</Th><Th>Action</Th><Th>Actor</Th><Th>IP</Th><Th>Metadata</Th></>}>
        {logs.map((l) => (
          <tr key={l.id} className="hover:bg-[#111]">
            <Td className="text-xs font-mono whitespace-nowrap">{new Date(l.createdAt).toLocaleString('pt-BR')}</Td>
            <Td className="text-white text-xs font-medium">{l.action}</Td>
            <Td className="text-xs">{l.actorType ?? '—'}</Td>
            <Td className="text-xs font-mono">{l.ip ?? '—'}</Td>
            <Td className="text-xs font-mono max-w-md truncate">{l.metadata ? JSON.stringify(l.metadata) : '—'}</Td>
          </tr>
        ))}
      </TableShell>
      <div className="flex items-center gap-3 text-sm">
        {page > 1 && <a href={`${base}?page=${page - 1}`} className={btn.gray}>← Previous</a>}
        <span className="text-gray-500 text-xs">Page {page} of {pages}</span>
        {page < pages && <a href={`${base}?page=${page + 1}`} className={btn.gray}>Next →</a>}
      </div>
    </div>
  );
}