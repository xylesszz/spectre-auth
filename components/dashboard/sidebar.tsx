import { getAdminSession } from '@/lib/session';
import { logout } from '@/actions/admin';
import { ActionForm } from '@/components/client';
import NavLinks from './nav-links';

export default async function Sidebar() {
  const session = await getAdminSession();
  
  // Não precisa buscar no banco, já sabemos que é o Master
  const adminEmail = 'master@system.local';

  return (
    <aside className="w-64 bg-[#0a0a0a] border-r border-gray-800 flex flex-col min-h-screen sticky top-0">
      <div className="p-6 border-b border-gray-800">
        <a href="/" className="text-xl font-bold text-white tracking-tight hover:text-red-500 transition-colors">
          SPECTRE <span className="text-red-600">AUTH</span>
        </a>
      </div>

      <NavLinks />

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-red-950 border border-red-900 flex items-center justify-center text-red-400 text-xs font-bold">
            M
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">Logged in as</p>
            <p className="text-sm text-white font-medium truncate">{adminEmail}</p>
          </div>
        </div>
        <ActionForm action={logout} confirmText="Are you sure you want to logout?">
          <button type="submit" className="w-full px-3 py-2 text-xs font-medium text-gray-400 bg-[#111] hover:bg-red-950/50 hover:text-red-400 border border-gray-800 hover:border-red-900 rounded-md transition-colors">
            Logout
          </button>
        </ActionForm>
      </div>
    </aside>
  );
}