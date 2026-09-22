'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Play,
  Users,
  TrendingUp,
  FileText,
  Download,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { PayrollRun, Payslip } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

function monthLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
function formatMoney(v: string | number, currency = 'INR') {
  const n = typeof v === 'string' ? Number(v) : v;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PayrollPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [viewingRun, setViewingRun] = useState<PayrollRun | null>(null);

  const runsQuery = useQuery({
    queryKey: ['payroll-runs'],
    queryFn: () => api.get<{ data: PayrollRun[] }>('/api/payroll/runs'),
  });

  const runs = runsQuery.data?.data ?? [];
  const lastRun = runs[0];
  const totalPaid = runs.reduce((sum, r) => sum + Number(r.totalNet ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg">Payroll</h1>
          <p className="text-sm text-fg-2 mt-1">
            Monthly salary runs and payslips
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Play size={16} />
          Run Payroll
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Total Runs" value={String(runs.length)} icon={FileText} />
        <Stat
          label="Last Run Employees"
          value={lastRun ? String(lastRun.totalEmployees) : '-'}
          icon={Users}
        />
        <Stat
          label="Total Paid Out"
          value={formatMoney(totalPaid)}
          icon={TrendingUp}
          highlight
        />
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Period</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Employees</th>
              <th className="px-4 py-3 font-medium text-right">Total Gross</th>
              <th className="px-4 py-3 font-medium text-right">Total Net</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {runsQuery.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}
            {!runsQuery.isLoading && runs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No payroll runs yet. Click "Run Payroll" to generate one.
                </td>
              </tr>
            )}
            {runs.map((run) => (
              <tr
                key={run.id}
                className="border-b border-subtle last:border-0 hover:bg-hover"
              >
                <td className="px-4 py-3 text-fg">{monthLabel(run.periodStart)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={run.status} />
                </td>
                <td className="px-4 py-3 text-fg">{run.totalEmployees}</td>
                <td className="px-4 py-3 text-right font-mono text-fg">
                  {formatMoney(run.totalGross)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-success">
                  {formatMoney(run.totalNet)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setViewingRun(run)}
                  >
                    View payslips
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateRunModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['payroll-runs'] });
        }}
      />

      <RunDetailsModal run={viewingRun} onClose={() => setViewingRun(null)} />
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: any;
  highlight?: boolean;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-fg-2">{label}</div>
        <Icon size={16} className="text-muted" />
      </div>
      <div
        className={`text-2xl font-semibold mt-2 ${
          highlight ? 'text-success' : 'text-fg'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-success-soft text-success border-success/30',
    DRAFT: 'bg-warning-soft text-warning border-warning/30',
    FAILED: 'bg-danger-soft text-danger border-danger/30',
  };
  const cls =
    styles[status] ?? 'bg-elevated text-muted border-subtle';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${cls}`}
    >
      {status === 'COMPLETED' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
      {status}
    </span>
  );
}

function CreateRunModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [periodStart, setPeriodStart] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  });
  const [companyName, setCompanyName] = useState('Acme Pvt Ltd');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/payroll/runs', { periodStart, companyName });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Payroll run failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Run Payroll">
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-fg-2">
          This will compute salaries for all active employees with attendance in
          the period, generate PDFs, and email them.
        </div>

        <div>
          <label className="block text-xs text-fg-2 mb-1">
            Any date in the target month
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
            Company name (for payslip)
          </label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
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
            disabled={busy}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            {busy ? 'Generating...' : 'Run Payroll'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RunDetailsModal({
  run,
  onClose,
}: {
  run: PayrollRun | null;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ['payroll-run', run?.id],
    enabled: !!run,
    queryFn: () =>
      api.get<PayrollRun & { payslips: Payslip[] }>(
        `/api/payroll/runs/${run!.id}`,
      ),
  });

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const downloadPdf = async (slip: Payslip) => {
    setDownloadingId(slip.id);
    try {
      const blob = await api.downloadBlob(
        `/api/payroll/payslips/${slip.id}/pdf`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payslip-${slip.employeeCode}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Download failed');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Modal
      open={!!run}
      onClose={onClose}
      title={run ? `Payroll - ${monthLabel(run.periodStart)}` : ''}
      maxWidth="max-w-4xl"
    >
      {!run ? null : (
        <div className="space-y-4">
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-fg-2">Employees: </span>
              <span className="font-mono text-fg">{run.totalEmployees}</span>
            </div>
            <div>
              <span className="text-fg-2">Total Gross: </span>
              <span className="font-mono text-fg">
                {formatMoney(run.totalGross)}
              </span>
            </div>
            <div>
              <span className="text-fg-2">Total Net: </span>
              <span className="font-mono text-success">
                {formatMoney(run.totalNet)}
              </span>
            </div>
          </div>

          <div className="border border-subtle rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-elevated/50 border-b border-subtle">
                <tr className="text-fg-2 text-left">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium text-right">Days</th>
                  <th className="px-3 py-2 font-medium text-right">Gross</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Deductions
                  </th>
                  <th className="px-3 py-2 font-medium text-right">Net</th>
                  <th className="px-3 py-2 font-medium text-right">PDF</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading && (
                  <tr>
                                      <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-muted"
                    >
                      <Loader2 size={18} className="inline animate-spin" />{' '}
                      Loading...
                    </td>
                  </tr>
                )}
                {query.data?.payslips.map((slip) => (
                  <tr
                    key={slip.id}
                    className="border-b border-subtle last:border-0"
                  >
                    <td className="px-3 py-2 text-fg">
                      {slip.employeeName}
                      <span className="ml-2 text-xs text-muted">
                        {slip.employeeCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-fg">
                      {Number(slip.presentDays)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-fg">
                      {formatMoney(slip.grossPay)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-danger">
                      -{formatMoney(slip.totalDeductions)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-success">
                      {formatMoney(slip.netPay)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => downloadPdf(slip)}
                        disabled={downloadingId === slip.id}
                        className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand disabled:opacity-50"
                        title="Download PDF"
                      >
                        {downloadingId === slip.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Download size={14} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
