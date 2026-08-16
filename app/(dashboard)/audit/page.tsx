import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import LogsTable from '@/components/logs-table';

export default async function AuditPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Logs" subtitle="Every administrative and security event" />
      <LogsTable apiOnly={false} page={page} />
    </div>
  );
}