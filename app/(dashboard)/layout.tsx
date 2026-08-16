import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/session';
import Sidebar from '@/components/dashboard/sidebar';
import { Toaster } from '@/components/toast';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  return (
    <div className="flex min-h-screen bg-black text-gray-100">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-8 max-w-[1800px]">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}