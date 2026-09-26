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
  Mail,
  Send,
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  Receipt,
  Calendar,
  Calculator,
  RotateCcw,
  Printer,
  Building2,
  User,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  Client,
  TaxInvoice,
  InvoiceStatus,
  EmployeeCategory,
  InvoicePayment,
  Company,
} from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatMoney(v: string | number | undefined | null, currency = 'INR') {
  if (v === undefined || v === null) return '₹0.00';
  const n = typeof v === 'string' ? Number(v) : v;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(isNaN(n) ? 0 : n);
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
    label: 'Pending Payment',
    cls: 'bg-brand-soft text-brand border-brand/30',
    icon: FileText,
  },
  PARTIAL: {
    label: 'Partially Paid',
    cls: 'bg-warning-soft text-warning border-warning/30 font-semibold',
    icon: Clock,
  },
  PAID: {
    label: 'Fully Paid',
    cls: 'bg-success-soft text-success border-success/30 font-semibold',
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
  const [emailingInvoice, setEmailingInvoice] = useState<TaxInvoice | null>(null);
  const [payingInvoice, setPayingInvoice] = useState<TaxInvoice | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['invoices'],
    queryFn: () => api.get<{ data: TaxInvoice[] }>('/api/invoices'),
  });

  const invoices = query.data?.data ?? [];

  // KPI Calculations: Total Invoiced, Payment Taken, On Pending
  const totalInvoiced = invoices.reduce(
    (sum, inv) => (inv.status !== 'CANCELLED' ? sum + Number(inv.totalAmount) : sum),
    0,
  );
  const totalPaymentTaken = invoices.reduce(
    (sum, inv) => (inv.status !== 'CANCELLED' ? sum + Number(inv.paidAmount || 0) : sum),
    0,
  );
  const totalPending = Math.max(0, totalInvoiced - totalPaymentTaken);

  const paidCount = invoices.filter((i) => i.status === 'PAID').length;
  const partialCount = invoices.filter((i) => i.status === 'PARTIAL').length;
  const pendingCount = invoices.filter(
    (i) => i.status === 'SENT' || i.status === 'DRAFT',
  ).length;

  const updateStatus = async (id: string, status: InvoiceStatus) => {
    try {
      await api.patch(`/api/invoices/${id}/status`, { status });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      toast.success(`Marked as ${statusConfig[status].label}`);
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

  const downloadPdf = async (
    id: string,
    endpoint: 'pdf' | 'annexure/pdf',
    filenamePrefix: string,
  ) => {
    setDownloadingId(id + endpoint);
    try {
      const token =
        localStorage.getItem('accessToken') ||
        localStorage.getItem('token') ||
        '';
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/invoices/${id}/${endpoint}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenamePrefix}-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error('Download failed', e?.message);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-fg">Tax Invoices & Payments</h1>
          <p className="text-xs sm:text-sm text-fg-2 mt-1">
            Bill clients, record payments taken, and track pending receivables
          </p>
        </div>
        <Button onClick={() => setGenerating(true)} className="w-full sm:w-auto justify-center">
          <Plus size={16} />
          Generate Invoice
        </Button>
      </div>

      {/* KPI Cards: Total Invoiced, Payment Taken, On Pending */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoiced */}
        <div className="bg-surface border border-subtle rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2 uppercase tracking-wide">
              Total Invoiced
            </span>
            <div className="p-2 rounded-lg bg-elevated text-fg-2">
              <FileText size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-fg mt-2">
            {formatMoney(totalInvoiced)}
          </div>
          <div className="text-xs text-muted mt-1">
            {invoices.length} total invoice{invoices.length === 1 ? '' : 's'} generated
          </div>
        </div>

        {/* Payment Taken */}
        <div className="bg-surface border border-success/30 bg-success-soft/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-success uppercase tracking-wide">
              Payment Taken (Received)
            </span>
            <div className="p-2 rounded-lg bg-success-soft text-success">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-success mt-2">
            {formatMoney(totalPaymentTaken)}
          </div>
          <div className="text-xs text-success/80 mt-1">
            {totalInvoiced > 0
              ? `${((totalPaymentTaken / totalInvoiced) * 100).toFixed(1)}% collected`
              : '0% collected'}
          </div>
        </div>

        {/* On Pending */}
        <div className="bg-surface border border-warning/30 bg-warning-soft/10 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-warning uppercase tracking-wide">
              On Pending (Due)
            </span>
            <div className="p-2 rounded-lg bg-warning-soft text-warning">
              <Clock size={18} />
            </div>
          </div>
          <div className="text-2xl font-bold text-warning mt-2">
            {formatMoney(totalPending)}
          </div>
          <div className="text-xs text-warning/80 mt-1">
            {totalInvoiced > 0
              ? `${((totalPending / totalInvoiced) * 100).toFixed(1)}% remaining`
              : '0% remaining'}
          </div>
        </div>

        {/* Status Breakdown */}
        <div className="bg-surface border border-subtle rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-fg-2 uppercase tracking-wide">
              Invoice Status
            </span>
            <div className="p-2 rounded-lg bg-elevated text-fg-2">
              <Receipt size={18} />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="text-center flex-1">
              <div className="text-lg font-bold text-success">{paidCount}</div>
              <div className="text-[11px] text-muted">Paid</div>
            </div>
            <div className="w-px h-8 bg-subtle" />
            <div className="text-center flex-1">
              <div className="text-lg font-bold text-warning">{partialCount}</div>
              <div className="text-[11px] text-muted">Partial</div>
            </div>
            <div className="w-px h-8 bg-subtle" />
            <div className="text-center flex-1">
              <div className="text-lg font-bold text-brand">{pendingCount}</div>
              <div className="text-[11px] text-muted">Pending</div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-elevated/50 border-b border-subtle">
              <tr className="text-fg-2 text-left">
                <th className="px-4 py-3.5 font-medium">Invoice #</th>
                <th className="px-4 py-3.5 font-medium">Client</th>
                <th className="px-4 py-3.5 font-medium">Period</th>
                <th className="px-4 py-3.5 font-medium text-right">Total Billed</th>
                <th className="px-4 py-3.5 font-medium text-right text-success">
                  Payment Taken
                </th>
                <th className="px-4 py-3.5 font-medium text-right text-warning">
                  On Pending
                </th>
                <th className="px-4 py-3.5 font-medium">Status</th>
                <th className="px-4 py-3.5 font-medium text-right pr-6">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {query.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    <Loader2 size={24} className="inline animate-spin text-brand mr-2" />
                    Loading invoices and payment ledger...
                  </td>
                </tr>
              )}

              {!query.isLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted">
                    No invoices yet. Click "Generate Invoice" above to create one.
                  </td>
                </tr>
              )}

              {invoices.map((inv) => {
                const cfg = statusConfig[inv.status] || statusConfig.DRAFT;
                const Icon = cfg.icon;
                const total = Number(inv.totalAmount);
                const paid = Number(inv.paidAmount || 0);
                const pending = Math.max(0, total - paid);

                return (
                  <tr
                    key={inv.id}
                    className="hover:bg-hover transition-colors"
                  >
                    {/* Invoice Number & Date */}
                    <td className="px-4 py-3.5">
                      <div className="text-fg font-mono font-medium text-xs">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-[11px] text-muted">
                        Issued: {inv.issuedAt.slice(0, 10)}
                      </div>
                    </td>

                    {/* Client Name */}
                    <td className="px-4 py-3.5 font-medium text-fg">
                      {inv.client?.name ?? '—'}
                    </td>

                    {/* Billing Period */}
                    <td className="px-4 py-3.5 text-fg-2 text-xs">
                      {monthLabel(inv.periodStart)}
                    </td>

                    {/* Total Invoice Value */}
                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-fg">
                      {formatMoney(total)}
                    </td>

                    {/* Payment Taken */}
                    <td className="px-4 py-3.5 text-right font-mono">
                      {paid > 0 ? (
                        <span className="font-semibold text-success">
                          {formatMoney(paid)}
                        </span>
                      ) : (
                        <span className="text-muted">₹0.00</span>
                      )}
                    </td>

                    {/* On Pending */}
                    <td className="px-4 py-3.5 text-right font-mono">
                      {pending > 0 ? (
                        <span className="font-semibold text-warning">
                          {formatMoney(pending)}
                        </span>
                      ) : (
                        <span className="font-semibold text-success flex items-center justify-end gap-1">
                          <CheckCircle2 size={13} />
                          Settled
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border ${cfg.cls}`}
                      >
                        <Icon size={12} />
                        {cfg.label}
                      </span>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-4 py-3.5 text-right pr-6">
                      <div className="inline-flex items-center gap-1">
                        {/* Quick Record Payment Button */}
                        {pending > 0 && inv.status !== 'CANCELLED' && (
                          <button
                            onClick={() => setPayingInvoice(inv)}
                            className="p-1.5 rounded-lg bg-success-soft text-success hover:bg-success/20 border border-success/30 transition text-xs font-medium flex items-center gap-1 mr-1"
                            title="Record Payment Taken"
                          >
                            <CreditCard size={13} />
                            <span>Add Pay</span>
                          </button>
                        )}

                        <button
                          onClick={() => setViewing(inv)}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand transition"
                          title="View details & payment history"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => setEmailingInvoice(inv)}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand transition"
                          title="Email invoice to client"
                        >
                          <Mail size={15} />
                        </button>
                        <button
                          onClick={() => downloadPdf(inv.id, 'pdf', 'invoice')}
                          disabled={downloadingId === inv.id + 'pdf'}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand disabled:opacity-50 transition"
                          title="Download Tax Invoice PDF"
                        >
                          {downloadingId === inv.id + 'pdf' ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Download size={15} />
                          )}
                        </button>
                        <button
                          onClick={() =>
                            downloadPdf(inv.id, 'annexure/pdf', 'annexure')
                          }
                          disabled={downloadingId === inv.id + 'annexure/pdf'}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand disabled:opacity-50 transition"
                          title="Download Employee Annexure PDF"
                        >
                          {downloadingId === inv.id + 'annexure/pdf' ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <FileSpreadsheet size={15} />
                          )}
                        </button>
                        <button
                          onClick={() => deleteInvoice(inv.id)}
                          className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-danger transition"
                          title="Delete invoice"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Generator Section */}
      <InvoiceGeneratorSection
        onInvoiceCreated={(newInv) => {
          qc.invalidateQueries({ queryKey: ['invoices'] });
        }}
        downloadPdf={downloadPdf}
        onEmail={(inv) => setEmailingInvoice(inv)}
      />

      {/* Generate Invoice Modal */}
      <GenerateInvoiceModal
        open={generating}
        onClose={() => setGenerating(false)}
        onSaved={() => {
          setGenerating(false);
          qc.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />

      {/* Record Payment Modal */}
      <RecordPaymentModal
        invoice={payingInvoice}
        open={!!payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onSaved={() => {
          setPayingInvoice(null);
          qc.invalidateQueries({ queryKey: ['invoices'] });
          if (viewing) {
            qc.invalidateQueries({ queryKey: ['invoice-detail', viewing.id] });
          }
        }}
      />

      {/* Detailed Invoice & Payment History Modal */}
      <InvoiceDetailsModal
        invoice={viewing}
        onClose={() => setViewing(null)}
        onOpenPayment={(inv) => setPayingInvoice(inv)}
        onStatusChange={(id, status) => {
          updateStatus(id, status);
          setViewing(null);
        }}
        onEmail={(inv) => {
          setViewing(null);
          setEmailingInvoice(inv);
        }}
      />

      {/* Email Invoice to Client Modal */}
      <SendInvoiceModal
        invoice={emailingInvoice}
        onClose={() => setEmailingInvoice(null)}
        onSent={() => {
          setEmailingInvoice(null);
          qc.invalidateQueries({ queryKey: ['invoices'] });
        }}
      />
    </div>
  );
}

// ===========================================================================
// Record Payment Modal (Manual payment entry)
// ===========================================================================

function RecordPaymentModal({
  invoice,
  open,
  onClose,
  onSaved,
}: {
  invoice: TaxInvoice | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [paymentMode, setPaymentMode] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-populate amount with remaining pending amount whenever invoice opens
  const total = invoice ? Number(invoice.totalAmount) : 0;
  const paid = invoice ? Number(invoice.paidAmount || 0) : 0;
  const pending = Math.max(0, total - paid);

  const [lastId, setLastId] = useState<string | null>(null);
  if (invoice && invoice.id !== lastId) {
    setLastId(invoice.id);
    setAmount(String(pending > 0 ? pending : total));
    setReference('');
    setNotes('');
    setError(null);
  }

  if (!open || !invoice) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid payment amount greater than 0');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await api.post(`/api/invoices/${invoice.id}/payments`, {
        amount: numAmount,
        paymentDate,
        paymentMode,
        reference: reference || undefined,
        notes: notes || undefined,
      });
      toast.success(
        'Payment recorded',
        `${formatMoney(numAmount)} recorded successfully for ${invoice.invoiceNumber}`,
      );
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Record Payment — ${invoice.invoiceNumber}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={submit} className="space-y-4">
        {/* Invoice Summary Box */}
        <div className="bg-elevated/60 border border-subtle rounded-xl p-3.5 space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted">Client:</span>
            <span className="font-semibold text-fg">{invoice.client?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Total Invoice:</span>
            <span className="font-mono font-semibold text-fg">
              {formatMoney(total)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted">Already Paid:</span>
            <span className="font-mono font-semibold text-success">
              {formatMoney(paid)}
            </span>
          </div>
          <div className="flex justify-between border-t border-subtle pt-2">
            <span className="font-semibold text-fg">Current Pending Due:</span>
            <span className="font-mono font-bold text-warning">
              {formatMoney(pending)}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 text-xs bg-danger-soft text-danger border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        {/* Payment Amount */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Payment Amount (₹) <span className="text-danger">*</span>
          </label>
          <input
            type="number"
            step="any"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg font-mono text-base font-semibold focus:outline-none focus:border-brand"
          />
          <div className="flex gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => setAmount(String(pending))}
              className="text-[11px] text-brand hover:underline"
            >
              Fill full pending ({formatMoney(pending)})
            </button>
            {pending > 0 && (
              <button
                type="button"
                onClick={() => setAmount(String(Math.round(pending / 2)))}
                className="text-[11px] text-muted hover:underline"
              >
                Half (50%)
              </button>
            )}
          </div>
        </div>

        {/* Payment Date & Mode */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-fg-2 mb-1">
              Payment Date <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fg-2 mb-1">
              Payment Mode
            </label>
            <select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              <option value="BANK_TRANSFER">Bank Transfer (NEFT/RTGS)</option>
              <option value="UPI">UPI / QR Code</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        {/* Transaction Reference */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Reference / UTR / Cheque Number
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. UTR492019482 or Chq #000123"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Remarks / Notes
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional remarks (e.g. Part payment received)"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {/* Submit / Cancel */}
        <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Recording…
              </>
            ) : (
              `Record Payment (${formatMoney(amount)})`
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// Detailed Invoice View Modal (with Full Payment Ledger & Line Items)
// ===========================================================================

function InvoiceDetailsModal({
  invoice,
  onClose,
  onOpenPayment,
  onStatusChange,
  onEmail,
}: {
  invoice: TaxInvoice | null;
  onClose: () => void;
  onOpenPayment: (inv: TaxInvoice) => void;
  onStatusChange: (id: string, status: InvoiceStatus) => void;
  onEmail: (inv: TaxInvoice) => void;
}) {
  const qc = useQueryClient();
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['invoice-detail', invoice?.id],
    queryFn: () => api.get<TaxInvoice>(`/api/invoices/${invoice!.id}`),
    enabled: !!invoice,
  });

  const detail = detailQuery.data;

  const handleDeletePayment = async (paymentId: string, paymentAmount: string | number) => {
    if (
      !confirm(
        `Are you sure you want to delete this payment of ${formatMoney(paymentAmount)}? The pending amount will be recomputed.`,
      )
    ) {
      return;
    }
    setDeletingPaymentId(paymentId);
    try {
      await api.delete(`/api/invoices/${invoice!.id}/payments/${paymentId}`);
      toast.success('Payment removed');
      qc.invalidateQueries({ queryKey: ['invoice-detail', invoice!.id] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (e: any) {
      toast.error('Failed to delete payment', e?.message);
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const total = detail ? Number(detail.totalAmount) : 0;
  const paid = detail ? Number(detail.paidAmount || 0) : 0;
  const pending = Math.max(0, total - paid);
  const percentPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={invoice ? `${invoice.invoiceNumber} — ${invoice.client?.name}` : ''}
      maxWidth="max-w-4xl"
    >
      {!invoice || !detail ? (
        <div className="py-12 text-center text-muted">
          <Loader2 size={24} className="inline animate-spin text-brand mr-2" />
          Loading invoice details & payment history…
        </div>
      ) : (
        <div className="space-y-5">
          {/* Top Info Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Info
              label="Billing Period"
              value={`${detail.periodStart.slice(0, 10)} → ${detail.periodEnd.slice(0, 10)}`}
            />
            <Info
              label="Employees Billed"
              value={String(detail.lineItems?.length ?? 0)}
            />
            <Info
              label="Total Hours"
              value={(detail.lineItems ?? [])
                .reduce((s: number, li: any) => s + Number(li.hoursWorked), 0)
                .toFixed(2)}
            />
            <Info
              label="Invoice Status"
              value={statusConfig[detail.status]?.label ?? detail.status}
            />
          </div>

          {/* Payment Progress Bar */}
          <div className="bg-elevated/60 border border-subtle rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-fg">Payment Collection Progress</span>
              <span className="font-mono text-muted">
                {percentPaid}% Collected ({formatMoney(paid)} of {formatMoney(total)})
              </span>
            </div>
            <div className="w-full h-3 bg-surface rounded-full overflow-hidden border border-subtle">
              <div
                className={`h-full transition-all duration-500 ${
                  percentPaid >= 100
                    ? 'bg-success'
                    : percentPaid > 0
                    ? 'bg-warning'
                    : 'bg-muted'
                }`}
                style={{ width: `${percentPaid}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-xs pt-1">
              <span className="text-success font-medium">
                Payment Taken: {formatMoney(paid)}
              </span>
              <span className="text-warning font-semibold">
                On Pending: {formatMoney(pending)}
              </span>
            </div>
          </div>

          {/* Payment History Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-1.5">
                <CreditCard size={15} className="text-brand" />
                Payment Ledger ({detail.payments?.length ?? 0} payment
                {(detail.payments?.length ?? 0) === 1 ? '' : 's'})
              </h3>
              {pending > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onOpenPayment(detail)}
                >
                  <Plus size={13} />
                  Add Payment
                </Button>
              )}
            </div>

            <div className="border border-subtle rounded-xl overflow-hidden bg-surface">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-elevated/50 border-b border-subtle">
                  <tr className="text-fg-2 text-left">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Payment Mode</th>
                    <th className="px-3 py-2 font-medium">Reference / UTR</th>
                    <th className="px-3 py-2 font-medium">Remarks</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                    <th className="px-3 py-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {(!detail.payments || detail.payments.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-muted italic">
                        No payments recorded yet for this invoice.
                      </td>
                    </tr>
                  )}
                  {detail.payments?.map((pmt) => (
                    <tr key={pmt.id} className="hover:bg-hover transition-colors">
                      <td className="px-3 py-2 font-mono text-fg-2">
                        {pmt.paymentDate.slice(0, 10)}
                      </td>
                      <td className="px-3 py-2 text-fg font-medium">
                        <span className="px-1.5 py-0.5 rounded bg-elevated border border-subtle text-[11px]">
                          {pmt.paymentMode.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-fg-2">
                        {pmt.reference || '—'}
                      </td>
                      <td className="px-3 py-2 text-fg-2">{pmt.notes || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-success">
                        {formatMoney(pmt.amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => handleDeletePayment(pmt.id, pmt.amount)}
                          disabled={deletingPaymentId === pmt.id}
                          className="p-1 rounded text-muted hover:text-danger hover:bg-hover transition disabled:opacity-50"
                          title="Delete this payment"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          {/* Manpower Line items table */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-fg flex items-center gap-1.5">
              <FileText size={15} className="text-brand" />
              Billed Manpower Line Items
            </h3>
            <div className="border border-subtle rounded-xl overflow-hidden bg-surface max-h-60 overflow-y-auto">
              <div className="overflow-x-auto w-full">
                <table className="w-full text-xs min-w-[560px]">
                <thead className="bg-elevated/50 border-b border-subtle sticky top-0">
                  <tr className="text-fg-2 text-left">
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Hours Worked</th>
                    <th className="px-3 py-2 font-medium text-right">Hourly Rate</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {detail.lineItems?.map((li: any) => (
                    <tr key={li.id} className="hover:bg-hover">
                      <td className="px-3 py-2 font-mono text-fg-2">
                        {li.employeeCode}
                      </td>
                      <td className="px-3 py-2 text-fg font-medium">
                        {li.employeeName}
                      </td>
                      <td className="px-3 py-2 text-fg-2">
                        {categoryLabels[li.category as EmployeeCategory] || li.category}
                      </td>
                      <td className="px-3 py-2 text-right text-fg font-mono">
                        {Number(li.hoursWorked).toFixed(2)}h
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-fg-2">
                        {formatMoney(li.hourlyRate)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-fg">
                        {formatMoney(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          {/* Totals & Net Payable */}
          <div className="flex justify-end">
            <div className="w-80 text-xs space-y-1.5 bg-elevated/40 border border-subtle rounded-xl p-3.5">
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
              <div className="border-t border-subtle pt-1.5">
                <Row
                  label="Total Invoice Amount"
                  value={formatMoney(detail.totalAmount)}
                  bold
                />
              </div>
              <Row
                label="Payment Taken"
                value={formatMoney(paid)}
                cls="text-success font-semibold"
              />
              <div className="border-t border-subtle pt-1.5">
                <Row
                  label="Remaining On Pending"
                  value={formatMoney(pending)}
                  cls="text-warning font-bold text-sm"
                  bold
                />
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap justify-between items-center gap-2 pt-3 border-t border-subtle">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onEmail(detail)}>
                <Mail size={14} />
                Email to Client
              </Button>
              {pending > 0 && (
                <Button size="sm" onClick={() => onOpenPayment(detail)}>
                  <CreditCard size={14} />
                  Record Payment
                </Button>
              )}
              {detail.status !== 'PAID' && pending === 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onStatusChange(detail.id, 'PAID')}
                >
                  Mark as Paid
                </Button>
              )}
            </div>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
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
  cls,
}: {
  label: string;
  value: string;
  bold?: boolean;
  cls?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={bold ? 'font-semibold text-fg' : 'text-fg-2'}>{label}</span>
      <span
        className={`font-mono ${
          cls ? cls : bold ? 'font-semibold text-fg' : 'text-fg'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ===========================================================================
// Generate Invoice Modal
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
  const [invoiceNumber, setInvoiceNumber] = useState('');
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
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      setInvoiceNumber(`INV-${year}-${rand}`);
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
        invoiceNumber: invoiceNumber.trim() || undefined,
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
          The invoice will be computed from all <strong>active assignments</strong> for
          the selected client during the period. Hours calculate from daily manual attendance
          (Full Day 8h & Half Day 4h).
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-fg-2 font-medium">
              Tax Invoice Number <span className="text-muted">(Manual / Editable)</span>
            </label>
            <span className="text-[10px] text-muted">
              Auto-suggested • Type custom if desired
            </span>
          </div>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="e.g. INV-2026-0001 or 001"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg font-mono text-sm focus:outline-none focus:border-brand"
          />
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Client <span className="text-danger">*</span>
          </label>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">
              Period start <span className="text-danger">*</span>
            </label>
            <input
              type="date"
              required
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
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
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-fg-2 mb-1">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="block text-xs text-fg-2 mb-1">GST Mode</label>
            <select
              value={gstMode}
              onChange={(e) => setGstMode(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              <option value="auto">Auto (from state codes)</option>
              <option value="cgst_sgst">Intra-state (CGST 9% + SGST 9%)</option>
              <option value="igst">Inter-state (IGST 18%)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">Notes / Terms</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment due within 15 days of invoice date…"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {error && (
          <div className="p-3 text-xs bg-danger-soft text-danger border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !clientId}>
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Generating…
              </>
            ) : (
              'Generate'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// Email Invoice Modal
// ===========================================================================

function SendInvoiceModal({
  invoice,
  onClose,
  onSent,
}: {
  invoice: TaxInvoice | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [includeAnnexure, setIncludeAnnexure] = useState(true);
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGeneralInvoice =
    Boolean(invoice?.invoiceNumber?.startsWith('GEN-')) ||
    Boolean(invoice?.notes && invoice.notes.includes('[GENERAL_INVOICE]'));

  const [lastId, setLastId] = useState<string | null>(null);
  if (invoice && invoice.id !== lastId) {
    setLastId(invoice.id);
    setRecipientEmail(invoice.client?.email ?? '');
    setIncludeAnnexure(!isGeneralInvoice);
    setCustomMessage('');
    setError(null);
  }

  if (!invoice) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.post(`/api/invoices/${invoice.id}/send-email`, {
        recipientEmail: recipientEmail || undefined,
        includeAnnexure: isGeneralInvoice ? false : includeAnnexure,
        customMessage: customMessage || undefined,
      });
      toast.success(
        'Invoice sent',
        `Invoice ${invoice.invoiceNumber} emailed to ${recipientEmail}`,
      );
      onSent();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send invoice email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={`Email Invoice ${invoice.invoiceNumber}`}
      maxWidth="max-w-md"
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Recipient Email Address <span className="text-danger">*</span>
          </label>
          <input
            type="email"
            required
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="accounts@client.com"
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {!isGeneralInvoice ? (
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeAnnexure"
              checked={includeAnnexure}
              onChange={(e) => setIncludeAnnexure(e.target.checked)}
              className="rounded border-subtle text-brand focus:ring-brand"
            />
            <label htmlFor="includeAnnexure" className="text-xs text-fg">
              Attach detailed Employee Annexure PDF
            </label>
          </div>
        ) : (
          <div className="text-[11px] text-muted italic bg-elevated/40 px-3 py-2 rounded-lg border border-subtle">
            General invoices include services directly on the invoice and do not require employee attendance annexures.
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-fg-2 mb-1">
            Custom Message (Optional)
          </label>
          <textarea
            rows={3}
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Please find attached our tax invoice for services rendered..."
            className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>

        {error && (
          <div className="p-3 text-xs bg-danger-soft text-danger border border-danger/30 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-subtle">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={sending || !recipientEmail}>
            {sending ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send size={14} /> Send Invoice Email
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// Number to Words Converter (Indian Currency Format)
// ===========================================================================

function numberToWordsIndian(num: number): string {
  const a = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const b = [
    '',
    '',
    'Twenty',
    'Thirty',
    'Forty',
    'Fifty',
    'Sixty',
    'Seventy',
    'Eighty',
    'Ninety',
  ];

  function twoDigits(n: number): string {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
  }

  function threeDigits(n: number): string {
    if (n < 100) return twoDigits(n);
    return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + twoDigits(n % 100) : '');
  }

  const rupees = Math.floor(Math.abs(num));
  const paise = Math.round((Math.abs(num) - rupees) * 100);

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let result = '';
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = rupees % 1000;

  if (crore) result += threeDigits(crore) + ' Crore ';
  if (lakh) result += twoDigits(lakh) + ' Lakh ';
  if (thousand) result += twoDigits(thousand) + ' Thousand ';
  if (hundred) result += threeDigits(hundred);

  result = result.trim() + ' Rupees';
  if (paise) result += ' and ' + twoDigits(paise) + ' Paise';
  return result + ' Only';
}

// ===========================================================================
// Invoice Generator Section (Manual General Invoice Builder)
// ===========================================================================

interface ManualLineItem {
  id: string;
  description: string;
  quantity: string | number;
  rate: string | number;
}

function InvoiceGeneratorSection({
  onInvoiceCreated,
  downloadPdf,
  onEmail,
}: {
  onInvoiceCreated: (inv: TaxInvoice) => void;
  downloadPdf: (
    id: string,
    endpoint: 'pdf' | 'annexure/pdf',
    filenamePrefix: string,
  ) => Promise<void>;
  onEmail?: (inv: TaxInvoice) => void;
}) {
  const companyQuery = useQuery({
    queryKey: ['company'],
    queryFn: () => api.get<Company>('/api/company'),
  });

  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/api/clients'),
  });

  const company = companyQuery.data;
  const clients = clientsQuery.data?.data ?? [];

  // Form State
  const [invoiceTitle, setInvoiceTitle] = useState('GENERAL INVOICE');
  const [invoiceNumber, setInvoiceNumber] = useState(() => {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `GEN-${year}-${rand}`;
  });
  const [issuedAt, setIssuedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [periodEnd, setPeriodEnd] = useState(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  });

  // Client Address State (fully editable for this invoice)
  const [selectedClientId, setSelectedClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [clientStateCode, setClientStateCode] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');

  // GST & Terms State
  const [gstMode, setGstMode] = useState<'auto' | 'cgst_sgst' | 'igst' | 'none'>('auto');
  const [notes, setNotes] = useState(
    '1. Payment is due within 15 days of invoice date.\n2. Please mention the invoice number on your remittance advice.\n3. Make all payments via NEFT/RTGS to the company bank account details listed above.',
  );

  // Manual Line Items State
  const [items, setItems] = useState<ManualLineItem[]>([
    {
      id: 'item-1',
      description: 'Operational & Facility Management Services',
      quantity: 1,
      rate: 15000,
    },
  ]);

  // Submission State
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<TaxInvoice | null>(null);

  // Handle Client Selection Dropdown
  const handleClientSelect = (clientId: string) => {
    setSelectedClientId(clientId);
    if (!clientId) return;
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setClientName(client.name || '');
      setClientAddress(client.address || '');
      setClientGstin(client.gstin || '');
      setClientStateCode(client.stateCode || '');
      setClientEmail(client.email || '');
      setClientPhone(client.phone || '');
    }
  };

  // Add / Remove / Update Line Items
  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        description: '',
        quantity: 1,
        rate: 0,
      },
    ]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) {
      toast.error('At least one line item is required');
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateItem = (id: string, field: keyof ManualLineItem, value: any) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
    );
  };

  // Reset Form to Default State
  const resetForm = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    setInvoiceTitle('GENERAL INVOICE');
    setInvoiceNumber(`GEN-${year}-${rand}`);
    setIssuedAt(new Date().toISOString().slice(0, 10));
    const d = new Date();
    d.setDate(d.getDate() + 15);
    setDueDate(d.toISOString().slice(0, 10));
    setSelectedClientId('');
    setClientName('');
    setClientAddress('');
    setClientGstin('');
    setClientStateCode('');
    setClientEmail('');
    setClientPhone('');
    setGstMode('auto');
    setItems([
      {
        id: `item-${Date.now()}`,
        description: 'Operational & Facility Management Services',
        quantity: 1,
        rate: 15000,
      },
    ]);
    setError(null);
    setLastCreated(null);
    toast.info('Form reset', 'Invoice generator has been restored to default values');
  };

  // Live Automated Calculations
  const subtotal = items.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const r = Number(it.rate) || 0;
    return sum + q * r;
  }, 0);

  // Determine Effective GST Mode
  let effectiveGst: 'cgst_sgst' | 'igst' | 'none' = 'cgst_sgst';
  if (gstMode === 'auto') {
    const cState = (clientStateCode || '').trim().toLowerCase();
    const compState = (company?.stateCode || '').trim().toLowerCase();
    if (cState && compState && cState !== compState) {
      effectiveGst = 'igst';
    } else {
      effectiveGst = 'cgst_sgst';
    }
  } else {
    effectiveGst = gstMode;
  }

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (effectiveGst === 'cgst_sgst') {
    cgst = Math.round(subtotal * 0.09 * 100) / 100;
    sgst = Math.round(subtotal * 0.09 * 100) / 100;
  } else if (effectiveGst === 'igst') {
    igst = Math.round(subtotal * 0.18 * 100) / 100;
  }

  const grandTotal = Math.round((subtotal + cgst + sgst + igst) * 100) / 100;
  // Amount in words kept default (auto-computed from grand total)
  const amountInWords = numberToWordsIndian(grandTotal);

  // Submit Handler
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setError('Please provide a Client Name (Buyer/Billed To)');
      return;
    }
    if (items.length === 0) {
      setError('At least one service line item is required');
      return;
    }
    const invalidItem = items.find((it) => !it.description.trim());
    if (invalidItem) {
      setError('Please fill out the description for all line items');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const payload = {
        clientId: selectedClientId || undefined,
        clientName: clientName.trim(),
        clientAddress: clientAddress.trim() || undefined,
        clientGstin: clientGstin.trim() || undefined,
        clientStateCode: clientStateCode.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        invoiceTitle: invoiceTitle.trim() || 'GENERAL INVOICE',
        invoiceNumber: invoiceNumber.trim() || undefined,
        issuedAt: issuedAt || undefined,
        dueDate: dueDate || undefined,
        periodStart: periodStart || undefined,
        periodEnd: periodEnd || undefined,
        gstMode,
        notes: notes.trim() || undefined,
        items: items.map((it) => ({
          description: it.description.trim(),
          quantity: Number(it.quantity) || 1,
          rate: Number(it.rate) || 0,
        })),
      };

      const created = await api.post<TaxInvoice>(
        '/api/invoices/manual',
        payload,
      );

      toast.success(
        'General Invoice Created!',
        `Invoice ${created.invoiceNumber} recorded for ${formatMoney(grandTotal)}`,
      );
      setLastCreated(created);
      onInvoiceCreated(created);

      // Generate next invoice number for next generation
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      setInvoiceNumber(`GEN-${year}-${rand}`);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create general invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-8 border border-subtle bg-surface rounded-2xl p-4 sm:p-6 lg:p-8 space-y-6 shadow-sm">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-subtle">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand/10 text-brand border border-brand/20 shrink-0">
            <Calculator size={22} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold text-fg">Invoice Generator</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand border border-brand/20">
                General Invoice
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Create manual general invoices. Company and bank details are default and protected, with automated calculations and client editing.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={resetForm}
            className="text-xs gap-1.5 w-full sm:w-auto"
          >
            <RotateCcw size={13} /> Reset Form
          </Button>
        </div>
      </div>

      {/* Success Notification Banner with Download & Email */}
      {lastCreated && (
        <div className="p-4 rounded-xl bg-success-soft border border-success/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-start sm:items-center gap-2.5 text-xs text-success">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span className="font-semibold">Invoice Successfully Generated: </span>
              <span className="font-mono font-bold">{lastCreated.invoiceNumber}</span>{' '}
              ({formatMoney(lastCreated.totalAmount)}) — Saved directly to the ledger.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              size="sm"
              onClick={() => downloadPdf(lastCreated.id, 'pdf', 'invoice')}
              className="text-xs gap-1.5 flex-1 sm:flex-initial"
            >
              <Download size={13} /> Download PDF
            </Button>
            {onEmail && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onEmail(lastCreated)}
                className="text-xs gap-1.5 flex-1 sm:flex-initial"
              >
                <Mail size={13} /> Email to Client
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Invoice Generator Canvas Form */}
      <form onSubmit={handleSaveInvoice} className="space-y-6">
        {/* Row 1: Invoice Title & Metadata */}
        <div className="bg-elevated/40 border border-subtle rounded-xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="w-full lg:max-w-md">
              <label className="block text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
                Invoice Title (On PDF Header)
              </label>
              <input
                type="text"
                value={invoiceTitle}
                onChange={(e) => setInvoiceTitle(e.target.value)}
                placeholder="GENERAL INVOICE"
                className="w-full px-3 py-2 text-base sm:text-xl font-bold uppercase tracking-wide bg-surface border border-subtle text-brand rounded-lg focus:outline-none focus:border-brand"
              />
            </div>

            {/* Metadata Fields Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:max-w-2xl">
              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Invoice Number
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-subtle text-fg font-mono text-xs focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Invoice Date
                </label>
                <input
                  type="date"
                  value={issuedAt}
                  onChange={(e) => setIssuedAt(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Payment Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Billing Period
                </label>
                <input
                  type="text"
                  value={`${periodStart} → ${periodEnd}`}
                  onChange={(e) => {
                    const parts = e.target.value.split('→');
                    if (parts[0]) setPeriodStart(parts[0].trim());
                    if (parts[1]) setPeriodEnd(parts[1].trim());
                  }}
                  placeholder="YYYY-MM-DD → YYYY-MM-DD"
                  className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs font-mono focus:outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Company Details (Default & Read-only) & Client Details (Editable) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Details (Seller / Billed By) - Default / Read-only */}
          <div className="bg-elevated/40 border border-subtle rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-subtle">
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-brand" />
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                  Company Details (Billed By)
                </h3>
              </div>
              <span className="text-[10px] text-brand bg-brand/10 font-semibold px-2 py-0.5 rounded border border-brand/20">
                Default Company Profile
              </span>
            </div>

            {/* Read-Only Company Details Card */}
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-muted uppercase tracking-wider block font-semibold">
                  Company Name
                </span>
                <p className="text-sm font-bold text-fg mt-0.5">
                  {company?.name || 'Your Company Name'}
                </p>
              </div>

              <div>
                <span className="text-[10px] text-muted uppercase tracking-wider block font-semibold">
                  Registered Address
                </span>
                <p className="text-xs text-fg-2 mt-0.5 leading-relaxed">
                  {company?.address || 'Address configured in Settings > Company'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-subtle/50">
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    GSTIN
                  </span>
                  <span className="font-mono text-xs font-semibold text-fg">
                    {company?.gstin || 'Not registered'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    State Code / PAN
                  </span>
                  <span className="font-mono text-xs text-fg">
                    {company?.stateCode ? `Code ${company.stateCode}` : '—'}
                    {company?.pan ? ` • PAN: ${company.pan}` : ''}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-subtle/50">
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    Email
                  </span>
                  <span className="text-xs text-fg">
                    {company?.email || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    Phone
                  </span>
                  <span className="text-xs text-fg">
                    {company?.phone || '—'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-surface/70 border border-subtle text-[11px] text-muted flex items-center justify-between">
                <span>Company information is automatically pulled from your account settings.</span>
              </div>
            </div>
          </div>

          {/* Client Details (Buyer / Billed To) - Fully Editable */}
          <div className="bg-elevated/40 border border-subtle rounded-xl p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-subtle">
              <div className="flex items-center gap-2">
                <User size={16} className="text-brand" />
                <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                  Client Details (Billed To / Buyer)
                </h3>
              </div>

              {/* Quick Select Client Dropdown */}
              <div className="w-full sm:w-auto">
                <select
                  value={selectedClientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  className="w-full sm:w-auto px-2.5 py-1 rounded-lg bg-surface border border-subtle text-fg text-xs focus:outline-none focus:border-brand"
                >
                  <option value="">— Select Saved Client (Auto-fill) —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.gstin ? `(${c.gstin})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Client / Organization Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Global Tech Solutions Ltd"
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg font-medium focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-fg-2 mb-1">
                  Client Billing Address
                </label>
                <textarea
                  rows={2}
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Suite No., Building, City, State, PIN"
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg focus:outline-none focus:border-brand resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-fg-2 mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={clientGstin}
                    onChange={(e) => setClientGstin(e.target.value.toUpperCase())}
                    placeholder="27BBBBB1111B2Z6"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg font-mono uppercase focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-fg-2 mb-1">
                    State Code (2-digit)
                  </label>
                  <input
                    type="text"
                    value={clientStateCode}
                    onChange={(e) => setClientStateCode(e.target.value)}
                    placeholder="e.g. 27 or 08"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg font-mono focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-fg-2 mb-1">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="accounts@client.com"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-fg-2 mb-1">
                    Contact Phone
                  </label>
                  <input
                    type="text"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+91 9123456780"
                    className="w-full px-3 py-1.5 rounded-lg bg-surface border border-subtle text-fg focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Row 3: GST Mode Selection */}
        <div className="bg-elevated/40 border border-subtle rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
          <div>
            <span className="font-semibold text-fg">Tax / GST Calculation Mode:</span>
            <p className="text-[11px] text-muted mt-0.5">
              Determines whether CGST+SGST (intra-state) or IGST (inter-state) applies.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            {[
              { id: 'auto', label: 'Auto Detect' },
              { id: 'cgst_sgst', label: 'CGST 9% + SGST 9%' },
              { id: 'igst', label: 'IGST 18%' },
              { id: 'none', label: 'Nil / Exempt (0%)' },
            ].map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setGstMode(mode.id as any)}
                className={`px-3 py-1.5 rounded-lg font-medium border text-center transition ${
                  gstMode === mode.id
                    ? 'bg-brand text-white border-brand shadow-sm'
                    : 'bg-surface text-fg-2 border-subtle hover:bg-hover'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 4: Line Items (Particulars of Service) - Fully Responsive */}
        <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-elevated/50 border-b border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt size={16} className="text-brand" />
              <h3 className="text-xs font-bold text-fg uppercase tracking-wider">
                Particulars / Services Rendered
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addItem}
              className="text-xs gap-1 py-1"
            >
              <Plus size={13} /> Add Line Item
            </Button>
          </div>

          {/* Mobile View: Stacked touch-friendly cards for screens < 640px */}
          <div className="block sm:hidden divide-y divide-subtle">
            {items.map((item, idx) => {
              const q = Number(item.quantity) || 0;
              const r = Number(item.rate) || 0;
              const lineAmount = q * r;

              return (
                <div key={item.id} className="p-3.5 space-y-3 bg-surface">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-fg">Service Item #{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length <= 1}
                      className="p-1.5 text-fg-2 hover:text-danger disabled:opacity-30 transition rounded"
                      title="Remove item"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-fg-2 mb-1">
                      Description / Particulars
                    </label>
                    <input
                      type="text"
                      required
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.id, 'description', e.target.value)
                      }
                      placeholder="e.g. Facility Support Services"
                      className="w-full px-3 py-2 rounded-lg bg-elevated/40 border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-fg-2 mb-1">
                        Qty / Hours
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.id, 'quantity', e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-elevated/40 border border-subtle text-fg text-sm font-mono text-right focus:outline-none focus:border-brand"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-fg-2 mb-1">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={item.rate}
                        onChange={(e) =>
                          updateItem(item.id, 'rate', e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg bg-elevated/40 border border-subtle text-fg text-sm font-mono text-right focus:outline-none focus:border-brand"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-subtle/50 text-xs">
                    <span className="text-muted">Calculated Amount:</span>
                    <span className="font-mono font-bold text-fg text-sm">
                      {formatMoney(lineAmount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View: Tabular format for screens >= 640px */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="bg-elevated/30 text-fg-2 uppercase tracking-wider border-b border-subtle">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Description / Particulars</th>
                  <th className="py-2.5 px-3 w-28 text-right">Qty / Hrs</th>
                  <th className="py-2.5 px-3 w-36 text-right">Unit Rate (₹)</th>
                  <th className="py-2.5 px-3 w-36 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-3 w-12 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {items.map((item, idx) => {
                  const q = Number(item.quantity) || 0;
                  const r = Number(item.rate) || 0;
                  const lineAmount = q * r;

                  return (
                    <tr key={item.id} className="hover:bg-hover/30 transition">
                      <td className="py-2 px-3 text-center font-mono text-muted">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          required
                          value={item.description}
                          onChange={(e) =>
                            updateItem(item.id, 'description', e.target.value)
                          }
                          placeholder="e.g. Operational & Support Services"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs focus:outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(item.id, 'quantity', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs font-mono text-right focus:outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          required
                          value={item.rate}
                          onChange={(e) =>
                            updateItem(item.id, 'rate', e.target.value)
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-surface border border-subtle text-fg text-xs font-mono text-right focus:outline-none focus:border-brand"
                        />
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-fg">
                        {formatMoney(lineAmount)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={items.length <= 1}
                          className="p-1 text-fg-2 hover:text-danger disabled:opacity-30 transition rounded"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-elevated/20 border-t border-subtle flex justify-start">
            <button
              type="button"
              onClick={addItem}
              className="text-xs text-brand hover:underline font-medium flex items-center gap-1 px-2 py-1"
            >
              <Plus size={13} /> Add another service item
            </button>
          </div>
        </div>

        {/* Row 5: Bank Details (Default & Read-only) & Automated Calculations (2-Column Grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Default Bank Details & Notes */}
          <div className="space-y-4">
            {/* Read-only Company Bank Details */}
            <div className="bg-elevated/40 border border-subtle rounded-xl p-4 text-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-subtle">
                <h4 className="font-semibold text-fg flex items-center gap-1.5">
                  <CreditCard size={14} className="text-brand" /> Bank & Remittance Details
                </h4>
                <span className="text-[10px] text-muted bg-surface px-2 py-0.5 rounded border border-subtle">
                  Default Bank Account
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    Bank Name
                  </span>
                  <p className="font-semibold text-fg mt-0.5">
                    {company?.bankName || 'Not configured'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    Account Number
                  </span>
                  <p className="font-mono font-semibold text-fg mt-0.5">
                    {company?.bankAccount || 'Not configured'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    IFSC Code
                  </span>
                  <p className="font-mono text-fg mt-0.5">
                    {company?.bankIfsc || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase tracking-wider block">
                    Branch Name
                  </span>
                  <p className="text-fg mt-0.5">
                    {(company as any)?.bankBranch || 'Main Branch'}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes & Terms */}
            <div className="bg-elevated/40 border border-subtle rounded-xl p-4 text-xs space-y-2">
              <label className="block font-semibold text-fg">
                Terms & Conditions / Remarks
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Payment terms, remittance reference, etc."
                className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-xs focus:outline-none focus:border-brand resize-none"
              />
            </div>
          </div>

          {/* Automated Calculations Summary Card */}
          <div className="bg-elevated/60 border border-subtle rounded-xl p-5 space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-subtle">
                <span className="text-xs font-bold text-fg uppercase tracking-wider">
                  Automated Calculation Summary
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-brand/10 text-brand">
                  Live Computed
                </span>
              </div>

              <div className="space-y-2.5 pt-3 text-xs">
                <div className="flex justify-between items-center text-muted">
                  <span>Subtotal ({items.length} items):</span>
                  <span className="font-mono font-medium text-fg">
                    {formatMoney(subtotal)}
                  </span>
                </div>

                {effectiveGst === 'cgst_sgst' && (
                  <>
                    <div className="flex justify-between items-center text-muted">
                      <span>Central GST (CGST @ 9%):</span>
                      <span className="font-mono text-fg">+{formatMoney(cgst)}</span>
                    </div>
                    <div className="flex justify-between items-center text-muted">
                      <span>State GST (SGST @ 9%):</span>
                      <span className="font-mono text-fg">+{formatMoney(sgst)}</span>
                    </div>
                  </>
                )}

                {effectiveGst === 'igst' && (
                  <div className="flex justify-between items-center text-muted">
                    <span>Integrated GST (IGST @ 18%):</span>
                    <span className="font-mono text-fg">+{formatMoney(igst)}</span>
                  </div>
                )}

                {effectiveGst === 'none' && (
                  <div className="flex justify-between items-center text-muted">
                    <span>GST (Tax Exempt / Nil):</span>
                    <span className="font-mono text-fg">₹0.00</span>
                  </div>
                )}

                <div className="border-t border-subtle pt-3 flex justify-between items-center">
                  <span className="text-sm font-bold text-fg">Grand Total (₹):</span>
                  <span className="text-lg font-bold font-mono text-brand">
                    {formatMoney(grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Default Read-Only Live Amount in Words */}
            <div className="p-3 bg-surface rounded-lg border border-subtle space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted uppercase tracking-wider block">
                  Amount in Words (Default INR):
                </span>
                <span className="text-[9px] text-muted font-medium bg-elevated px-1.5 py-0.5 rounded">
                  Automated
                </span>
              </div>
              <p className="text-xs font-semibold text-fg italic leading-relaxed">
                {amountInWords}
              </p>
            </div>
          </div>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="p-3 text-xs bg-danger-soft text-danger border border-danger/30 rounded-lg flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Bottom Actions Bar - Responsive */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-3 border-t border-subtle">
          <div className="text-xs text-muted text-center sm:text-left">
            Generates a standard General Invoice, automatically recorded in your ledger.
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={resetForm}
              className="text-xs w-full sm:w-auto"
            >
              Clear
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="text-xs gap-1.5 px-5 shadow-sm w-full sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Saving Invoice…
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Save & Generate General Invoice
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}