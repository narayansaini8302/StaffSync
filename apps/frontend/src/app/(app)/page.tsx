'use client';

import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Clock, DollarSign, Activity } from 'lucide-react';
import { Paginated, Employee, AttendanceDay, PayrollRun } from '@/lib/types';

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMoney(v: string | number) {
  const n = typeof v === 'string' ? Number(v) : v;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export default function DashboardPage() {
  const { user } = useAuth();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<{ status: string; timestamp: string }>('/health'),
    refetchInterval: 30_000,
  });

  const employees = useQuery({
    queryKey: ['dashboard-employees'],
    queryFn: () =>
      api
        .get<Paginated<Employee>>('/api/employees?pageSize=1&isActive=true')
        .then((r) => r.meta.total),
  });

  const presentToday = useQuery({
    queryKey: ['dashboard-present-today'],
    queryFn: () => {
      const today = todayISO();
      return api
        .get<Paginated<AttendanceDay>>(
          `/api/attendance/daily?from=${today}&to=${today}&pageSize=100`,
        )
        .then(
          (r) =>
            r.data.filter(
              (d) => d.status === 'PRESENT' || d.status === 'HALF_DAY',
            ).length,
        );
    },
  });

  const lastPayroll = useQuery({
    queryKey: ['dashboard-last-payroll'],
    queryFn: () =>
      api
        .get<{ data: PayrollRun[] }>('/api/payroll/runs')
        .then((r) => r.data[0] ?? null),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-fg">Dashboard</h1>
        <p className="text-xs sm:text-sm text-fg-2 mt-1">Welcome back, {user?.email}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="API Status"
          value={health.data?.status ?? '...'}
          ok={health.data?.status === 'ok'}
          icon={Activity}
        />
        <StatCard
          label="Active Employees"
          value={employees.isLoading ? '...' : String(employees.data ?? 0)}
          icon={Users}
        />
        <StatCard
          label="Present Today"
          value={presentToday.isLoading ? '...' : String(presentToday.data ?? 0)}
          icon={Clock}
          ok={presentToday.data ? true : undefined}
        />
        <StatCard
          label="Last Payroll"
          value={
            lastPayroll.isLoading
              ? '...'
              : lastPayroll.data
                ? formatMoney(lastPayroll.data.totalNet)
                : '-'
          }
          icon={DollarSign}
          ok={lastPayroll.data ? true : undefined}
        />
      </div>

      <div className="bg-surface border border-subtle rounded-xl p-4 sm:p-6 shadow-sm">
        <h2 className="font-semibold text-base mb-3 text-fg">Workflow Overview</h2>
        <ol className="text-xs sm:text-sm text-fg-2 space-y-2.5 list-decimal list-inside leading-relaxed">
          <li>
            Register staff directory on the{' '}
            <strong className="text-fg">Employees</strong> page and email joining letters
          </li>
          <li>
            Mark daily attendance with Full Day (8h) or Half Day (4h) on the{' '}
            <strong className="text-fg">Attendance</strong> daily sheet
          </li>
          <li>
            Assign staff to client sites on the{' '}
            <strong className="text-fg">Assignments & Clients</strong> pages
          </li>
          <li>
            Compute salary, generate PDFs and email payslips on the{' '}
            <strong className="text-fg">Payroll</strong> page
          </li>
          <li>
            Generate client invoices, track Payment Taken & On Pending, and email invoices on the{' '}
            <strong className="text-fg">Invoices</strong> page
          </li>
        </ol>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  ok,
  icon: Icon,
}: {
  label: string;
  value: string;
  ok?: boolean;
  icon: any;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-xl p-3.5 sm:p-4 shadow-sm hover:border-brand/30 transition-colors">
      <div className="flex items-center justify-between">
        <div className="text-xs text-fg-2 font-medium truncate">{label}</div>
        <Icon size={16} className="text-muted shrink-0 ml-2" />
      </div>
      <div
        className={`text-xl sm:text-2xl font-bold mt-1.5 sm:mt-2 truncate ${
          ok === true
            ? 'text-success'
            : ok === false
              ? 'text-danger'
              : 'text-fg'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
