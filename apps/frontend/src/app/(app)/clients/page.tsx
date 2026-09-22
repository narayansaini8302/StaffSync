'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Client,
  CreateClientInput,
  EmployeeCategory,
} from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

const categoryLabels: Record<EmployeeCategory, string> = {
  HOUSEKEEPING: 'Housekeeping',
  SEMI_SKILLED: 'Semi Skilled',
  SECURITY_GUARD: 'Security Guard',
  SUPERVISOR: 'Supervisor',
};

export default function ClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const query = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/api/clients'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Client deleted');
    },
    onError: (e: any) => toast.error('Delete failed', e?.message),
  });

  const clients = (query.data?.data ?? []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.gstin ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Clients</h1>
          <p className="text-sm text-fg-2 mt-1">
            Companies you bill for manpower services
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, GSTIN, or email…"
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
        />
      </div>

      {/* Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">GSTIN</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium text-center">Employees</th>
              <th className="px-4 py-3 font-medium text-center">Invoices</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}

            {!query.isLoading && clients.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  {search
                    ? 'No clients match your search'
                    : 'No clients yet. Add one to get started.'}
                </td>
              </tr>
            )}

            {clients.map((c) => (
              <tr
                key={c.id}
                className="border-b border-subtle last:border-0 hover:bg-hover"
              >
                <td className="px-4 py-3">
                  <div className="text-fg font-medium">{c.name}</div>
                  {c.email && (
                    <div className="text-[10px] text-muted">{c.email}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-fg-2">
                  {c.gstin ?? '—'}
                </td>
                <td className="px-4 py-3 text-fg-2 text-xs">
                  {c.stateCode ?? '—'}
                </td>
                <td className="px-4 py-3 text-center text-fg">
                  {c._count?.assignments ?? 0}
                </td>
                <td className="px-4 py-3 text-center text-fg">
                  {c._count?.invoices ?? 0}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <Link
                      href={`/assignments?clientId=${c.id}`}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="View assignments"
                    >
                      <ExternalLink size={14} />
                    </Link>
                    <button
                      onClick={() => setEditing(c)}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `Delete "${c.name}"? This cannot be undone. Their assignments and invoices will be removed.`,
                          )
                        ) {
                          remove.mutate(c.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['clients'] });
        }}
      />

      <ClientFormModal
        open={!!editing}
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['clients'] });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function ClientFormModal({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client?: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!client;
  const [form, setForm] = useState<CreateClientInput>({
    name: '',
    gstin: '',
    address: '',
    email: '',
    phone: '',
    stateCode: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setError(null);
      if (client) {
        setForm({
          name: client.name,
          gstin: client.gstin ?? '',
          address: client.address,
          email: client.email ?? '',
          phone: client.phone ?? '',
          stateCode: client.stateCode ?? '',
        });
      } else {
        setForm({
          name: '',
          gstin: '',
          address: '',
          email: '',
          phone: '',
          stateCode: '',
        });
      }
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && client) {
        await api.patch(`/api/clients/${client.id}`, form);
      } else {
        await api.post('/api/clients', form);
      }
      toast.success(isEdit ? 'Client updated' : 'Client created');
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Client' : 'Add Client'}
      maxWidth="max-w-xl"
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Client name"
          value={form.name}
          onChange={(v) => setForm({ ...form, name: v })}
          required
          placeholder="Acme Manufacturing Ltd"
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="GSTIN"
            value={form.gstin ?? ''}
            onChange={(v) => setForm({ ...form, gstin: v })}
            placeholder="27XYZAB5678G2H3"
          />
          <Field
            label="State code"
            value={form.stateCode ?? ''}
            onChange={(v) => setForm({ ...form, stateCode: v })}
            placeholder="27"
            hint="Two digits — used to decide CGST/SGST vs IGST"
          />
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Address <span className="text-danger">*</span>
          </label>
          <textarea
            required
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Full billing address"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Billing email"
            type="email"
            value={form.email ?? ''}
            onChange={(v) => setForm({ ...form, email: v })}
            placeholder="billing@client.com"
          />
          <Field
            label="Phone"
            value={form.phone ?? ''}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create client'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-fg-2 mb-1">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
      />
      {hint && <div className="text-[10px] text-muted mt-1">{hint}</div>}
    </div>
  );
}