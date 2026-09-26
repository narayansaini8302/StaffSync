'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Pencil,
  UserX,
  UserCheck,
  Loader2,
  Download,
  Mail,
  Send,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Employee, Paginated, CreateEmployeeInput } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

type StatusFilter = 'all' | 'active' | 'inactive';
type EmployeeCategory =
  | 'HOUSEKEEPING'
  | 'SEMI_SKILLED'
  | 'SECURITY_GUARD'
  | 'SUPERVISOR';

const categoryLabels: Record<EmployeeCategory, string> = {
  HOUSEKEEPING: 'Housekeeping',
  SEMI_SKILLED: 'Semi Skilled',
  SECURITY_GUARD: 'Security Guard',
  SUPERVISOR: 'Supervisor',
};

const categoryDefaults: Record<EmployeeCategory, number> = {
  HOUSEKEEPING: 16366,
  SEMI_SKILLED: 17662,
  SECURITY_GUARD: 19676,
  SUPERVISOR: 26219,
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const [emailingLetterEmp, setEmailingLetterEmp] = useState<Employee | null>(null);

  const query = useQuery({
    queryKey: ['employees', page, search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '20');
      if (search) params.set('search', search);
      if (statusFilter === 'active') params.set('isActive', 'true');
      if (statusFilter === 'inactive') params.set('isActive', 'false');
      return api.get<Paginated<Employee>>(`/api/employees?${params}`);
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.delete(`/api/employees/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee deactivated');
    },
    onError: (e: any) => toast.error('Deactivate failed', e?.message),
  });

  const reactivate = useMutation({
    mutationFn: (id: string) =>
      api.patch(`/api/employees/${id}`, { isActive: true, dateOfLeaving: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Employee reactivated');
    },
    onError: (e: any) => toast.error('Reactivate failed', e?.message),
  });

  const downloadJoiningLetter = async (emp: Employee) => {
    try {
      const blob = await api.downloadBlob(
        `/api/employees/${emp.id}/joining-letter/pdf`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `joining-letter-${emp.employeeCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Joining letter downloaded for ${emp.firstName}`);
    } catch (e: any) {
      toast.error('Download failed', e?.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-fg">Employees</h1>
          <p className="text-xs sm:text-sm text-fg-2 mt-1">
            {query.data?.meta.total ?? 0} total staff
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="w-full sm:w-auto justify-center">
          <Plus size={16} />
          Add Employee
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setSearch(searchInput);
                setPage(1);
              }
            }}
            placeholder="Search by name, email, code, father's name… (press Enter)"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter);
            setPage(1);
          }}
          className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
        >
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
          <option value="all">All employees</option>
        </select>

        {search && (
          <Button
            variant="secondary"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setPage(1);
            }}
          >
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
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

            {!query.isLoading && query.data?.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">
                  No employees found
                </td>
              </tr>
            )}

            {query.data?.data.map((emp: any) => (
              <tr
                key={emp.id}
                className="border-b border-subtle last:border-0 hover:bg-hover"
              >
                <td className="px-4 py-3 font-mono text-xs text-fg-2">
                  {emp.employeeCode}
                </td>
                <td className="px-4 py-3 text-fg">
                  {emp.firstName} {emp.lastName}
                  {emp.fatherName && (
                    <div className="text-[10px] text-muted">
                      s/o {emp.fatherName}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-fg-2 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-elevated border border-subtle">
                    {categoryLabels[(emp.category as EmployeeCategory) ?? 'HOUSEKEEPING']}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-2">{emp.email}</td>
                <td className="px-4 py-3 text-fg-2 text-xs">{emp.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  {emp.isActive ? (
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
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => downloadJoiningLetter(emp)}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="Download joining letter"
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => setEmailingLetterEmp(emp)}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="Email joining letter"
                    >
                      <Mail size={14} />
                    </button>
                    <button
                      onClick={() => setEditing(emp)}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>

                    {emp.isActive ? (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Deactivate ${emp.firstName} ${emp.lastName}? You can reactivate them later.`,
                            )
                          ) {
                            deactivate.mutate(emp.id);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger"
                        title="Deactivate"
                      >
                        <UserX size={14} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Reactivate ${emp.firstName} ${emp.lastName}?`,
                            )
                          ) {
                            reactivate.mutate(emp.id);
                          }
                        }}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-success"
                        title="Reactivate"
                      >
                        <UserCheck size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {query.data && query.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-fg-2">
            Page {query.data.meta.page} of {query.data.meta.totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= query.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <EmployeeFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['employees'] });
        }}
      />

      <EmployeeFormModal
        open={!!editing}
        employee={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['employees'] });
        }}
      />

      <SendJoiningLetterModal
        employee={emailingLetterEmp}
        onClose={() => setEmailingLetterEmp(null)}
      />
    </div>
  );
}

// ============================================================================
// Form modal
// ============================================================================

function EmployeeFormModal({
  open,
  employee,
  onClose,
  onSaved,
}: {
  open: boolean;
  employee?: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!employee;
  const [form, setForm] = useState<CreateEmployeeInput & { employeeCode: string }>({
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    fatherName: '',
    category: 'HOUSEKEEPING',
    department: '',
    designation: '',
    employmentType: 'FULL_TIME',
    dateOfJoining: new Date().toISOString().slice(0, 10),
    baseSalary: categoryDefaults.HOUSEKEEPING,
    currency: 'INR',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setError(null);
      if (employee) {
        const emp: any = employee;
        setForm({
          employeeCode: emp.employeeCode ?? '',
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone ?? '',
          address: emp.address ?? '',
          fatherName: emp.fatherName ?? '',
          category: emp.category ?? 'HOUSEKEEPING',
          department: emp.department ?? '',
          designation: emp.designation ?? '',
          employmentType: emp.employmentType,
          dateOfJoining: emp.dateOfJoining.slice(0, 10),
          baseSalary: emp.baseSalary ? Number(emp.baseSalary) : undefined,
          currency: emp.currency ?? 'INR',
        });
      } else {
        setForm({
          employeeCode: '',
          firstName: '',
          lastName: '',
          email: '',
          phone: '',
          address: '',
          fatherName: '',
          category: 'HOUSEKEEPING',
          department: '',
          designation: '',
          employmentType: 'FULL_TIME',
          dateOfJoining: new Date().toISOString().slice(0, 10),
          baseSalary: categoryDefaults.HOUSEKEEPING,
          currency: 'INR',
        });
      }
    }
  }

  const onCategoryChange = (cat: EmployeeCategory) => {
    setForm({
      ...form,
      category: cat,
      baseSalary: categoryDefaults[cat],
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit && employee) {
        await api.patch(`/api/employees/${employee.id}`, form);
      } else {
        await api.post('/api/employees', form);
      }
      onSaved();
      toast.success(isEdit ? 'Employee updated' : 'Employee created');
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
      title={isEdit ? 'Edit Employee' : 'Add Employee'}
      maxWidth="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Row 1: Employee Code + Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Employee code"
            value={form.employeeCode}
            onChange={(v) => setForm({ ...form, employeeCode: v })}
            required
            placeholder="HK-001"
          />
          <div>
            <label className="block text-xs text-fg-2 mb-1">Category</label>
            <select
              value={form.category}
              onChange={(e) => onCategoryChange(e.target.value as EmployeeCategory)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              {(Object.keys(categoryLabels) as EmployeeCategory[]).map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: First + Last name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="First name"
            value={form.firstName}
            onChange={(v) => setForm({ ...form, firstName: v })}
            required
          />
          <Field
            label="Last name"
            value={form.lastName}
            onChange={(v) => setForm({ ...form, lastName: v })}
            required
          />
        </div>

        {/* Row 3: Father's name (required) */}
        <Field
          label="Father's name"
          value={form.fatherName ?? ''}
          onChange={(v) => setForm({ ...form, fatherName: v })}
          required
        />

        {/* Row 4: Email + Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Email"
            type="email"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            required
          />
          <Field
            label="Phone"
            value={form.phone ?? ''}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
        </div>

        {/* Row 5: Address (required, textarea) */}
        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Address <span className="text-danger">*</span>
          </label>
          <textarea
            required
            rows={2}
            value={form.address ?? ''}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            placeholder="Full residential address"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand resize-none"
          />
        </div>

        {/* Row 6: Department + Designation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field
            label="Department"
            value={form.department ?? ''}
            onChange={(v) => setForm({ ...form, department: v })}
          />
          <Field
            label="Designation"
            value={form.designation ?? ''}
            onChange={(v) => setForm({ ...form, designation: v })}
          />
        </div>

        {/* Row 7: Employment type + Joining date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">Employment type</label>
            <select
              value={form.employmentType}
              onChange={(e) =>
                setForm({ ...form, employmentType: e.target.value as any })
              }
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
            </select>
          </div>
          <Field
            label="Date of joining"
            type="date"
            value={form.dateOfJoining}
            onChange={(v) => setForm({ ...form, dateOfJoining: v })}
            required
          />
        </div>

        {/* Row 8: Base salary + currency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Field
              label="Base salary (monthly)"
              type="number"
              value={form.baseSalary?.toString() ?? ''}
              onChange={(v) =>
                setForm({ ...form, baseSalary: v ? Number(v) : undefined })
              }
            />
            <div className="text-[10px] text-muted mt-1">
              Auto-filled for {categoryLabels[form.category as EmployeeCategory]}:
              ₹{categoryDefaults[form.category as EmployeeCategory].toLocaleString('en-IN')}
            </div>
          </div>
          <Field
            label="Currency"
            value={form.currency ?? 'INR'}
            onChange={(v) => setForm({ ...form, currency: v })}
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
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create employee'}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
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
    </div>
  );
}

function SendJoiningLetterModal({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useState(() => {
    if (employee) {
      setEmail(employee.email || '');
    }
  });

  if (!employee) return null;

  const currentEmail = email || employee.email;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmail || !currentEmail.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{
        success: boolean;
        recipient: string;
        previewUrl?: string | false;
      }>(`/api/employees/${employee.id}/joining-letter/send-email`, {
        recipientEmail: currentEmail,
      });

      toast.success(`Joining letter sent to ${res.recipient}`);
      if (res.previewUrl) {
        console.log('[Ethereal Email Preview]:', res.previewUrl);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send joining letter');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={!!employee} onClose={onClose} title="Email Joining Letter">
      <form onSubmit={handleSend} className="space-y-4">
        <div className="bg-elevated/40 border border-subtle rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-fg-2">Employee:</span>
            <span className="font-semibold text-fg">
              {employee.firstName} {employee.lastName}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-2">Employee Code:</span>
            <span className="font-mono text-fg">{employee.employeeCode}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-2">Designation / Role:</span>
            <span className="text-fg">{employee.designation || 'Staff'} ({employee.department || 'General'})</span>
          </div>
          <div className="flex justify-between text-xs pt-1 border-t border-subtle">
            <span className="text-muted">Date of Joining:</span>
            <span className="text-fg-2 font-mono">
              {new Date(employee.dateOfJoining).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Recipient Email Address <span className="text-danger">*</span>
          </label>
          <input
            type="email"
            required
            value={email || employee.email || ''}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
          <p className="text-xs text-muted mt-1">
            An official welcome email with the signed joining letter attached as a PDF will be delivered.
          </p>
        </div>

        {error && (
          <div className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={sending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={sending}>
            {sending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Send size={14} />
            )}
            {sending ? 'Sending...' : 'Send Joining Letter'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}