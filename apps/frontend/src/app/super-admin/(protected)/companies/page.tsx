'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Building2, ExternalLink, Power } from 'lucide-react';
import Link from 'next/link';
import { saApi } from '@/lib/super-admin-api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  _count: { users: number; employees: number };
}

export default function CompaniesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: ['sa-companies'],
    queryFn: () => saApi.get<{ data: Company[] }>('/api/super-admin/companies'),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      saApi.patch(`/api/super-admin/companies/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sa-companies'] }),
  });

  const companies = query.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-100">Companies</h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Tenant companies using the platform
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto justify-center">
          <Plus size={16} />
          New Company
        </Button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[620px]">
          <thead className="bg-slate-900/60 border-b border-slate-800">
            <tr className="text-slate-400 text-left">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium text-center">Users</th>
              <th className="px-4 py-3 font-medium text-center">Employees</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}
            {!query.isLoading && companies.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                  No companies yet
                </td>
              </tr>
            )}
            {companies.map((c) => (
              <tr
                key={c.id}
                className="border-b border-slate-800 last:border-0 hover:bg-slate-800/30"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-slate-500" />
                    <span className="text-slate-100">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {c.slug}
                </td>
                <td className="px-4 py-3 text-center text-slate-300">
                  {c._count.users}
                </td>
                <td className="px-4 py-3 text-center text-slate-300">
                  {c._count.employees}
                </td>
                <td className="px-4 py-3">
                  {c.isActive ? (
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
                  <div className="inline-flex gap-1">
                    <Link
                      href={`/super-admin/companies/${c.id}`}
                      className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-blue-400"
                      title="View details"
                    >
                      <ExternalLink size={14} />
                    </Link>
                    <button
                      onClick={() =>
                        toggleActive.mutate({ id: c.id, isActive: !c.isActive })
                      }
                      className={`p-1.5 rounded hover:bg-slate-800 ${
                        c.isActive
                          ? 'text-slate-400 hover:text-red-400'
                          : 'text-slate-400 hover:text-green-400'
                      }`}
                      title={c.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <Power size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <CreateCompanyModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['sa-companies'] });
          qc.invalidateQueries({ queryKey: ['sa-stats'] });
        }}
      />
    </div>
  );
}

function CreateCompanyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setCompanyName('');
      setAdminEmail('');
      setAdminPassword('');
      setError(null);
      setSuccess(false);
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saApi.post('/api/super-admin/companies', {
        companyName,
        adminEmail,
        adminPassword,
      });
      setSuccess(true);
      setTimeout(() => onCreated(), 1200);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create company');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Company">
      {success ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-lg font-semibold text-slate-100">
            Company created!
          </div>
          <div className="text-sm text-slate-400 mt-1">
            The admin can now log in at <strong>/login</strong> with{' '}
            <span className="font-mono">{adminEmail}</span>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Company name
            </label>
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Pvt Ltd"
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="border-t border-slate-800 pt-4">
            <div className="text-xs text-slate-400 mb-2">
              First admin (can create more later)
            </div>
            <div className="space-y-3">
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@acme.com"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                type="password"
                required
                minLength={8}
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Min 8 characters"
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
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
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {busy ? 'Creating…' : 'Create Company'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}