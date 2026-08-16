import { ReactNode } from 'react';

const colors: Record<string, string> = {
  ACTIVE: 'bg-green-900/30 text-green-400 border-green-700/40',
  UNUSED: 'bg-blue-900/30 text-blue-400 border-blue-700/40',
  EXPIRED: 'bg-yellow-900/30 text-yellow-400 border-yellow-700/40',
  REVOKED: 'bg-red-900/30 text-red-400 border-red-700/40',
  SUSPENDED: 'bg-orange-900/30 text-orange-400 border-orange-700/40',
  BANNED: 'bg-red-900/40 text-red-300 border-red-600/50',
  DISABLED: 'bg-gray-800/60 text-gray-400 border-gray-700',
  PAUSED: 'bg-yellow-900/20 text-yellow-500 border-yellow-700/30',
  BLACKLIST: 'bg-red-900/30 text-red-400 border-red-700/40',
  WHITELIST: 'bg-green-900/30 text-green-400 border-green-700/40',
};

export function Badge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${colors[status] ?? 'bg-gray-800/60 text-gray-400 border-gray-700'}`}>{status}</span>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="text-gray-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, children, actions, className = '' }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0a0a0a] border border-gray-800 rounded-lg ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Stat({ label, value, accent = 'text-white' }: { label: string; value: number | string; accent?: string }) {
  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 hover:border-red-600/30 transition-colors">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${accent}`}>{value}</p>
    </div>
  );
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium">{children}</th>;
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm text-gray-400 ${className}`}>{children}</td>;
}

export function TableShell({ head, children, empty, colSpan }: { head: ReactNode; children: ReactNode; empty: boolean; colSpan: number }) {
  return (
    <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#111] border-b border-gray-800"><tr>{head}</tr></thead>
          <tbody className="divide-y divide-gray-800/70">
            {empty ? <tr><td colSpan={colSpan} className="px-4 py-14 text-center text-gray-600 text-sm">No records found</td></tr> : children}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const btn = {
  red: 'px-3 py-1.5 rounded text-xs font-medium bg-red-600/10 text-red-400 border border-red-600/30 hover:bg-red-600/20 transition-colors',
  green: 'px-3 py-1.5 rounded text-xs font-medium bg-green-600/10 text-green-400 border border-green-600/30 hover:bg-green-600/20 transition-colors',
  blue: 'px-3 py-1.5 rounded text-xs font-medium bg-blue-600/10 text-blue-400 border border-blue-600/30 hover:bg-blue-600/20 transition-colors',
  yellow: 'px-3 py-1.5 rounded text-xs font-medium bg-yellow-600/10 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-600/20 transition-colors',
  gray: 'px-3 py-1.5 rounded text-xs font-medium bg-gray-800/50 text-gray-400 border border-gray-700 hover:bg-gray-800 transition-colors',
  primary: 'px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20',
};

export const input = 'w-full bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-red-600 transition-colors';
export const label = 'block text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1';