import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/session';
import Sidebar from '@/components/dashboard/sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-black text-gray-100">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}