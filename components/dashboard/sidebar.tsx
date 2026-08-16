'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, AppWindow, Users, Key, Shield, Coins, Braces, Lock, ScrollText, Activity, Settings, LogOut } from 'lucide-react';
import { logout } from '@/actions/admin';

const groups = [
  { title: null as string | null, items: [{ href: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  { title: 'Management', items: [
    { href: '/applications', label: 'Applications', icon: AppWindow },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/licenses', label: 'Licenses', icon: Key },
  ]},
  { title: 'Security', items: [
    { href: '/sessions', label: 'Sessions', icon: Shield },
    { href: '/tokens', label: 'Tokens', icon: Coins },
    { href: '/variables', label: 'Variables', icon: Braces },
    { href: '/security', label: 'Blacklists', icon: Lock },
  ]},
  { title: 'System', items: [
    { href: '/api-logs', label: 'API Logs', icon: Activity },
    { href: '/audit', label: 'Audit Logs', icon: ScrollText },
    { href: '/settings', label: 'Settings', icon: Settings },
  ]},
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-r border-gray-800/50 bg-[#030303] flex flex-col sticky top-0 h-screen">
      <div className="p-6 border-b border-gray-800/50">
        <Link href="/" className="group">
          <h1 className="text-xl font-bold text-white tracking-tight group-hover:text-red-500 transition-colors">
            SPECTRE <span className="text-red-600">AUTH</span>
          </h1>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mt-1">Private Infrastructure</p>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-4 space-y-5">
        {groups.map((g, i) => (
          <div key={i}>
            {g.title && (
              <p className="px-3 mb-2 text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
                {g.title}
              </p>
            )}
            <div className="space-y-0.5">
              {g.items.map((l) => {
                const Icon = l.icon;
                const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-red-600/10 to-red-600/5 text-red-500 border-red-600/30 shadow-lg shadow-red-900/10'
                        : 'text-gray-400 border-transparent hover:bg-gray-800/30 hover:text-white hover:border-gray-700/50'
                    }`}
                  >
                    <Icon
                      size={16}
                      className={`transition-transform duration-200 ${
                        active ? 'scale-110' : 'group-hover:scale-105'
                      }`}
                    />
                    <span>{l.label}</span>
                    {active && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500 pulse-red" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-800/50">
        <form action={logout}>
          <button className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-red-600/10 hover:text-red-400 w-full transition-all duration-200 border border-transparent hover:border-red-600/30">
            <LogOut size={16} />
            Logout
          </button>
        </form>
      </div>
    </aside>
  );
}