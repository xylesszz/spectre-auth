import { login } from '@/actions/admin';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <form action={login} className="w-full max-w-sm space-y-6 bg-[#0a0a0a] border border-gray-800 rounded-lg p-8 shadow-2xl shadow-red-900/10">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            SPECTRE <span className="text-red-600">AUTH</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Painel Administrativo</p>
        </div>
        
        <div className="space-y-2">
          <label className="block text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Master Key
          </label>
          <input
            name="key"
            type="password"
            required
            autoFocus
            placeholder="••••••••••••"
            className="w-full bg-black border border-gray-800 rounded px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-red-600 transition-colors"
          />
        </div>

        <button
          type="submit"
          className="w-full px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg shadow-red-900/20"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}