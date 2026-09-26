'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Loader2, Trash2, User } from 'lucide-react';
import { saApi } from '@/lib/super-admin-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  users: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
    createdAt: string;
  }[];
  _count: { employees: number; clients?: number; devices?: number; payrollRuns: number };
}

export default function CompanyDetailPage() {
  const params = useParams();
  const companyId = params.id as string;
  const qc = useQueryClient();
  const [addingAdmin, setAddingAdmin] = useState(false);

  const query = useQuery({
    queryKey: ['sa-company', companyId],
    queryFn: () => saApi.get<CompanyDetail>(`/api/super-admin/companies/${companyId}`),
  });

  const removeAdmin = async (userId: string) => {
    if (!confirm('Remove this user? They will lose access immediately.')) return;
    try {
      await saApi.delete(`/api/super-admin/admins/${userId}`);
      qc.invalidateQueries({ queryKey: ['sa-company', companyId] });
    } catch (e: any) {
      alert(e?.message ?? 'Failed to remove');
    }
  };

  if (query.isLoading) {
    return (
      <div className="text-slate-400">
        <Loader2 size={20} className="inline animate-spin" /> Loading…
      </div>
    );
  }

  if (!query.data) {
    return <div className="text-slate-400">Company not found</div>;
  }

  const c = query.data;

  return (
    <div className="space-y-6">
      <Link
        href="/super-admin/companies"
        className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft size={14} />
        Back to companies
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">{c.name}</h1>
          <p className="text-sm text-slate-400 mt-1 font-mono">{c.slug}</p>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
            c.isActive
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
          }`}
        >
          {c.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatBox label="Employees" value={c._count.employees} />
        <StatBox label="Clients" value={c._count.clients ?? 0} />
        <StatBox label="Payroll Runs" value={c._count.payrollRuns} />
      </div>

      {/* Users */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium text-slate-100">Users</h2>
          <Button size="sm" onClick={() => setAddingAdmin(true)}>
            <Plus size={14} />
            Add Admin
          </Button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-slate-900/60 border-b border-slate-800">
              <tr className="text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {c.users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30"
                >
                  <td className="px-4 py-3 text-slate-100">
                    <div className="flex items-center gap-2">
                      <User size={14} className="text-slate-500" />
                      {u.email}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-slate-500/10 text-slate-400 border border-slate-500/20">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeAdmin(u.id)}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      <AddAdminModal
        open={addingAdmin}
        companyId={companyId}
        onClose={() => setAddingAdmin(false)}
        onSaved={() => {
          setAddingAdmin(false);
          qc.invalidateQueries({ queryKey: ['sa-company', companyId] });
        }}
      />
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-2xl font-semibold mt-1 text-slate-100">{value}</div>
    </div>
  );
}

function AddAdminModal({
  open,
  companyId,
  onClose,
  onSaved,
}: {
  open: boolean;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setEmail('');
      setPassword('');
      setError(null);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saApi.post(`/api/super-admin/companies/${companyId}/admins`, {
        email,
        password,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add admin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add Admin">
      <form onSubmit={submit} className="space-y-4">
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
            minLength={8}
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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add Admin'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}