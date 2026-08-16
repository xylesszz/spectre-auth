'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Key, AppWindow, Activity, ScrollText, LogOut } from 'lucide-react';
import { logout } from '@/actions/admin';

const links = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/users', label: 'Users', icon: Users },
  { href: '/licenses', label: 'Licenses', icon: Key },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/sessions', label: 'Sessions', icon: Activity },
  { href: '/logs', label: 'Logs', icon: ScrollText },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-gray-800 bg-[#0a0a0a] flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold tracking-tight text-white">
          SPECTRE <span className="text-red-600">AUTH</span>
        </h1>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive 
                  ? 'bg-red-600/10 text-red-500 border border-red-600/20' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white border border-transparent'
              }`}
            >
              <Icon size={18} />
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-gray-800">
        <form action={logout}>
          <button type="submit" className="flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white w-full">
            <LogOut size={18} />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}