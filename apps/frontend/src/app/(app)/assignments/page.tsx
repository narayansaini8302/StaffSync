'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Loader2,
  Briefcase,
  UserCircle,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Client,
  Employee,
  EmployeeAssignment,
  Paginated,
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

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function AssignmentsPage() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get('clientId') ?? '';

  const [clientFilter, setClientFilter] = useState(initialClientId);
  const [creating, setCreating] = useState(false);

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/api/clients'),
  });

  const query = useQuery({
    queryKey: ['assignments', clientFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (clientFilter) params.set('clientId', clientFilter);
      return api.get<{ data: EmployeeAssignment[] }>(
        `/api/assignments?${params}`,
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/assignments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assignments'] });
      toast.success('Assignment removed');
    },
    onError: (e: any) => toast.error('Delete failed', e?.message),
  });

  const assignments = query.data?.data ?? [];
  const clients = clientsQuery.data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Assignments</h1>
          <p className="text-sm text-fg-2 mt-1">
            Which employees work for which clients
          </p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={clients.length === 0}>
          <Plus size={16} />
          New Assignment
        </Button>
      </div>

      {clients.length === 0 && (
        <div className="bg-warning-soft border border-warning/30 rounded-xl p-4 text-sm text-warning">
          You need to create at least one client before adding assignments.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Start</th>
              <th className="px-4 py-3 font-medium">End</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {query.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}

            {!query.isLoading && assignments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No assignments yet
                </td>
              </tr>
            )}

            {assignments.map((a) => (
              <tr
                key={a.id}
                className="border-b border-subtle last:border-0 hover:bg-hover"
              >
                <td className="px-4 py-3">
                  <div className="text-fg font-medium">
                    {a.employee
                      ? `${a.employee.firstName} ${a.employee.lastName}`
                      : '—'}
                  </div>
                  <div className="text-[10px] text-muted font-mono">
                    {a.employee?.employeeCode ?? ''}
                  </div>
                </td>
                <td className="px-4 py-3 text-fg-2 text-xs">
                  {a.employee?.category
                    ? categoryLabels[a.employee.category]
                    : '—'}
                </td>
                <td className="px-4 py-3 text-fg-2 text-xs">
                  {a.client?.name ?? '—'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-fg-2">
                  {a.startDate.slice(0, 10)}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-fg-2">
                  {a.endDate ? a.endDate.slice(0, 10) : '—'}
                </td>
                <td className="px-4 py-3">
                  {a.isActive ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-success-soft text-success border border-success/30">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-elevated text-muted border border-subtle">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => {
                      if (confirm('Remove this assignment?')) {
                        remove.mutate(a.id);
                      }
                    }}
                    className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger"
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

      <AssignmentFormModal
        open={creating}
        clients={clients}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['assignments'] });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function AssignmentFormModal({
  open,
  clients,
  onClose,
  onSaved,
}: {
  open: boolean;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employeesQuery = useQuery({
    queryKey: ['employees-for-assignment'],
    queryFn: () =>
      api.get<Paginated<Employee>>('/api/employees?pageSize=100&isActive=true'),
    enabled: open,
  });
  const employees = employeesQuery.data?.data ?? [];

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setError(null);
      setClientId(clients[0]?.id ?? '');
      setEmployeeId('');
      setStartDate(todayISO());
      setEndDate('');
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/api/assignments', {
        clientId,
        employeeId,
        startDate,
        endDate: endDate || undefined,
      });
      toast.success('Assignment created');
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Assignment" maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Client <span className="text-danger">*</span>
          </label>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Employee <span className="text-danger">*</span>
          </label>
          <select
            required
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            disabled={employeesQuery.isLoading}
          >
            <option value="">
              {employeesQuery.isLoading ? 'Loading…' : 'Select an employee…'}
            </option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.employeeCode} — {emp.firstName} {emp.lastName} ({categoryLabels[emp.category]})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              Start date <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              End date (optional)
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
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
          <Button type="submit" disabled={saving || !clientId || !employeeId}>
            {saving ? 'Saving…' : 'Create Assignment'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}