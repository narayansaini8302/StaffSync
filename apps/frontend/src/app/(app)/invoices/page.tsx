'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  Download,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  XCircle,
  Trash2,
  Eye,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Client, TaxInvoice, InvoiceStatus, EmployeeCategory } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatMoney(v: string | number, currency = 'INR') {
  const n = typeof v === 'string' ? Number(v) : v;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

const statusConfig: Record<
  InvoiceStatus,
  { label: string; cls: string; icon: any }
> = {
  DRAFT: {
    label: 'Draft',
    cls: 'bg-elevated text-muted border-subtle',
    icon: Clock,
  },
  SENT: {
    label: 'Sent',
    cls: 'bg-warning-soft text-warning border-warning/30',
    icon: FileText,
  },
  PAID: {
    label: 'Paid',
    cls: 'bg-success-soft text-success border-success/30',
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: 'Cancelled',
    cls: 'bg-danger-soft text-danger border-danger/30',
    icon: XCircle,
  },
};

const categoryLabels: Record<EmployeeCategory, string> = {
  HOUSEKEEPING: 'Housekeeping',
  SEMI_SKILLED: 'Semi Skilled',
  SECURITY_GUARD: 'Security Guard',
  SUPERVISOR: 'Supervisor',
};

export default function InvoicesPage() {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [viewing, setViewing] = useState<TaxInvoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ data: TaxInvoice[] }>('/api/invoices'),
  });

  const invoices = query.data?.data ?? [];

  const updateStatus = async (id: string, status: InvoiceStatus) => {
    try {
      await api.patch(`/api/invoices/${id}/status`, { status });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Marked as ${status.toLowerCase()}`);
    } catch (e: any) {
      toast.error('Update failed', e?.message);
    }
  };

  const deleteInvoice = async (id: string) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      await api.delete(`/api/invoices/${id}`);
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice deleted');
    } catch (e: any) {
      toast.error('Delete failed', e?.message);
    }
  };

  const downloadPdf = async (id: string, kind: 'pdf' | 'annexure/pdf', label: string) => {
    setDownloadingId(id + kind);
    try {
      const blob = await api.downloadBlob(`/api/invoices/${id}/${kind}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label}-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Download failed', e?.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Tax Invoices</h1>
          <p className="text-sm text-fg-2 mt-1">
            Bill clients for manpower services
          </p>
        </div>
        <Button onClick={() => setGenerating(true)}>
          <Plus size={16} />
          Generate Invoice
        </Button>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Invoice</th>
              <th className="px-4 py-3 font-medium">Client</th>
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium text-right">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
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

            {!query.isLoading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No invoices yet. Click "Generate Invoice" to create one.
                </td>
              </tr>
            )}

            {invoices.map((inv) => {
              const cfg = statusConfig[inv.status];
              const Icon = cfg.icon;
              return (
                <tr
                  key={inv.id}
                  className="border-b border-subtle last:border-0 hover:bg-hover"
                >
                  <td className="px-4 py-3">
                    <div className="text-fg font-mono text-xs">
                      {inv.invoiceNumber}
                    </div>
                    <div className="text-[10px] text-muted">
                      {inv.issuedAt.slice(0, 10)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {inv.client?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-fg-2 text-xs">
                    {monthLabel(inv.periodStart)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-fg">
                    {formatMoney(inv.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cfg.cls}`}
                    >
                      <Icon size={12} />
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => setViewing(inv)}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                        title="View details"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => downloadPdf(inv.id, 'pdf', 'invoice')}
                        disabled={downloadingId === inv.id + 'pdf'}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand disabled:opacity-50"
                        title="Download invoice"
                      >
                        {downloadingId === inv.id + 'pdf' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                      <button
                        onClick={() =>
                          downloadPdf(inv.id, 'annexure/pdf', 'annexure')
                        }
                        disabled={downloadingId === inv.id + 'annexure/pdf'}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand disabled:opacity-50"
                        title="Download annexure"
                      >
                        {downloadingId === inv.id + 'annexure/pdf' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <FileSpreadsheet size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteInvoice(inv.id)}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <GenerateInvoiceModal
        open={generating}
        onClose={() => setGenerating(false)}
        onSaved={() => {
          setGenerating(false);
          qc.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />

      <InvoiceDetailsModal
        invoice={viewing}
        onClose={() => setViewing(null)}
        onStatusChange={(id, status) => {
          updateStatus(id, status);
          setViewing(null);
        }}
      />
    </div>
  );
}

// ===========================================================================

function GenerateInvoiceModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  });
  const [gstMode, setGstMode] = useState<'auto' | 'cgst_sgst' | 'igst'>('auto');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/api/clients'),
    enabled: open,
  });
  const clients = clientsQuery.data?.data ?? [];

  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setError(null);
      setClientId(clients[0]?.id ?? '');
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.post('/api/invoices', {
        clientId,
        periodStart,
        periodEnd,
        gstMode,
        notes: notes || undefined,
        dueDate: dueDate || undefined,
      });
      toast.success('Invoice generated');
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Tax Invoice"
      maxWidth="max-w-lg"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs text-fg-2 bg-brand-soft border border-brand/30 rounded-lg p-3">
          The invoice will be generated based on all <strong>active assignments</strong> for
          the selected client during the period. Hours come from attendance records
          (only PRESENT days).
        </div>

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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              Period start <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              Period end <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">GST Mode</label>
            <select
              value={gstMode}
              onChange={(e) => setGstMode(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              <option value="auto">Auto (based on state codes)</option>
              <option value="cgst_sgst">CGST + SGST (intra-state)</option>
              <option value="igst">IGST (inter-state)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              Due date (optional)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. September 2026 manpower services"
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand resize-none"
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
          <Button type="submit" disabled={saving || !clientId}>
            {saving ? 'Generating…' : 'Generate Invoice'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================

function InvoiceDetailsModal({
  invoice,
  onClose,
  onStatusChange,
}: {
  invoice: TaxInvoice | null;
  onClose: () => void;
  onStatusChange: (id: string, status: InvoiceStatus) => void;
}) {
  const detailQuery = useQuery({
    queryKey: ['invoice-details', invoice?.id],
    enabled: !!invoice,
    queryFn: () =>
      api.get<TaxInvoice & { lineItems: any[] }>(`/api/invoices/${invoice!.id}`),
  });

  const detail = detailQuery.data;

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={invoice ? `${invoice.invoiceNumber} — ${invoice.client?.name}` : ''}
      maxWidth="max-w-4xl"
    >
      {!invoice || !detail ? (
        <div className="py-10 text-center text-muted">
          <Loader2 size={20} className="inline animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info label="Period" value={`${detail.periodStart.slice(0, 10)} → ${detail.periodEnd.slice(0, 10)}`} />
            <Info label="Employees" value={String(detail.lineItems.length)} />
            <Info label="Total Hours" value={detail.lineItems.reduce((s: number, li: any) => s + Number(li.hoursWorked), 0).toFixed(2)} />
            <Info label="Status" value={detail.status} />
          </div>

          {/* Line items grouped */}
          <div className="border border-subtle rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-elevated/50 border-b border-subtle">
                <tr className="text-fg-2 text-left">
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium text-right">Hours</th>
                  <th className="px-3 py-2 font-medium text-right">Rate</th>
                  <th className="px-3 py-2 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {detail.lineItems.map((li: any) => (
                  <tr key={li.id} className="border-b border-subtle last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-fg-2">
                      {li.employeeCode}
                    </td>
                    <td className="px-3 py-2 text-fg">{li.employeeName}</td>
                    <td className="px-3 py-2 text-fg-2 text-xs">
                      {categoryLabels[li.category as EmployeeCategory]}
                    </td>
                    <td className="px-3 py-2 text-right text-fg">
                      {Number(li.hoursWorked).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-fg-2">
                      {formatMoney(li.hourlyRate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-fg">
                      {formatMoney(li.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 text-sm space-y-1">
              <Row label="Subtotal" value={formatMoney(detail.subtotal)} />
              {Number(detail.cgstAmount) > 0 && (
                <>
                  <Row label="CGST @ 9%" value={formatMoney(detail.cgstAmount)} />
                  <Row label="SGST @ 9%" value={formatMoney(detail.sgstAmount)} />
                </>
              )}
              {Number(detail.igstAmount) > 0 && (
                <Row label="IGST @ 18%" value={formatMoney(detail.igstAmount)} />
              )}
              <div className="border-t border-subtle pt-2 mt-2">
                <Row
                  label="Total"
                  value={formatMoney(detail.totalAmount)}
                  bold
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between gap-2 pt-3 border-t border-subtle">
            <div className="flex gap-2">
              {detail.status !== 'SENT' && detail.status !== 'PAID' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onStatusChange(detail.id, 'SENT')}
                >
                  Mark as Sent
                </Button>
              )}
              {detail.status !== 'PAID' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onStatusChange(detail.id, 'PAID')}
                >
                  Mark as Paid
                </Button>
              )}
              {detail.status !== 'CANCELLED' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onStatusChange(detail.id, 'CANCELLED')}
                >
                  Cancel
                </Button>
              )}
            </div>
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-elevated/50 border border-subtle rounded-lg p-3">
      <div className="text-[10px] text-muted uppercase tracking-wide">{label}</div>
      <div className="text-sm font-medium text-fg mt-1">{value}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className={bold ? 'font-semibold text-fg' : 'text-fg-2'}>{label}</span>
      <span className={bold ? 'font-semibold font-mono text-fg' : 'font-mono text-fg'}>
        {value}
      </span>
    </div>
  );
}