import { login } from '@/actions/admin';
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/session';

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) redirect('/');

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0a0a0a] border border-gray-800 rounded-lg p-8 shadow-2xl shadow-red-900/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">
            SPECTRE <span className="text-red-600">AUTH</span>
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Private Infrastructure Access</p>
        </div>
        
        <form action={login} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full px-4 py-2.5 bg-black border border-gray-800 rounded-md text-white focus:outline-none focus:border-red-600 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full px-4 py-2.5 bg-black border border-gray-800 rounded-md text-white focus:outline-none focus:border-red-600 transition-colors"
            />
          </div>
          <button
            type="submit"
            className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors shadow-lg shadow-red-900/20"
          >
            Authenticate
          </button>
        </form>
      </div>
    </div>
  );
}