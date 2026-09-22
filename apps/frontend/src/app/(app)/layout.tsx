'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import {
  Home,
  Users,
  Clock,
  DollarSign,
  Camera,
  Cpu,
  LogOut,
  MonitorPlay,
  Briefcase,
  FileText,
  Settings,
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
  { href: '/face', label: 'Face Enroll', icon: Camera },
  { href: '/devices', label: 'Devices', icon: Cpu },
  { href: '/settings/company', label: 'Company', icon: Settings },
  { href: '/punch', label: 'Kiosk Mode', icon: MonitorPlay, external: true },
];
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, logout } = useAuth();

  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-fg-2">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex bg-app text-fg">
      <aside className="w-60 shrink-0 bg-surface border-r border-subtle flex flex-col">
        <div className="px-5 py-4 border-b border-subtle">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-semibold text-sm text-fg">Attendance</span>
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
              className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-subtle hover:bg-hover text-fg-2"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
