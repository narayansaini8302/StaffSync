'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  UserCheck,
  UserX,
  AlertCircle,
  Search,
  Check,
  Save,
  Zap,
  Briefcase,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  AttendanceDay,
  AttendanceLog,
  Paginated,
  DailySheetResponse,
  DailySheetEmployee,
  Client,
} from '@/lib/types';
import { LogEditor } from '@/components/attendance/log-editor';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/toast';

type Tab = 'sheet' | 'daily' | 'logs';

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
  const [tab, setTab] = useState<Tab>('sheet');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Manual Attendance</h1>
        <p className="text-sm text-fg-2 mt-1">
          Mark daily attendance with Full Day (8 Hours) and Half Day (4 Hours) standards
        </p>
      </div>

      <div className="flex gap-1 border-b border-subtle overflow-x-auto no-scrollbar pb-px">
        <TabButton active={tab === 'sheet'} onClick={() => setTab('sheet')}>
          <UserCheck size={16} className="inline mr-1.5" />
          Daily Attendance Sheet
        </TabButton>
        <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>
          <Calendar size={16} className="inline mr-1.5" />
          Attendance Records
        </TabButton>
        <TabButton active={tab === 'logs'} onClick={() => setTab('logs')}>
          <Clock size={16} className="inline mr-1.5" />
          Audit Logs
        </TabButton>
      </div>

      {tab === 'sheet' && <DailySheetView />}
      {tab === 'daily' && <DailyView />}
      {tab === 'logs' && <LogsView />}
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
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px flex items-center ${
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
// 1. Daily Attendance Sheet (Manual attendance system)
// ---------------------------------------------------------------------------

function DailySheetView() {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({});
  const [batchActionLoading, setBatchActionLoading] = useState(false);

  // Clients query for assignment popup
  const clientsQuery = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/api/clients'),
  });

  // Unassigned prompt popup state
  const [unassignedPrompt, setUnassignedPrompt] = useState<{
    employee: DailySheetEmployee;
    pendingStatus?: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
    pendingHours?: number;
    pendingNotes?: string;
  } | null>(null);
  const [assigningClientId, setAssigningClientId] = useState('');
  const [assigningLoading, setAssigningLoading] = useState(false);

  // Fetch daily attendance sheet
  const query = useQuery({
    queryKey: ['attendance-daily-sheet', selectedDate],
    queryFn: () =>
      api.get<DailySheetResponse>(
        `/api/attendance/daily-sheet?date=${selectedDate}`,
      ),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance-daily-sheet'] });
    qc.invalidateQueries({ queryKey: ['attendance-daily'] });
    qc.invalidateQueries({ queryKey: ['attendance-logs'] });
  };

  // Date navigation helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(toLocalISODate(d));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(toLocalISODate(d));
  };

  const handleToday = () => {
    setSelectedDate(todayISO());
  };

  // Mark single employee attendance
  const handleMarkAttendance = async (
    employeeId: string,
    status: 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE',
    customHours?: number,
    customNotes?: string,
  ) => {
    const emp = (query.data?.employees ?? []).find((e) => e.id === employeeId);
    if (emp && !emp.isAssigned) {
      setUnassignedPrompt({
        employee: emp,
        pendingStatus: status,
        pendingHours: customHours,
        pendingNotes: customNotes,
      });
      return;
    }

    setSavingRows((prev) => ({ ...prev, [employeeId]: true }));
    try {
      // Default: Full Day = 8h, Half Day = 4h, Absent = 0h, Leave = 8h (Paid leave)
      let hours = customHours;
      if (hours === undefined) {
        if (status === 'PRESENT' || status === 'LEAVE') hours = 8;
        else if (status === 'HALF_DAY') hours = 4;
        else hours = 0;
      }

      await api.post('/api/attendance/manual', {
        employeeId,
        date: selectedDate,
        status,
        hours,
        notes: customNotes,
      });

      const label =
        status === 'PRESENT'
          ? 'Full Day (8h)'
          : status === 'HALF_DAY'
          ? 'Half Day (4h)'
          : status === 'ABSENT'
          ? 'Absent (0h)'
          : 'Leave (Paid 8h)';

      toast.success('Attendance updated', `Marked as ${label}`);
      invalidate();
    } catch (e: any) {
      if (e?.error === 'EMPLOYEE_NOT_ASSIGNED_TO_CLIENT' || e?.message?.includes('assign')) {
        if (emp) {
          setUnassignedPrompt({
            employee: emp,
            pendingStatus: status,
            pendingHours: customHours,
            pendingNotes: customNotes,
          });
          return;
        }
      }
      toast.error('Failed to mark attendance', e?.message || 'Server error');
    } finally {
      setSavingRows((prev) => ({ ...prev, [employeeId]: false }));
    }
  };

  // Assign client and immediately apply pending attendance
  const handleAssignAndMark = async () => {
    if (!unassignedPrompt || !assigningClientId) return;
    setAssigningLoading(true);
    try {
      await api.post('/api/assignments', {
        clientId: assigningClientId,
        employeeId: unassignedPrompt.employee.id,
        startDate: selectedDate,
      });

      if (unassignedPrompt.pendingStatus) {
        let hours = unassignedPrompt.pendingHours;
        if (hours === undefined) {
          if (unassignedPrompt.pendingStatus === 'PRESENT' || unassignedPrompt.pendingStatus === 'LEAVE') hours = 8;
          else if (unassignedPrompt.pendingStatus === 'HALF_DAY') hours = 4;
          else hours = 0;
        }

        await api.post('/api/attendance/manual', {
          employeeId: unassignedPrompt.employee.id,
          date: selectedDate,
          status: unassignedPrompt.pendingStatus,
          hours,
          notes: unassignedPrompt.pendingNotes,
        });
      }

      const clientObj = (clientsQuery.data?.data ?? []).find((c) => c.id === assigningClientId);
      toast.success(
        'Assigned to Client',
        unassignedPrompt.pendingStatus
          ? `Assigned to ${clientObj?.name ?? 'client'} & marked attendance!`
          : `Assigned ${unassignedPrompt.employee.firstName} to ${clientObj?.name ?? 'client'}!`,
      );

      setUnassignedPrompt(null);
      setAssigningClientId('');
      invalidate();
      qc.invalidateQueries({ queryKey: ['assignments'] });
    } catch (err: any) {
      toast.error('Failed to assign client', err?.message || 'Server error');
    } finally {
      setAssigningLoading(false);
    }
  };

  // Batch action: Mark all active assigned staff
  const handleQuickAll = async (status: 'PRESENT' | 'HALF_DAY' | 'ABSENT') => {
    const statusLabel =
      status === 'PRESENT'
        ? 'Full Day (8 Hours)'
        : status === 'HALF_DAY'
        ? 'Half Day (4 Hours)'
        : 'Absent (0 Hours)';

    const assignedEmps = (query.data?.employees ?? []).filter((e) => e.isAssigned);
    const unassignedEmps = (query.data?.employees ?? []).filter((e) => !e.isAssigned);

    if (assignedEmps.length === 0) {
      toast.error(
        'No employees assigned to clients',
        'Please assign at least one employee to a client before marking attendance.',
      );
      return;
    }

    const message =
      unassignedEmps.length > 0
        ? `Are you sure you want to mark ${assignedEmps.length} assigned employees as "${statusLabel}" for ${selectedDate}?\n\nNote: ${unassignedEmps.length} unassigned employees will be skipped until assigned to a client.`
        : `Are you sure you want to mark ALL ${assignedEmps.length} active employees as "${statusLabel}" for ${selectedDate}?`;

    if (!confirm(message)) {
      return;
    }

    setBatchActionLoading(true);
    try {
      await api.post('/api/attendance/manual/quick-all', {
        date: selectedDate,
        status,
        notes: `Bulk quick mark: ${statusLabel}`,
      });
      toast.success(
        'Bulk attendance applied',
        unassignedEmps.length > 0
          ? `${assignedEmps.length} assigned employees marked (${unassignedEmps.length} unassigned skipped)`
          : `All employees marked as ${statusLabel}`,
      );
      invalidate();
    } catch (e: any) {
      toast.error('Failed to apply bulk attendance', e?.message || 'Server error');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const stats = query.data?.stats ?? {
    totalEmployees: 0,
    markedCount: 0,
    unmarkedCount: 0,
    presentCount: 0,
    halfDayCount: 0,
    absentCount: 0,
    leaveCount: 0,
    totalHours: 0,
  };

  const [attendanceSectionFilter, setAttendanceSectionFilter] = useState<'ALL' | 'UNMARKED' | 'MARKED'>('ALL');

  // Filter employees by search & category
  const searchedEmployees = (query.data?.employees ?? []).filter((emp) => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
    const code = emp.employeeCode.toLowerCase();
    const matchesSearch =
      !search ||
      fullName.includes(search.toLowerCase()) ||
      code.includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === 'ALL' || emp.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const unmarkedEmployees = searchedEmployees.filter((e) => !e.attendance);
  const markedEmployees = searchedEmployees.filter((e) => !!e.attendance);

  const filteredEmployees =
    attendanceSectionFilter === 'UNMARKED'
      ? unmarkedEmployees
      : attendanceSectionFilter === 'MARKED'
      ? markedEmployees
      : searchedEmployees;

  const categories = Array.from(
    new Set((query.data?.employees ?? []).map((e) => e.category)),
  );

  const formattedDate = new Date(selectedDate + 'T00:00:00').toLocaleDateString(
    undefined,
    {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    },
  );

  return (
    <div className="space-y-6">
      {/* Date Selector & Navigation Bar */}
      {/* Date Selector & Navigation Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 bg-surface border border-subtle p-3 sm:p-4 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevDay}
              className="p-2 rounded-lg border border-subtle hover:bg-hover text-fg-2 transition touch-manipulation"
              title="Previous Day"
            >
              <ChevronLeft size={18} />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-elevated border border-subtle text-fg text-xs sm:text-sm font-medium focus:outline-none focus:border-brand"
            />
            <button
              onClick={handleNextDay}
              className="p-2 rounded-lg border border-subtle hover:bg-hover text-fg-2 transition touch-manipulation"
              title="Next Day"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 sm:py-2 text-xs font-semibold rounded-lg bg-brand-soft text-brand hover:bg-brand/20 transition touch-manipulation"
          >
            Today
          </button>
          <span className="text-xs sm:text-sm font-medium text-fg block sm:inline w-full sm:w-auto sm:ml-1 mt-1 sm:mt-0 text-fg-2 sm:text-fg">
            {formattedDate}
          </span>
        </div>

        {/* Quick Batch Actions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-subtle">
          <span className="text-xs text-muted flex items-center gap-1 mr-1">
            <Zap size={14} className="text-brand shrink-0" /> Quick All:
          </span>
          <button
            onClick={() => handleQuickAll('PRESENT')}
            disabled={batchActionLoading || query.isLoading}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-success-soft text-success hover:bg-success/20 border border-success/30 transition disabled:opacity-50 touch-manipulation flex-1 sm:flex-none text-center"
            title="Mark All Active Employees Full Day (8 Hours)"
          >
            Full Day (8h)
          </button>
          <button
            onClick={() => handleQuickAll('HALF_DAY')}
            disabled={batchActionLoading || query.isLoading}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-warning-soft text-warning hover:bg-warning/20 border border-warning/30 transition disabled:opacity-50 touch-manipulation flex-1 sm:flex-none text-center"
            title="Mark All Active Employees Half Day (4 Hours)"
          >
            Half Day (4h)
          </button>
          <button
            onClick={() => handleQuickAll('ABSENT')}
            disabled={batchActionLoading || query.isLoading}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg bg-danger-soft text-danger hover:bg-danger/20 border border-danger/30 transition disabled:opacity-50 touch-manipulation flex-1 sm:flex-none text-center"
            title="Mark All Active Employees Absent (0 Hours)"
          >
            Absent (0h)
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="Total Active Staff"
          value={stats.totalEmployees}
          color="neutral"
          onClick={() => setAttendanceSectionFilter('ALL')}
        />
        <StatCard
          label="Full Day (8h)"
          value={stats.presentCount}
          color="success"
          sub={`${stats.presentCount * 8}h`}
          onClick={() => setAttendanceSectionFilter('MARKED')}
        />
        <StatCard
          label="Half Day (4h)"
          value={stats.halfDayCount}
          color="warning"
          sub={`${stats.halfDayCount * 4}h`}
          onClick={() => setAttendanceSectionFilter('MARKED')}
        />
        <StatCard
          label="Absent (0h)"
          value={stats.absentCount}
          color="danger"
          onClick={() => setAttendanceSectionFilter('MARKED')}
        />
        <StatCard
          label="Unmarked"
          value={stats.unmarkedCount}
          color={stats.unmarkedCount > 0 ? 'warning' : 'neutral'}
          onClick={() => setAttendanceSectionFilter('UNMARKED')}
        />
        <StatCard
          label="Total Hours Worked"
          value={`${stats.totalHours.toFixed(1)}h`}
          color="brand"
        />
      </div>

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            placeholder="Search employee name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-surface border border-subtle text-fg placeholder:text-muted focus:outline-none focus:border-brand"
          />
        </div>

        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
        )}

        <div className="text-xs text-muted ml-auto">
          Showing {filteredEmployees.length} of {stats.totalEmployees} employees
        </div>
      </div>

      {/* Marked / Unmarked Section Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-surface border border-subtle rounded-xl shadow-sm overflow-x-auto w-full sm:w-auto">
        <button
          onClick={() => setAttendanceSectionFilter('ALL')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
            attendanceSectionFilter === 'ALL'
              ? 'bg-elevated text-fg shadow-sm border border-subtle'
              : 'text-fg-2 hover:text-fg hover:bg-hover'
          }`}
        >
          <span>All Staff</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-subtle/50 text-fg-2 font-mono">
            {stats.totalEmployees}
          </span>
        </button>

        <button
          onClick={() => setAttendanceSectionFilter('UNMARKED')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
            attendanceSectionFilter === 'UNMARKED'
              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-sm border border-amber-500/30 font-bold'
              : 'text-fg-2 hover:text-fg hover:bg-hover'
          }`}
        >
          <span className="relative flex h-2 w-2">
            {stats.unmarkedCount > 0 && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.unmarkedCount > 0 ? 'bg-amber-500' : 'bg-muted'}`}></span>
          </span>
          <span>Unmarked (Pending)</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono ${
            stats.unmarkedCount > 0
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold'
              : 'bg-subtle/50 text-fg-2'
          }`}>
            {stats.unmarkedCount}
          </span>
        </button>

        <button
          onClick={() => setAttendanceSectionFilter('MARKED')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${
            attendanceSectionFilter === 'MARKED'
              ? 'bg-success-soft text-success shadow-sm border border-success/30 font-bold'
              : 'text-fg-2 hover:text-fg hover:bg-hover'
          }`}
        >
          <CheckCircle2 size={13} className="text-success" />
          <span>Marked Today</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-success-soft text-success font-mono font-bold">
            {stats.markedCount}
          </span>
        </button>
      </div>

      {/* Helper functions for mobile card and desktop table row */}
      {(() => {
        const renderMobileCard = (emp: DailySheetEmployee) => {
          const currentStatus = emp.attendance?.status ?? null;
          const hours = emp.attendance ? emp.attendance.hours : null;
          const isSaving = savingRows[emp.id] || false;

          return (
            <div key={emp.id} className="p-3.5 space-y-3 hover:bg-hover/40 transition-colors">
              {/* Top row: Employee details & Status badge */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-elevated border border-subtle flex items-center justify-center font-semibold text-xs text-fg-2 shrink-0">
                    {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-fg truncate">
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted flex-wrap">
                      <span className="font-mono text-fg-2">{emp.employeeCode}</span>
                      <span>•</span>
                      <span className="px-1.5 py-0.5 rounded bg-elevated border border-subtle text-[11px] text-fg-2">
                        {emp.category.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  {isSaving ? (
                    <span className="inline-flex items-center text-xs text-muted gap-1">
                      <Loader2 size={12} className="animate-spin text-brand" /> Saving...
                    </span>
                  ) : currentStatus ? (
                    <StatusBadge status={currentStatus} />
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium">
                      Unmarked
                    </span>
                  )}
                  {hours !== null && (
                    <span className="text-xs font-mono text-fg-2 font-medium">
                      {hours.toFixed(1)} hrs
                    </span>
                  )}
                </div>
              </div>

              {/* Client badge or Assign Client button */}
              {emp.isAssigned ? (
                <div className="flex items-center gap-1 text-[11px] font-medium text-brand bg-brand-soft px-2 py-1 rounded-md border border-brand/20 w-fit">
                  <Briefcase size={12} /> {emp.assignedClient?.name}
                </div>
              ) : (
                <button
                  onClick={() => setUnassignedPrompt({ employee: emp })}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 p-2 rounded-lg border border-amber-500/30 transition text-center"
                >
                  <AlertCircle size={13} /> Click to assign client before marking
                </button>
              )}

              {/* Mobile Attendance Dropdown Menu */}
              <div className="pt-0.5">
                <div className="relative">
                  <select
                    value={currentStatus || ''}
                    onChange={(e) => {
                      const val = e.target.value as 'PRESENT' | 'HALF_DAY' | 'ABSENT' | 'LEAVE';
                      if (!val) return;
                      const targetHours = val === 'PRESENT' || val === 'LEAVE' ? 8 : val === 'HALF_DAY' ? 4 : 0;
                      handleMarkAttendance(emp.id, val, targetHours);
                    }}
                    disabled={isSaving}
                    className={`w-full py-2.5 pl-3.5 pr-10 text-xs sm:text-sm font-semibold rounded-lg border appearance-none transition cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40 ${
                      currentStatus === 'PRESENT'
                        ? 'bg-success-soft text-success border-success/40'
                        : currentStatus === 'HALF_DAY'
                        ? 'bg-warning-soft text-warning border-warning/40'
                        : currentStatus === 'ABSENT'
                        ? 'bg-danger-soft text-danger border-danger/40'
                        : currentStatus === 'LEAVE'
                        ? 'bg-brand-soft text-brand border-brand/40'
                        : 'bg-elevated text-fg border-subtle hover:bg-hover'
                    }`}
                  >
                    <option value="" disabled>
                      Select Attendance (Present, Absent, Leave)...
                    </option>
                    <option value="PRESENT">✓ Present — Full Day (8h)</option>
                    <option value="HALF_DAY">◷ Half Day (4h)</option>
                    <option value="ABSENT">✕ Absent (0h — Deduct)</option>
                    <option value="LEAVE">★ Leave (Paid 8h — No Deduct)</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-fg-2">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>
            </div>
          );
        };

        const renderTableRow = (emp: DailySheetEmployee) => {
          const currentStatus = emp.attendance?.status ?? null;
          const hours = emp.attendance ? emp.attendance.hours : null;
          const isSaving = savingRows[emp.id] || false;

          return (
            <tr key={emp.id} className="hover:bg-hover transition-colors">
              {/* Employee Profile */}
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-elevated border border-subtle flex items-center justify-center font-semibold text-xs text-fg-2 shrink-0">
                    {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-medium text-fg flex items-center gap-2">
                      <span>{emp.firstName} {emp.lastName}</span>
                      {emp.isAssigned ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand bg-brand-soft px-1.5 py-0.5 rounded border border-brand/20">
                          <Briefcase size={10} /> {emp.assignedClient?.name}
                        </span>
                      ) : (
                        <button
                          onClick={() => setUnassignedPrompt({ employee: emp })}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 transition text-left cursor-pointer"
                          title="Click to assign to a client"
                        >
                          <AlertCircle size={10} /> Assign Client
                        </button>
                      )}
                    </div>
                    <div className="text-xs font-mono text-muted">{emp.employeeCode}</div>
                  </div>
                </div>
              </td>

              {/* Role / Category */}
              <td className="px-4 py-3.5 text-xs text-fg-2">
                <span className="px-2 py-0.5 rounded bg-elevated border border-subtle">
                  {emp.category.replace('_', ' ')}
                </span>
              </td>

              {/* Interactive Status Selector Segmented Buttons */}
              <td className="px-4 py-3.5">
                <div className="inline-flex rounded-lg p-1 bg-elevated border border-subtle gap-1">
                  <button
                    onClick={() => handleMarkAttendance(emp.id, 'PRESENT', 8)}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                      currentStatus === 'PRESENT'
                        ? 'bg-success text-white font-semibold shadow-sm'
                        : 'text-fg-2 hover:text-fg hover:bg-hover'
                    }`}
                  >
                    <CheckCircle2 size={13} /> Full Day (8h)
                  </button>
                  <button
                    onClick={() => handleMarkAttendance(emp.id, 'HALF_DAY', 4)}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                      currentStatus === 'HALF_DAY'
                        ? 'bg-warning text-white font-semibold shadow-sm'
                        : 'text-fg-2 hover:text-fg hover:bg-hover'
                    }`}
                  >
                    <Clock size={13} /> Half Day (4h)
                  </button>
                  <button
                    onClick={() => handleMarkAttendance(emp.id, 'ABSENT', 0)}
                    disabled={isSaving}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1.5 ${
                      currentStatus === 'ABSENT'
                        ? 'bg-danger text-white font-semibold shadow-sm'
                        : 'text-fg-2 hover:text-fg hover:bg-hover'
                    }`}
                  >
                    <UserX size={13} /> Absent (0h)
                  </button>
                  <button
                    onClick={() => handleMarkAttendance(emp.id, 'LEAVE', 8)}
                    disabled={isSaving}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition flex items-center gap-1 ${
                      currentStatus === 'LEAVE'
                        ? 'bg-brand text-white font-semibold shadow-sm'
                        : 'text-fg-2 hover:text-fg hover:bg-hover'
                    }`}
                    title="Approved Paid Leave (8h)"
                  >
                    Leave (Paid)
                  </button>
                </div>
              </td>

              {/* Hours column */}
              <td className="px-4 py-3.5 text-center font-mono text-xs">
                {hours !== null ? (
                  <span
                    className={`px-2 py-1 rounded font-semibold ${
                      hours === 8
                        ? 'bg-success-soft text-success'
                        : hours === 4
                        ? 'bg-warning-soft text-warning'
                        : hours > 0
                        ? 'bg-brand-soft text-brand'
                        : 'text-muted'
                    }`}
                  >
                    {hours.toFixed(1)} hrs
                  </span>
                ) : (
                  <span className="text-muted italic">-</span>
                )}
              </td>

              {/* Status Badge */}
              <td className="px-4 py-3.5 text-right pr-6">
                {isSaving ? (
                  <span className="inline-flex items-center text-xs text-muted gap-1">
                    <Loader2 size={12} className="animate-spin text-brand" /> Saving...
                  </span>
                ) : currentStatus ? (
                  <StatusBadge status={currentStatus} />
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-medium">
                    Unmarked
                  </span>
                )}
              </td>
            </tr>
          );
        };

        return (
          <>
            {/* ========================================================================= */}
            {/* Mobile Responsive Cards (No Horizontal Scrolling, Touch-Friendly Dropdown) */}
            {/* ========================================================================= */}
            <div className="block md:hidden bg-surface border border-subtle rounded-xl divide-y divide-subtle shadow-sm overflow-hidden">
              {query.isLoading && (
                <div className="p-8 text-center text-muted">
                  <Loader2 size={24} className="inline animate-spin text-brand mr-2" />
                  Loading attendance roster...
                </div>
              )}
              {!query.isLoading && filteredEmployees.length === 0 && (
                <div className="p-8 text-center text-muted text-sm">
                  No active employees found matching the filters.
                </div>
              )}

              {/* Section 1: Unmarked Staff (shown if viewing ALL or UNMARKED) */}
              {(attendanceSectionFilter === 'ALL' || attendanceSectionFilter === 'UNMARKED') &&
                unmarkedEmployees.length > 0 && (
                  <div>
                    {attendanceSectionFilter === 'ALL' && (
                      <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-amber-600 dark:text-amber-400">
                        <span className="flex items-center gap-1.5">
                          <AlertCircle size={14} /> Unmarked Staff ({unmarkedEmployees.length}) — Pending
                        </span>
                        <span className="text-[11px] font-normal text-muted">Tap to mark</span>
                      </div>
                    )}
                    <div className="divide-y divide-subtle">
                      {unmarkedEmployees.map(renderMobileCard)}
                    </div>
                  </div>
                )}

              {/* Section 2: Marked Staff (shown if viewing ALL or MARKED) */}
              {(attendanceSectionFilter === 'ALL' || attendanceSectionFilter === 'MARKED') &&
                markedEmployees.length > 0 && (
                  <div>
                    {attendanceSectionFilter === 'ALL' && (
                      <div className="bg-success-soft/50 border-y border-success/20 px-3.5 py-2 flex items-center justify-between text-xs font-bold text-success">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={14} /> Marked Staff Today ({markedEmployees.length})
                        </span>
                        <span className="text-[11px] font-normal text-muted">Completed</span>
                      </div>
                    )}
                    <div className="divide-y divide-subtle">
                      {markedEmployees.map(renderMobileCard)}
                    </div>
                  </div>
                )}
            </div>

            {/* ========================================================================= */}
            {/* Desktop Roster Table (>= md screens)                                      */}
            {/* ========================================================================= */}
            <div className="hidden md:block bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-elevated/60 border-b border-subtle">
                    <tr className="text-fg-2 text-left">
                      <th className="px-4 py-3.5 font-medium">Employee</th>
                      <th className="px-4 py-3.5 font-medium">Category</th>
                      <th className="px-4 py-3.5 font-medium min-w-[340px]">
                        Attendance Status (Full 8h / Half 4h / Absent 0h)
                      </th>
                      <th className="px-4 py-3.5 font-medium w-28 text-center">Hours</th>
                      <th className="px-4 py-3.5 font-medium text-right pr-6">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {query.isLoading && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted">
                          <Loader2 size={24} className="inline animate-spin text-brand mr-2" />
                          Loading attendance roster...
                        </td>
                      </tr>
                    )}
                    {!query.isLoading && filteredEmployees.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-muted">
                          No active employees found matching the filters.
                        </td>
                      </tr>
                    )}

                    {/* Desktop Section 1: Unmarked Staff */}
                    {(attendanceSectionFilter === 'ALL' || attendanceSectionFilter === 'UNMARKED') &&
                      unmarkedEmployees.length > 0 && (
                        <>
                          {attendanceSectionFilter === 'ALL' && (
                            <tr className="bg-amber-500/10 border-b border-amber-500/20">
                              <td colSpan={5} className="px-4 py-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <AlertCircle size={14} /> Unmarked Staff ({unmarkedEmployees.length}) — Pending Attendance
                                  </span>
                                  <span className="font-normal text-muted text-[11px]">Action required for {selectedDate}</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {unmarkedEmployees.map(renderTableRow)}
                        </>
                      )}

                    {/* Desktop Section 2: Marked Staff */}
                    {(attendanceSectionFilter === 'ALL' || attendanceSectionFilter === 'MARKED') &&
                      markedEmployees.length > 0 && (
                        <>
                          {attendanceSectionFilter === 'ALL' && (
                            <tr className="bg-success-soft/40 border-y border-success/20">
                              <td colSpan={5} className="px-4 py-2 text-xs font-bold text-success">
                                <div className="flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 size={14} /> Marked Staff Today ({markedEmployees.length}) — Attendance Recorded
                                  </span>
                                  <span className="font-normal text-muted text-[11px]">Completed</span>
                                </div>
                              </td>
                            </tr>
                          )}
                          {markedEmployees.map(renderTableRow)}
                        </>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* "Please Assign to a Client" Popup Dialog */}
      <Modal
        open={!!unassignedPrompt}
        onClose={() => {
          setUnassignedPrompt(null);
          setAssigningClientId('');
        }}
        title="Please Assign to a Client"
      >
        {unassignedPrompt && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertCircle size={20} className="shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm">
                <p className="font-semibold text-fg">
                  {unassignedPrompt.employee.firstName} {unassignedPrompt.employee.lastName} ({unassignedPrompt.employee.employeeCode}) is not assigned to any client.
                </p>
                <p className="mt-1 text-fg-2">
                  In StaffSync, attendance can only be marked for staff who are assigned to an active client contract. Please select a client to assign this employee.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-fg">
                Select Client <span className="text-danger">*</span>
              </label>
              <select
                value={assigningClientId}
                onChange={(e) => setAssigningClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
              >
                <option value="">-- Choose a Client --</option>
                {(clientsQuery.data?.data ?? []).map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.gstin ? `(${client.gstin})` : ''}
                  </option>
                ))}
              </select>
              {(clientsQuery.data?.data ?? []).length === 0 && (
                <p className="text-xs text-amber-500 mt-1">
                  No clients found yet. Please create a client in the Clients tab first.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
              <Button
                variant="secondary"
                onClick={() => {
                  setUnassignedPrompt(null);
                  setAssigningClientId('');
                }}
                disabled={assigningLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAssignAndMark}
                disabled={!assigningClientId || assigningLoading}
                className="bg-brand text-white hover:bg-brand/90"
              >
                {assigningLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Assigning...
                  </>
                ) : unassignedPrompt.pendingStatus ? (
                  `Assign & Mark ${
                    unassignedPrompt.pendingStatus === 'PRESENT'
                      ? 'Full Day (8h)'
                      : unassignedPrompt.pendingStatus === 'HALF_DAY'
                      ? 'Half Day (4h)'
                      : unassignedPrompt.pendingStatus === 'ABSENT'
                      ? 'Absent'
                      : 'Leave'
                  }`
                ) : (
                  'Assign Client'
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: 'success' | 'warning' | 'danger' | 'brand' | 'neutral';
  onClick?: () => void;
}) {
  const borderMap = {
    success: 'border-success/30 bg-success-soft/20 text-success',
    warning: 'border-warning/30 bg-warning-soft/20 text-warning',
    danger: 'border-danger/30 bg-danger-soft/20 text-danger',
    brand: 'border-brand/30 bg-brand-soft/20 text-brand',
    neutral: 'border-subtle bg-surface text-fg',
  };

  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-xl border transition-all ${borderMap[color]} ${
        onClick ? 'cursor-pointer hover:border-brand/60 active:scale-[0.98]' : ''
      }`}
    >
      <div className="text-xs text-fg-2 font-medium">{label}</div>
      <div className="text-xl font-bold mt-1 flex items-baseline gap-1.5">
        <span>{value}</span>
        {sub && <span className="text-xs text-muted font-normal">({sub})</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Attendance Records (History View)
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
      <div className="flex flex-wrap gap-2.5 sm:gap-3 items-end justify-between">
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-fg-2 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-surface border border-subtle text-fg text-xs sm:text-sm focus:outline-none focus:border-brand w-36 sm:w-auto"
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
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-surface border border-subtle text-fg text-xs sm:text-sm focus:outline-none focus:border-brand w-36 sm:w-auto"
            />
          </div>
        </div>
        <div className="text-xs sm:text-sm text-fg-2">
          <Calendar size={14} className="inline mr-1" />
          {query.data?.meta.total ?? 0} records
        </div>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
        {/* Mobile Attendance Records Cards (< md screens) */}
        <div className="md:hidden divide-y divide-subtle">
          {query.isLoading && (
            <div className="p-8 text-center text-muted">
              <Loader2 size={20} className="inline animate-spin text-brand mr-2" />
              Loading attendance records...
            </div>
          )}
          {!query.isLoading && query.data?.data.length === 0 && (
            <div className="p-8 text-center text-muted">
              No attendance records in this range
            </div>
          )}
          {query.data?.data.map((d) => {
            const emp = empMap.get(d.employeeId) as any;
            return (
              <div key={d.id} className="p-3.5 space-y-2 hover:bg-hover/40 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-fg text-sm truncate">
                      {emp ? `${emp.firstName} ${emp.lastName}` : d.employeeId.slice(0, 8) + '...'}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                      <span className="font-mono">{d.date.slice(0, 10)}</span>
                      {emp && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{emp.employeeCode}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <StatusBadge status={d.status} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-subtle/40">
                  <div>
                    <span className="text-[10px] text-muted uppercase font-semibold block">In</span>
                    <span className="font-mono text-fg font-medium">
                      {d.firstIn ? new Date(d.firstIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase font-semibold block">Out</span>
                    <span className="font-mono text-fg font-medium">
                      {d.lastOut ? new Date(d.lastOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted uppercase font-semibold block">Total</span>
                    <span className="font-medium text-brand font-mono">
                      {formatMinutes(d.totalMinutes)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Table View (>= md screens) */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[620px]">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">First In</th>
              <th className="px-4 py-3 font-medium">Last Out</th>
              <th className="px-4 py-3 font-medium">Total Hours</th>
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
                      <span className="ml-2 text-xs text-muted font-mono">
                        {emp.employeeCode}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {d.firstIn
                      ? new Date(d.firstIn).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {d.lastOut
                      ? new Date(d.lastOut).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '-'}
                  </td>
                  <td className="px-4 py-3 text-fg font-medium">
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
// 3. Raw Logs View (Audit logs)
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
    qc.invalidateQueries({ queryKey: ['attendance-daily-sheet'] });
  };

  const quickDelete = async (id: string) => {
    if (!confirm('Delete this audit log? The daily total will be recomputed.'))
      return;
    await api.delete(`/api/attendance/logs/${id}`);
    invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2.5 sm:gap-3 items-end justify-between">
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="block text-xs text-fg-2 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-surface border border-subtle text-fg text-xs sm:text-sm focus:outline-none focus:border-brand w-36 sm:w-auto"
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
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-surface border border-subtle text-fg text-xs sm:text-sm focus:outline-none focus:border-brand w-36 sm:w-auto"
            />
          </div>
        </div>
        <div className="text-xs sm:text-sm text-fg-2">
          {query.data?.meta.total ?? 0} events
        </div>
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden shadow-sm">
        {/* Mobile Audit Log Cards (< md screens) */}
        <div className="md:hidden divide-y divide-subtle">
          {query.isLoading && (
            <div className="p-8 text-center text-muted">
              <Loader2 size={20} className="inline animate-spin text-brand mr-2" />
              Loading audit logs...
            </div>
          )}
          {!query.isLoading && query.data?.data.length === 0 && (
            <div className="p-8 text-center text-muted">
              No logs in this range
            </div>
          )}
          {query.data?.data.map((log) => (
            <div key={log.id} className="p-3.5 space-y-2 hover:bg-hover/40 transition">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-fg text-sm truncate">
                    {log.employee
                      ? `${log.employee.firstName} ${log.employee.lastName}`
                      : log.employeeId.slice(0, 8) + '...'}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted">
                    <span className="font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                    {log.employee && (
                      <>
                        <span>•</span>
                        <span className="font-mono">{log.employee.employeeCode}</span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      log.direction === 'IN'
                        ? 'bg-success-soft text-success border-success/30'
                        : 'bg-warning-soft text-warning border-warning/30'
                    }`}
                  >
                    {log.direction}
                  </span>
                </div>
              </div>

              {/* Source & Notes */}
              <div className="flex items-center justify-between gap-2 text-xs pt-1 border-t border-subtle/40">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-elevated text-fg-2 font-mono text-[11px] border border-subtle">
                    {log.source}
                  </span>
                  {log.notes && (
                    <span className="text-muted text-[11px] truncate max-w-[150px]">
                      {log.notes}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingLog(log)}
                    className="p-1.5 rounded-lg bg-elevated hover:bg-hover text-fg-2 hover:text-brand transition"
                    title="Edit log"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => quickDelete(log.id)}
                    className="p-1.5 rounded-lg bg-elevated hover:bg-danger-soft text-fg-2 hover:text-danger transition"
                    title="Delete log"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View (>= md screens) */}
        <div className="hidden md:block overflow-x-auto w-full">
          <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Direction</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Notes</th>
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
                    <span className="ml-2 text-xs text-muted font-mono">
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
                <td className="px-4 py-3 text-fg-2 text-xs font-mono">{log.source}</td>
                <td className="px-4 py-3 text-fg-2 text-xs">
                  {log.notes || '-'}
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
  if (!mins) return '0 hrs';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m === 0) return `${h} hrs`;
  return `${h}h ${m}m`;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { label: string; cls: string }> = {
    PRESENT: {
      label: 'Full Day (8h)',
      cls: 'bg-success-soft text-success border-success/30 font-semibold',
    },
    HALF_DAY: {
      label: 'Half Day (4h)',
      cls: 'bg-warning-soft text-warning border-warning/30 font-semibold',
    },
    ABSENT: {
      label: 'Absent',
      cls: 'bg-danger-soft text-danger border-danger/30 font-semibold',
    },
    LEAVE: {
      label: 'Leave (Paid)',
      cls: 'bg-brand-soft text-brand border-brand/30 font-semibold',
    },
    HOLIDAY: {
      label: 'Holiday',
      cls: 'bg-elevated text-fg-2 border-subtle',
    },
  };

  const item = styles[status] ?? {
    label: status.replace('_', ' '),
    cls: 'bg-elevated text-muted border-subtle',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${item.cls}`}
    >
      {item.label}
    </span>
  );
}
