import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { generateLicenseAction, revokeLicenseAction } from '@/actions/licenses';

const formatDate = (date: Date | null) => {
  if (!date) return 'Never';
  return new Intl.DateTimeFormat('pt-BR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
};

export default async function LicensesPage() {
  const session = await getAdminSession();
  if (!session) redirect('/login');

  const licenses = await db.license.findMany({
    include: { app: true, user: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-white">Licenses</h1>
        <form action={generateLicenseAction}>
          <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors">
            Generate License
          </button>
        </form>
      </div>

      <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm text-left text-gray-400">
          <thead className="text-xs text-gray-500 uppercase bg-[#111] border-b border-gray-800">
            <tr>
              <th className="px-6 py-3">Key</th>
              <th className="px-6 py-3">App</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">User</th>
              <th className="px-6 py-3">Expires</th>
              <th className="px-6 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((lic) => (
              <tr key={lic.id} className="bg-[#0a0a0a] border-b border-gray-800 hover:bg-[#111]">
                <td className="px-6 py-4 font-mono text-xs text-gray-300">{lic.key}</td>
                <td className="px-6 py-4">{lic.app.name}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs ${
                    lic.status === 'ACTIVE' ? 'bg-green-900/30 text-green-400' : 
                    lic.status === 'UNUSED' ? 'bg-blue-900/30 text-blue-400' : 
                    lic.status === 'EXPIRED' ? 'bg-yellow-900/30 text-yellow-400' : 
                    'bg-red-900/30 text-red-400'
                  }`}>
                    {lic.status}
                  </span>
                </td>
                <td className="px-6 py-4">{lic.user?.username || '-'}</td>
                <td className="px-6 py-4">{formatDate(lic.expiresAt)}</td>
                <td className="px-6 py-4">
                  {lic.status !== 'REVOKED' && (
                    <form action={revokeLicenseAction.bind(null, lic.id)} className="inline">
                      <button type="submit" className="text-red-500 hover:text-red-400 text-xs font-medium">Revoke</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}