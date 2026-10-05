'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Briefcase, FileText, Activity } from 'lucide-react';
import { saApi } from '@/lib/super-admin-api';

interface Stats {
  companies: number;
  activeCompanies: number;
  users: number;
  employees: number;
  devices: number;
  invoices?: number;
}

export default function SuperAdminOverview() {
  const statsQuery = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => saApi.get<Stats>('/api/super-admin/stats'),
  });

  const healthQuery = useQuery({
    queryKey: ['sa-health'],
    queryFn: () => saApi.get<{ status: string; timestamp: string }>('/health'),
    refetchInterval: 30_000,
  });

  const s = statsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Platform Overview</h1>
          <p className="text-sm text-slate-400 mt-1">
            Global stats across all companies and platform health
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              healthQuery.data?.status === 'ok'
                ? 'bg-emerald-400 animate-pulse'
                : healthQuery.isError
                  ? 'bg-rose-400'
                  : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-300 font-medium">
            API:{' '}
            {healthQuery.data?.status === 'ok'
              ? 'Operational'
              : healthQuery.isError
                ? 'Degraded'
                : 'Connecting…'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard
          label="Companies"
          value={s?.companies ?? '…'}
          sub={`${s?.activeCompanies ?? 0} active`}
          icon={Building2}
        />
        <StatCard label="Users" value={s?.users ?? '…'} icon={Users} />
        <StatCard label="Employees" value={s?.employees ?? '…'} icon={Briefcase} />
        <StatCard label="Invoices" value={s?.invoices ?? s?.devices ?? 0} icon={FileText} />
        <StatCard
          label="API Status"
          value={
            healthQuery.isLoading
              ? '…'
              : healthQuery.data?.status
                ? healthQuery.data.status.toUpperCase()
                : healthQuery.isError
                  ? 'OFFLINE'
                  : '…'
          }
          sub={
            healthQuery.data?.timestamp
              ? `Checked ${new Date(healthQuery.data.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}`
              : healthQuery.isError
                ? 'Unreachable'
                : 'Pinging API…'
          }
          ok={healthQuery.data?.status === 'ok'}
          icon={Activity}
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="font-medium mb-3 text-slate-100">What you can do here</h2>
        <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
          <li>Monitor platform health and backend API availability in real-time</li>
          <li>View global stats across all tenant companies</li>
          <li>Create new companies with their first admin</li>
          <li>Add additional admins to any company</li>
          <li>Activate, deactivate, or permanently delete tenant companies</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  ok,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  ok?: boolean;
  icon: any;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">{label}</div>
        <Icon
          size={16}
          className={
            ok === true
              ? 'text-emerald-400'
              : ok === false
                ? 'text-rose-400'
                : 'text-slate-500'
          }
        />
      </div>
      <div
        className={`text-2xl font-semibold mt-2 ${
          ok === true
            ? 'text-emerald-400'
            : ok === false
              ? 'text-rose-400'
              : 'text-slate-100'
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-slate-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}