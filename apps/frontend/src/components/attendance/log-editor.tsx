'use client';

import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { AttendanceLog } from '@/lib/types';

export function LogEditor({
  log,
  open,
  onClose,
  onSaved,
}: {
  log: AttendanceLog | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [timestamp, setTimestamp] = useState('');
  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLog, setLastLog] = useState<AttendanceLog | null>(null);

  if (log !== lastLog && open) {
    setLastLog(log);
    if (log) {
      setTimestamp(toLocalInput(log.timestamp));
      setDirection(log.direction);
      setError(null);
    }
  }

  const save = async () => {
    if (!log) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/attendance/logs/${log.id}`, {
        timestamp: new Date(timestamp).toISOString(),
        direction,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!log) return;
    if (!confirm('Delete this log? The day will be recomputed.')) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`/api/attendance/logs/${log.id}`);
      onSaved();
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit attendance log">
      {!log ? null : (
        <div className="space-y-4">
          <div className="text-xs text-fg-2">
            {log.employee
              ? `${log.employee.firstName} ${log.employee.lastName} (${log.employee.employeeCode})`
              : log.employeeId}
          </div>

          <div>
            <label className="block text-xs text-fg-2 mb-1">Timestamp</label>
            <input
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            />
          </div>

          <div>
            <label className="block text-xs text-fg-2 mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'IN' | 'OUT')}
              className="w-full px-3 py-2 rounded-lg bg-app border border-subtle text-fg text-sm focus:outline-none focus:border-brand"
            >
              <option value="IN">IN</option>
              <option value="OUT">OUT</option>
            </select>
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 pt-2">
            <Button variant="danger" onClick={remove} disabled={saving} className="w-full sm:w-auto">
              Delete
            </Button>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="secondary" onClick={onClose} disabled={saving} className="flex-1 sm:flex-none">
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} className="flex-1 sm:flex-none">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
