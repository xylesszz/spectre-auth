import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';

export default async function OverviewPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const stats = await db.$transaction([
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.license.count({ where: { status: 'ACTIVE' } }),
    db.license.count({ where: { status: 'EXPIRED' } }),
    db.application.count({ where: { status: 'ACTIVE' } }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold text-white mb-8">Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wider">Active Users</p>
          <p className="text-3xl font-bold text-white mt-2">{stats[0]}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wider">Active Licenses</p>
          <p className="text-3xl font-bold text-white mt-2">{stats[1]}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wider">Expired Licenses</p>
          <p className="text-3xl font-bold text-white mt-2">{stats[2]}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wider">Active Apps</p>
          <p className="text-3xl font-bold text-white mt-2">{stats[3]}</p>
        </div>
      </div>
    </div>
  );
}