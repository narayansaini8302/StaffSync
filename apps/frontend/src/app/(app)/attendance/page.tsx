'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { AttendanceDay, AttendanceLog, Paginated } from '@/lib/types';
import { LogEditor } from '@/components/attendance/log-editor';

type Tab = 'daily' | 'logs';

function toLocalISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO() {
  return toLocalISODate(new Date());
}
function monthAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return toLocalISODate(d);
}

export default function AttendancePage() {
  const [tab, setTab] = useState<Tab>('daily');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Attendance</h1>
        <p className="text-sm text-fg-2 mt-1">
          Daily summary and raw scan logs
        </p>
      </div>

      <div className="flex gap-1 border-b border-subtle">
        <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>
          Daily Summary
        </TabButton>
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
          Raw Logs
        </TabButton>
      </div>

      {tab === 'daily' ? <DailyView /> : <LogsView />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
        active
          ? 'border-brand text-brand'
          : 'border-transparent text-fg-2 hover:text-fg'
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Daily view
// ---------------------------------------------------------------------------

function DailyView() {
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());

  const query = useQuery({
    queryKey: ['attendance-daily', page, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<Paginated<AttendanceDay>>(
        `/api/attendance/daily?${params}`,
      );
    },
  });

  const empQuery = useQuery({
    queryKey: ['employees-lookup'],
    queryFn: () =>
      api
        .get<Paginated<any>>('/api/employees?pageSize=100')
        .then((r) => r.data),
  });

  const empMap = new Map((empQuery.data ?? []).map((e: any) => [e.id, e]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-fg-2 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-fg-2 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div className="text-sm text-fg-2 ml-auto">
          <Calendar size={14} className="inline mr-1" />
          {query.data?.meta.total ?? 0} records
        </div>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">First In</th>
              <th className="px-4 py-3 font-medium">Last Out</th>
              <th className="px-4 py-3 font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
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
            {!query.isLoading && query.data?.data.length === 0 && (
              <tr>
                               <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No attendance records in this range
                </td>
              </tr>
            )}
            {query.data?.data.map((d) => {
              const emp = empMap.get(d.employeeId) as any;
              return (
                <tr
                  key={d.id}
                  className="border-b border-subtle last:border-0 hover:bg-hover"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {d.date.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {emp
                      ? `${emp.firstName} ${emp.lastName}`
                      : d.employeeId.slice(0, 8) + '...'}
                    {emp && (
                      <span className="ml-2 text-xs text-muted">
                        {emp.employeeCode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {d.firstIn
                      ? new Date(d.firstIn).toLocaleTimeString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {d.lastOut
                      ? new Date(d.lastOut).toLocaleTimeString()
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {formatMinutes(d.totalMinutes)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {query.data && query.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-fg-2">
            Page {query.data.meta.page} of {query.data.meta.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-subtle hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed text-fg-2"
            >
              <ChevronLeft size={14} className="inline" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= query.data.meta.totalPages}
              className="px-3 py-1.5 rounded-lg border border-subtle hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed text-fg-2"
            >
              Next <ChevronRight size={14} className="inline" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Raw logs view
// ---------------------------------------------------------------------------

function LogsView() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(monthAgoISO());
  const [to, setTo] = useState(todayISO());
  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null);

  const query = useQuery({
    queryKey: ['attendance-logs', page, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<Paginated<AttendanceLog>>(
        `/api/attendance/logs?${params}`,
      );
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance-logs'] });
    qc.invalidateQueries({ queryKey: ['attendance-daily'] });
  };

  const quickDelete = async (id: string) => {
    if (!confirm('Delete this log? The day will be recomputed.')) return;
    await api.delete(`/api/attendance/logs/${id}`);
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-fg-2 mb-1">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div>
          <label className="block text-xs text-fg-2 mb-1">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          />
        </div>
        <div className="text-sm text-fg-2 ml-auto">
          {query.data?.meta.total ?? 0} events
        </div>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
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
            {!query.isLoading && query.data?.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted">
                  No logs in this range
                </td>
              </tr>
            )}
            {query.data?.data.map((log) => (
              <tr
                key={log.id}
                className="border-b border-subtle last:border-0 hover:bg-hover"
              >
                <td className="px-4 py-3 font-mono text-xs text-fg-2">
                  {new Date(log.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-fg">
                  {log.employee
                    ? `${log.employee.firstName} ${log.employee.lastName}`
                    : log.employeeId.slice(0, 8) + '...'}
                  {log.employee && (
                    <span className="ml-2 text-xs text-muted">
                      {log.employee.employeeCode}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${
                      log.direction === 'IN'
                        ? 'bg-success-soft text-success border-success/30'
                        : 'bg-warning-soft text-warning border-warning/30'
                    }`}
                  >
                    {log.direction}
                  </span>
                </td>
                <td className="px-4 py-3 text-fg-2 text-xs">{log.source}</td>
                <td className="px-4 py-3 text-fg-2 font-mono text-xs">
                  {log.confidence != null
                    ? `${(log.confidence * 100).toFixed(1)}%`
                    : '-'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => setEditingLog(log)}
                      className="p-1.5 rounded hover:bg-hover text-fg-2 hover:text-brand"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => quickDelete(log.id)}
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

      {query.data && query.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-fg-2">
            Page {query.data.meta.page} of {query.data.meta.totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-subtle hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed text-fg-2"
            >
              <ChevronLeft size={14} className="inline" /> Prev
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= query.data.meta.totalPages}
              className="px-3 py-1.5 rounded-lg border border-subtle hover:bg-hover disabled:opacity-50 disabled:cursor-not-allowed text-fg-2"
            >
              Next <ChevronRight size={14} className="inline" />
            </button>
          </div>
        </div>
      )}

      <LogEditor
        log={editingLog}
        open={!!editingLog}
        onClose={() => setEditingLog(null)}
        onSaved={() => {
          setEditingLog(null);
          invalidate();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMinutes(mins: number) {
  if (!mins) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PRESENT: 'bg-success-soft text-success border-success/30',
    ABSENT: 'bg-danger-soft text-danger border-danger/30',
    HALF_DAY: 'bg-warning-soft text-warning border-warning/30',
    LEAVE: 'bg-brand-soft text-brand border-brand/30',
    HOLIDAY: 'bg-elevated text-fg-2 border-subtle',
  };
  const cls =
    styles[status] ?? 'bg-elevated text-muted border-subtle';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${cls}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}
