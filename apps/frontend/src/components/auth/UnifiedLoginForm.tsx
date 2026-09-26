'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';
import {
  ShieldCheck,
  Building2,
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';

export type LoginMode = 'admin' | 'super-admin';

interface UnifiedLoginFormProps {
  defaultMode?: LoginMode;
}

export function UnifiedLoginForm({ defaultMode }: UnifiedLoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const queryRole = searchParams.get('role');
  const initialMode: LoginMode =
    queryRole === 'super-admin'
      ? 'super-admin'
      : queryRole === 'admin'
      ? 'admin'
      : defaultMode ?? 'admin';

  const [mode, setMode] = useState<LoginMode>(initialMode);

  // Auth stores
  const {
    login: adminLogin,
    loading: adminLoading,
    error: adminError,
    user,
    hydrated: userHydrated,
  } = useAuth();

  const {
    login: superLogin,
    loading: superLoading,
    error: superError,
    superAdmin,
    hydrated: superHydrated,
  } = useSuperAdminAuth();

  // Form states
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [superEmail, setSuperEmail] = useState('');
  const [superPassword, setSuperPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto redirect if already authenticated
  useEffect(() => {
    if (mode === 'admin' && userHydrated && user) {
      router.replace('/');
    } else if (mode === 'super-admin' && superHydrated && superAdmin) {
      router.replace('/super-admin');
    }
  }, [mode, userHydrated, user, superHydrated, superAdmin, router]);

  const isSuper = mode === 'super-admin';
  const isLoading = isSuper ? superLoading : adminLoading;
  const activeError = localError || (isSuper ? superError : adminError);

  const handleTabChange = (newMode: LoginMode) => {
    setMode(newMode);
    setLocalError(null);
    setShowPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    try {
      if (isSuper) {
        await superLogin(superEmail.trim(), superPassword);
        router.replace('/super-admin');
      } else {
        await adminLogin(adminEmail.trim(), adminPassword);
        router.replace('/');
      }
    } catch (err: any) {
      const msg = err?.message || 'Invalid credentials or login failed';
      setLocalError(msg);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Header Branding */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 mb-3 text-slate-200">
          {isSuper ? (
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
          ) : (
            <Building2 className="w-6 h-6 text-blue-400" />
          )}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">
          StaffSync Portal
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Choose your account type to continue
        </p>
      </div>

      {/* Role Selection Tabs */}
      <div className="grid grid-cols-2 p-1 bg-slate-900 border border-slate-800 rounded-xl mb-5 gap-1">
        <button
          type="button"
          onClick={() => handleTabChange('admin')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition ${
            !isSuper
              ? 'bg-blue-600 text-white border border-blue-500'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4 shrink-0" />
          <span className="truncate">Admin Login</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('super-admin')}
          className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition ${
            isSuper
              ? 'bg-indigo-600 text-white border border-indigo-500'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="truncate">Super Admin</span>
        </button>
      </div>

      {/* Main Login Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full border ${
                isSuper
                  ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                  : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
              }`}
            >
              {isSuper ? 'Platform Super Admin' : 'Company Admin / Staff'}
            </span>
            <span className="text-xs text-slate-500">
              {isSuper ? 'Tenant Manager' : 'Attendance & Payroll'}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-100 mt-2">
            {isSuper ? 'Super Admin Authentication' : 'Admin & Staff Sign In'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isSuper
              ? 'Manage all platform companies and system-wide settings.'
              : 'Sign in to access your company attendance, leaves, and invoices.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                value={isSuper ? superEmail : adminEmail}
                onChange={(e) =>
                  isSuper
                    ? setSuperEmail(e.target.value)
                    : setAdminEmail(e.target.value)
                }
                placeholder={
                  isSuper ? 'super@attendance.local' : 'admin@company.com'
                }
                className="w-full pl-10 pr-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-slate-600"
              />
            </div>
          </div>

          {/* Password input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Password
              </label>
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={isSuper ? superPassword : adminPassword}
                onChange={(e) =>
                  isSuper
                    ? setSuperPassword(e.target.value)
                    : setAdminPassword(e.target.value)
                }
                placeholder="••••••••••••"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error display */}
          {activeError && (
            <div className="flex items-start gap-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{activeError}</span>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white font-medium text-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              isSuper
                ? 'bg-indigo-600 hover:bg-indigo-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {isLoading ? (
              <span>Signing in…</span>
            ) : (
              <>
                <span>
                  {isSuper ? 'Sign In as Super Admin' : 'Sign In as Admin'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* Footer Switch Prompt */}
      <div className="text-center mt-5 text-xs text-slate-400">
        {isSuper ? (
          <p>
            Looking for company attendance?{' '}
            <button
              type="button"
              onClick={() => handleTabChange('admin')}
              className="text-blue-400 hover:underline font-medium cursor-pointer"
            >
              Switch to Admin Login
            </button>
          </p>
        ) : (
          <p>
            Need platform-level company control?{' '}
            <button
              type="button"
              onClick={() => handleTabChange('super-admin')}
              className="text-indigo-400 hover:underline font-medium cursor-pointer"
            >
              Switch to Super Admin Login
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
