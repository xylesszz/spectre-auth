import { login } from '@/actions/admin';

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const invalid = searchParams?.error === '1';

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <form
        action={login}
        className="w-full max-w-sm space-y-4 p-8 bg-[#0a0a0a] border border-red-600/30 rounded-lg shadow-2xl shadow-red-900/20"
      >
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white">
            SPECTRE <span className="text-red-600">AUTH</span>
          </h1>
          <p className="text-xs text-gray-500 mt-2">Enter your credentials</p>
        </div>

        {invalid && (
          <p className="text-red-500 text-xs text-center bg-red-950/40 border border-red-800/50 rounded py-2">
            ✕ Invalid credentials
          </p>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1">Email</label>
          <input
            name="email"
            type="email"
            required
            autoFocus
            placeholder="admin@example.com"
            className="w-full px-3 py-2 bg-black border border-gray-800 rounded text-white text-sm focus:outline-none focus:border-red-600"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Password</label>
          <input
            name="password"
            type="password"
            required
            placeholder="••••••••"
            className="w-full px-3 py-2 bg-black border border-gray-800 rounded text-white text-sm focus:outline-none focus:border-red-600"
          />
        </div>

        {/* CSRF token (hidden) */}
        <input type="hidden" name="_csrf" value="csrf-token" />

        <button className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded transition-colors">
          Access
        </button>
      </form>
    </div>
  );
}