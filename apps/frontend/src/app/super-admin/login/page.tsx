'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { login, loading, error, superAdmin, hydrated } = useSuperAdminAuth();
  const [email, setEmail] = useState('super@attendance.local');
  const [password, setPassword] = useState('ChangeMe123!');

  useEffect(() => {
    if (hydrated && superAdmin) router.replace('/super-admin');
  }, [hydrated, superAdmin, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      router.replace('/super-admin');
    } catch {
      // error is in store
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🛡️</div>
          <h1 className="text-2xl font-semibold text-slate-100">
            Super Admin Access
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage all companies on the platform
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium text-sm transition"
          >
            {loading ? 'Signing in…' : 'Sign in as Super Admin'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-4">
          This page is for platform administrators only.
        </p>
      </div>
    </div>
  );
}