'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; message: string; type: 'success' | 'error' | 'info' };

export function toast(message: string, type: Toast['type'] = 'info') {
  window.dispatchEvent(new CustomEvent('spectre-toast', { detail: { message, type } }));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let id = 0;
    const on = (e: Event) => {
      const detail = (e as CustomEvent).detail as { message: string; type: Toast['type'] };
      const t: Toast = { id: ++id, message: detail.message, type: detail.type };
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4000);
    };
    window.addEventListener('spectre-toast', on);
    return () => window.removeEventListener('spectre-toast', on);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[100] space-y-2 w-80 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in px-4 py-3 rounded-lg border text-sm shadow-2xl backdrop-blur-md ${
            t.type === 'success'
              ? 'bg-green-950/90 border-green-700/50 text-green-300'
              : t.type === 'error'
              ? 'bg-red-950/90 border-red-700/50 text-red-300'
              : 'bg-[#111]/95 border-gray-700 text-gray-200'
          }`}
        >
          <span className="mr-2">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.message}
        </div>
      ))}
    </div>
  );
}