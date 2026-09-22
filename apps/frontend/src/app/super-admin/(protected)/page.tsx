'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Briefcase, Cpu } from 'lucide-react';
import { saApi } from '@/lib/super-admin-api';

interface Stats {
  companies: number;
  activeCompanies: number;
  users: number;
  employees: number;
  devices: number;
}

export default function SuperAdminOverview() {
  const statsQuery = useQuery({
    queryKey: ['sa-stats'],
    queryFn: () => saApi.get<Stats>('/api/super-admin/stats'),
  });

  const s = statsQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-100">Platform Overview</h1>
        <p className="text-sm text-slate-400 mt-1">
          Global stats across all companies
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Companies"
          value={s?.companies ?? '…'}
          sub={`${s?.activeCompanies ?? 0} active`}
          icon={Building2}
        />
        <StatCard label="Users" value={s?.users ?? '…'} icon={Users} />
        <StatCard label="Employees" value={s?.employees ?? '…'} icon={Briefcase} />
        <StatCard label="Devices" value={s?.devices ?? '…'} icon={Cpu} />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h2 className="font-medium mb-3 text-slate-100">What you can do here</h2>
        <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
          <li>View global stats across all tenant companies</li>
          <li>Create new companies with their first admin</li>
          <li>Add additional admins to any company</li>
          <li>Activate or deactivate entire companies</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: any;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-400">{label}</div>
        <Icon size={16} className="text-slate-500" />
      </div>
      <div className="text-2xl font-semibold mt-2 text-slate-100">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}