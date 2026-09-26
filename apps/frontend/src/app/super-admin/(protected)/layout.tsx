'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSuperAdminAuth } from '@/lib/super-admin-auth';
import { Home, Building2, LogOut, Menu, X } from 'lucide-react';

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !superAdmin) router.replace('/super-admin/login');
  }, [hydrated, superAdmin, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  if (!superAdmin) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-950 text-slate-100">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-1 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800 transition"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🛡️</span>
            <span className="font-semibold text-sm">Super Admin</span>
          </div>
        </div>

        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs font-semibold text-blue-400">
          {superAdmin.email.charAt(0).toUpperCase()}
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-slate-900 flex flex-col shadow-2xl border-r border-slate-800 z-50">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🛡️</span>
                <span className="font-semibold text-sm">Super Admin</span>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {nav.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/super-admin' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition ${
                      active
                        ? 'bg-blue-600/20 text-blue-400'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-slate-100'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-slate-800 p-4">
              <div className="text-xs text-slate-300 truncate font-medium">{superAdmin.email}</div>
              <div className="text-[10px] text-slate-500 mb-3 tracking-wider">SUPER ADMIN</div>
              <button
                onClick={() => {
                  setMobileOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 transition"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 bg-slate-900 border-r border-slate-800 flex-col">
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

      <main className="flex-1 min-w-0 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8">{children}</div>
      </main>
    </div>
  );
}