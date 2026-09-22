'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';
import { Home, Building2, LogOut } from 'lucide-react';

const nav = [
  { href: '/super-admin', label: 'Overview', icon: Home },
  { href: '/super-admin/companies', label: 'Companies', icon: Building2 },
];

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { superAdmin, hydrated, logout } = useSuperAdminAuth();

  useEffect(() => {
    if (hydrated && !superAdmin) router.replace('/super-admin/login');
  }, [hydrated, superAdmin, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  if (!superAdmin) return null;

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100">
      <aside className="w-60 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="font-semibold text-sm">Super Admin</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/super-admin' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-3">
          <div className="text-xs text-slate-400 truncate">{superAdmin.email}</div>
          <div className="text-[10px] text-slate-500 mb-2">SUPER ADMIN</div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}