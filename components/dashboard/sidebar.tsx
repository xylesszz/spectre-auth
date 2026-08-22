import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { db } from '@/lib/db';
import { getAdminSession } from '@/lib/session';
import { logout } from '@/actions/admin';
import { ActionForm } from '@/components/client';

// Ícones simples (substitua pelos seus se tiver lucide-react ou heroicons)
const Icon = ({ d }: { d: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export default async function Sidebar() {
  const session = await getAdminSession();
  const pathname = usePathname();

  // 🛡️ CORREÇÃO RAIZ: Se for o Master, não busca no banco. Cria um objeto fictício.
  const admin = session?.adminId === 'MASTER' 
    ? { id: 'MASTER', email: 'master@system.local', name: 'Master Admin' }
    : await db.admin.findUnique({ where: { id: session?.adminId || '' } }).catch(() => null);

  const links = [
    { href: '/', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { href: '/applications', label: 'Applications', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { href: '/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { href: '/licenses', label: 'Licenses', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
    { href: '/sessions', label: 'Sessions', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { href: '/tokens', label: 'API Tokens', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
    { href: '/variables', label: 'Variables', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    { href: '/security', label: 'Security', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    { href: '/audit', label: 'Audit Logs', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  ];

  return (
    <aside className="w-64 bg-[#0a0a0a] border-r border-gray-800 flex flex-col min-h-screen sticky top-0">
      <div className="p-6 border-b border-gray-800">
        <Link href="/" className="text-xl font-bold text-white tracking-tight hover:text-red-500 transition-colors">
          SPECTRE <span className="text-red-600">AUTH</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-red-950/50 text-red-400 border border-red-900/50'
                  : 'text-gray-400 hover:bg-[#111] hover:text-white'
              }`}
            >
              <Icon d={link.icon} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-3 px-2">
          <div className="w-8 h-8 rounded-full bg-red-950 border border-red-900 flex items-center justify-center text-red-400 text-xs font-bold">
            {admin?.email?.[0]?.toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">Logged in as</p>
            {/* 🛡️ Usa optional chaining (?.) para evitar crash se admin for null por algum motivo */}
            <p className="text-sm text-white font-medium truncate">{admin?.email || 'Unknown'}</p>
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