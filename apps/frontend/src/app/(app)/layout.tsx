'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { api, API_URL_CONST } from '@/lib/api';
import { Company } from '@/lib/types';
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
  ShieldCheck,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { ThemeToggle } from '@/lib/theme-toggle';
import { StaffSyncLogo } from '@/components/ui/logo';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [profileOpen, setProfileOpen] = useState(false);

  const companyQuery = useQuery({
    queryKey: ['company-profile'],
    queryFn: () => api.get<Company>('/api/company').catch(() => null),
    enabled: Boolean(user),
  });

  const company = companyQuery.data;
  const companyLogoUrl = company?.logoPath ? `${API_URL_CONST}${company.logoPath}` : null;

  useEffect(() => {
    if (hydrated && !user) router.replace('/login');
  }, [hydrated, user, router]);

  // Close mobile drawer and modal whenever route changes
  useEffect(() => {
    setMobileNavOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app text-fg-2">
        Loading...
      </div>
    );
  }

  if (!user) return null;

  const roleLabel =
    user.role === 'ADMIN'
      ? 'Administrator'
      : user.role === 'HR'
        ? 'HR Specialist'
        : user.role === 'MANAGER'
          ? 'Operations Manager'
          : 'Staff Member';

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-app text-fg transition-colors duration-200">
      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-surface/95 backdrop-blur-md border-b border-subtle sticky top-0 z-40">
        {/* Left side: Logo */}
        <StaffSyncLogo
          size="sm"
          href="/"
          customLogoUrl={companyLogoUrl}
          customName={company?.name}
        />

        {/* Right side: Theme toggle, Profile Avatar button, Mobile Menu button */}
        <div className="flex items-center gap-2">
          <ThemeToggle compact />

          {/* Profile Avatar trigger */}
          <button
            onClick={() => setProfileOpen(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand to-sky-400 p-[1.5px] cursor-pointer hover:scale-105 active:scale-95 transition shadow-xs"
            aria-label="Open profile details"
          >
            <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-xs font-bold text-fg">
              {user.email.charAt(0).toUpperCase()}
            </div>
          </button>

          {/* Hamburger Menu on the RIGHT side */}
          <button
            onClick={() => setMobileNavOpen(true)}
            className="p-1.5 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition touch-manipulation cursor-pointer ml-0.5"
            aria-label="Open navigation menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer on the RIGHT side */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setMobileNavOpen(false)}
            />

            {/* Drawer Container (Sliding in from RIGHT) */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 right-0 w-72 max-w-[85vw] bg-surface flex flex-col shadow-2xl border-l border-subtle z-50"
            >
              <div className="px-5 py-4 border-b border-subtle flex items-center justify-between">
                <StaffSyncLogo
                  size="sm"
                  href="/"
                  customLogoUrl={companyLogoUrl}
                  customName={company?.name}
                />
                <button
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 rounded-lg text-fg-2 hover:text-fg hover:bg-hover transition touch-manipulation cursor-pointer"
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
                  <button
                    onClick={() => {
                      setMobileNavOpen(false);
                      setProfileOpen(true);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-hover border border-subtle text-left transition mb-2"
                  >
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand to-sky-400 p-[1.5px] shrink-0">
                      <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-xs font-bold text-fg">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-fg truncate">{user.email}</div>
                      <div className="text-[10px] text-brand font-medium uppercase tracking-wider">{roleLabel}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      setMobileNavOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center justify-center gap-2 text-xs py-2 rounded-lg border border-danger/30 bg-danger-soft/40 hover:bg-danger text-danger hover:text-white font-medium transition touch-manipulation cursor-pointer"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 bg-surface border-r border-subtle flex-col">
        <div className="px-5 py-4 border-b border-subtle">
          <StaffSyncLogo
            size="md"
            href="/"
            subtitle="Workforce Suite"
            customLogoUrl={companyLogoUrl}
            customName={company?.name}
          />
        </div>

        <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active
                    ? 'bg-brand-soft text-brand font-semibold'
                    : 'text-fg-2 hover:bg-hover hover:text-fg'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer with interactive profile trigger */}
        <div className="border-t border-subtle p-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-fg-2 font-medium">Appearance</span>
            <ThemeToggle />
          </div>

          <button
            onClick={() => setProfileOpen(true)}
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-hover border border-subtle transition text-left cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand to-sky-400 p-[1.5px] shrink-0">
              <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-xs font-bold text-fg group-hover:text-brand transition">
                {user.email.charAt(0).toUpperCase()}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-fg truncate">{user.email}</div>
              <div className="text-[10px] text-muted uppercase tracking-wider">{roleLabel}</div>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area with Desktop Top Header */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex items-center justify-between px-6 py-3 bg-surface/80 backdrop-blur-md border-b border-subtle sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <StaffSyncLogo
              size="sm"
              href="/"
              customLogoUrl={companyLogoUrl}
              customName={company?.name}
            />
            {company?.name && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-soft text-brand border border-brand/20">
                {company.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle compact />

            {/* Profile Avatar button */}
            <button
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 py-1.5 px-3 rounded-full hover:bg-hover border border-subtle transition cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-brand to-sky-400 p-[1px] shrink-0">
                <div className="w-full h-full rounded-full bg-surface flex items-center justify-center text-[10px] font-bold text-fg">
                  {user.email.charAt(0).toUpperCase()}
                </div>
              </div>
              <span className="text-xs font-medium text-fg max-w-[150px] truncate">{user.email}</span>
              <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-elevated text-fg-2">
                {user.role}
              </span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto w-full">
          <div className="max-w-6xl mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8">
            {children}
          </div>
        </main>
      </div>

      {/* Admin Profile Details Modal */}
      <AnimatePresence>
        {profileOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              onClick={() => setProfileOpen(false)}
            />

            {/* Card Content */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="relative w-full max-w-sm bg-surface border border-subtle rounded-2xl shadow-2xl overflow-hidden z-10"
            >
              {/* Top Banner */}
              <div className="h-20 bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 relative">
                <button
                  onClick={() => setProfileOpen(false)}
                  className="absolute top-3 right-3 p-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white transition cursor-pointer"
                  aria-label="Close profile modal"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Profile Body */}
              <div className="px-6 pb-6 pt-0">
                {/* Floating Avatar */}
                <div className="-mt-10 mb-3 flex items-end justify-between">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-brand to-sky-400 p-[2.5px] shadow-lg">
                      <div className="w-full h-full rounded-2xl bg-surface flex items-center justify-center text-2xl font-bold text-fg">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    </div>
                    <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-500 border-2 border-surface" />
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-soft text-brand border border-brand/20">
                    {roleLabel}
                  </span>
                </div>

                {/* Name / Email */}
                <div>
                  <h3 className="text-base font-bold text-fg truncate">{user.email}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-muted mt-0.5">
                    <ShieldCheck size={14} className="text-emerald-500" />
                    <span>Active & Verified Account</span>
                  </div>
                </div>

                {/* Company & Details Block */}
                <div className="mt-4 rounded-xl border border-subtle bg-elevated/50 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-2 flex items-center gap-1.5">
                      <Building2 size={13} className="text-muted" /> Company
                    </span>
                    <span className="font-semibold text-fg truncate max-w-[180px]">
                      {company?.name || 'StaffSync Workplace'}
                    </span>
                  </div>

                  {company?.gstin && (
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-subtle/50">
                      <span className="text-fg-2">GSTIN</span>
                      <span className="font-mono text-fg">{company.gstin}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-subtle/50">
                    <span className="text-fg-2">User ID</span>
                    <span className="font-mono text-[11px] text-muted truncate max-w-[150px]">
                      {user.id}
                    </span>
                  </div>
                </div>

                {/* Quick link & Logout actions */}
                <div className="mt-5 space-y-2">
                  <Link
                    href="/settings/company"
                    onClick={() => setProfileOpen(false)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-subtle hover:bg-hover text-xs font-medium text-fg transition"
                  >
                    <span className="flex items-center gap-2">
                      <Settings size={15} className="text-muted" />
                      Company Settings
                    </span>
                    <ExternalLink size={13} className="text-muted" />
                  </Link>

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-danger/30 bg-danger-soft/40 hover:bg-danger text-danger hover:text-white font-semibold text-xs transition duration-150 cursor-pointer shadow-xs"
                  >
                    <LogOut size={15} />
                    Sign out of account
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
