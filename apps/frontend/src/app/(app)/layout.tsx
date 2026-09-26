'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  Home,
  Users,
  Clock,
  DollarSign,
  LogOut,
  Briefcase,
  FileText,
  Settings,
  Menu,
  X,
} from 'lucide-react';
import { ThemeToggle } from '@/lib/theme-toggle';

const nav = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/employees', label: 'Employees', icon: Users },
  { href: '/attendance', label: 'Attendance', icon: Clock },
  { href: '/payroll', label: 'Payroll', icon: DollarSign },
  { href: '/clients', label: 'Clients', icon: Briefcase },
  { href: '/assignments', label: 'Assignments', icon: Users },
  { href: '/invoices', label: 'Invoices', icon: FileText },
  { href: '/settings/company', label: 'Company', icon: Settings },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-fg-2">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-app text-fg">
      {/* Mobile Top Header (hidden on md and larger) */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-subtle sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-2 -ml-1 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition touch-manipulation"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-semibold text-sm text-fg tracking-tight">StaffSync</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <div className="w-8 h-8 rounded-full bg-brand-soft border border-brand/20 flex items-center justify-center text-xs font-semibold text-brand">
            {user.email.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer & Backdrop */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
          />

          {/* Drawer Sidebar */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-surface flex flex-col shadow-2xl border-r border-subtle z-50">
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎯</span>
                <span className="font-bold text-sm text-fg tracking-tight">StaffSync</span>
              </div>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition touch-manipulation"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {nav.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== '/' &&
                    !(item as any).external &&
                    pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    target={(item as any).external ? '_blank' : undefined}
                    rel={(item as any).external ? 'noopener noreferrer' : undefined}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition touch-manipulation ${
                      active
                        ? 'bg-brand-soft text-brand font-semibold'
                        : 'text-fg-2 hover:bg-hover hover:text-fg'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-subtle p-4 space-y-3 bg-elevated/40">
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-2 font-medium">Theme</span>
                <ThemeToggle />
              </div>
              <div className="pt-2 border-t border-subtle/60">
                <div className="text-xs font-medium text-fg truncate">{user.email}</div>
                <div className="text-[10px] text-muted uppercase tracking-wider mb-3">
                  {user.role}
                </div>
                <button
                  onClick={() => {
                    setMobileNavOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-subtle hover:bg-hover text-fg-2 font-medium transition touch-manipulation"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Persistent Sidebar (hidden on mobile, visible on md+) */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 bg-surface border-r border-subtle flex-col">
        <div className="px-5 py-4 border-b border-subtle">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-semibold text-sm text-fg tracking-tight">StaffSync</span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {nav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== '/' &&
                !(item as any).external &&
                pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                target={(item as any).external ? '_blank' : undefined}
                rel={(item as any).external ? 'noopener noreferrer' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  active
                    ? 'bg-brand-soft text-brand font-medium'
                    : 'text-fg-2 hover:bg-hover hover:text-fg'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-subtle p-3 space-y-2">
          <ThemeToggle />
          <div className="pt-1">
            <div className="text-xs text-fg-2 truncate">{user.email}</div>
            <div className="text-[10px] text-muted mb-2">{user.role}</div>
            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-subtle hover:bg-hover text-fg-2 transition"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto w-full">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
