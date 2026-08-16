'use client';

import { ReactNode, FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { btn, input, label } from './ui';

export function ActionForm({ action, confirmText, children, className = 'inline' }: { 
  action: any; // Tipagem flexível para aceitar qualquer Server Action
  confirmText?: string; 
  children: ReactNode; 
  className?: string 
}) {
  const [armed, setArmed] = useState(false);

  return (
    <form
      action={action as any} // Cast para bypassar a checagem estrita do Next.js
      className={`${className} ${armed ? 'outline outline-1 outline-red-600 rounded' : ''}`}
      onSubmit={(e) => {
        if (confirmText && !armed) {
          e.preventDefault();
          setArmed(true);
          setTimeout(() => setArmed(false), 3000); // Reseta após 3s se não clicar de novo
        }
      }}
    >
      {children}
    </form>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-[#0a0a0a] border border-red-600/30 rounded-lg shadow-2xl shadow-red-900/20 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={btn.gray}
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}
    >
      {ok ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

export function SecretView({ data }: { data: { publicId?: string; secret?: string; token?: string; keys?: string[] } }) {
  return (
    <div className="space-y-3">
      {data.publicId && (
        <div>
          <span className={label}>Public ID</span>
          <div className="flex gap-2 items-center">
            <code className="text-xs text-gray-300 bg-black border border-gray-800 rounded px-2 py-1 flex-1 break-all">{data.publicId}</code>
            <CopyBtn text={data.publicId} />
          </div>
        </div>
      )}
      {data.secret && (
        <div>
          <span className={label}>Secret — shown ONCE, store it now</span>
          <div className="flex gap-2 items-center">
            <code className="text-xs text-red-400 bg-black border border-red-900/50 rounded px-2 py-1 flex-1 break-all">{data.secret}</code>
            <CopyBtn text={data.secret} />
          </div>
        </div>
      )}
      {data.token && (
        <div>
          <span className={label}>Token — shown ONCE, store it now</span>
          <div className="flex gap-2 items-center">
            <code className="text-xs text-red-400 bg-black border border-red-900/50 rounded px-2 py-1 flex-1 break-all">{data.token}</code>
            <CopyBtn text={data.token} />
          </div>
        </div>
      )}
      {data.keys && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={label}>Generated keys ({data.keys.length})</span>
            <CopyBtn text={data.keys.join('\n')} />
          </div>
          <pre className="text-xs text-gray-300 bg-black border border-gray-800 rounded p-3 max-h-64 overflow-auto">{data.keys.join('\n')}</pre>
        </div>
      )}
      <p className="text-[11px] text-yellow-500">⚠️ This information will not be shown again.</p>
    </div>
  );
}

export function InvokeButton({ fn, arg, label: text, className = btn.blue }: { fn: (...args: any[]) => Promise<any>; arg?: any; label: string; className?: string }) {
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={className}
        onClick={async () => {
          setBusy(true);
          try {
            const r = arg !== undefined ? await fn(arg) : await fn();
            if (r && (r.secret || r.token || r.keys || r.publicId)) setResult(r);
            router.refresh();
          } catch (e: any) {
            alert(e.message ?? 'Error');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '...' : text}
      </button>
      {result && (
        <Modal title="Generated credentials" onClose={() => setResult(null)}>
          <SecretView data={result} />
        </Modal>
      )}
    </>
  );
}

export type FieldDef = {
  name: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  default?: string;
};

export function ClientForm({ submitLabel, fn, fields, cols = 'grid-cols-2' }: { submitLabel: string; fn: (fd: FormData) => Promise<any>; fields: FieldDef[]; cols?: string }) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.default ?? ''])));
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fields.forEach((f) => fd.append(f.name, values[f.name] ?? ''));
      const r = await fn(fd);
      if (r && (r.secret || r.token || r.keys || r.publicId)) setResult(r);
      router.refresh();
    } catch (e: any) {
      alert(e.message ?? 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className={`grid ${cols} gap-3`}>
        {fields.map((f) => (
          <div key={f.name} className={f.type === 'textarea' ? 'col-span-full' : ''}>
            <span className={label}>
              {f.label}
              {f.required && <span className="text-red-500"> *</span>}
            </span>
            {f.type === 'select' ? (
              <select
                required={f.required}
                className={input}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea
                required={f.required}
                rows={4}
                placeholder={f.placeholder}
                className={input}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            ) : (
              <input
                required={f.required}
                type={f.type}
                placeholder={f.placeholder}
                className={input}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
              />
            )}
          </div>
        ))}
        <div className="flex items-end">
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy ? '...' : submitLabel}
          </button>
        </div>
      </form>
      {result && (
        <Modal title="Generated" onClose={() => setResult(null)}>
          <SecretView data={result} />
        </Modal>
      )}
    </>
  );
}