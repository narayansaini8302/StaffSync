'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Camera, CheckCircle2, XCircle, UserCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Employee, Paginated, FaceEmbeddingRow, EnrollFaceResponse } from '@/lib/types';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

export default function FacePage() {
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState<Employee | null>(null);

  const empQuery = useQuery({
    queryKey: ['employees-face-list'],
    queryFn: () =>
      api.get<Paginated<Employee>>('/api/employees?pageSize=100&isActive=true'),
  });

  const enrollQuery = useQuery({
    queryKey: ['enrolled-faces'],
    queryFn: () => api.get<{ data: FaceEmbeddingRow[] }>('/api/face/enrolled'),
  });

  const enrolledMap = new Map(
    (enrollQuery.data?.data ?? []).map((e) => [e.employeeId, e]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Face Enrollment</h1>
        <p className="text-sm text-fg-2 mt-1">
          Employees must have an enrolled face to use the kiosk.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat
          label="Active Employees"
          value={String(empQuery.data?.meta.total ?? 0)}
        />
        <Stat
          label="Enrolled"
          value={String(enrollQuery.data?.data.length ?? 0)}
          ok
        />
        <Stat
          label="Not Enrolled"
          value={String(
            (empQuery.data?.meta.total ?? 0) - (enrollQuery.data?.data.length ?? 0),
          )}
        />
      </div>

      <div className="bg-surface border border-subtle rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-elevated/50 border-b border-subtle">
            <tr className="text-fg-2 text-left">
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Face Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {empQuery.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  <Loader2 size={20} className="inline animate-spin" /> Loading...
                </td>
              </tr>
            )}

            {!empQuery.isLoading && empQuery.data?.data.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No active employees. Add employees first.
                </td>
              </tr>
            )}

            {empQuery.data?.data.map((emp) => {
              const enrolled = enrolledMap.get(emp.id);
              return (
                <tr
                  key={emp.id}
                  className="border-b border-subtle last:border-0 hover:bg-hover"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-2">
                    {emp.employeeCode}
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td className="px-4 py-3 text-fg-2">
                    {emp.department ?? '-'}
                  </td>
                  <td className="px-4 py-3">
                    {enrolled ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-success-soft text-success border border-success/30">
                        <CheckCircle2 size={12} /> Enrolled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-elevated text-muted border border-subtle">
                        <XCircle size={12} /> Not enrolled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      variant={enrolled ? 'secondary' : 'primary'}
                      onClick={() => setEnrolling(emp)}
                    >
                      <UserCheck size={14} />
                      {enrolled ? 'Re-enroll' : 'Enroll Face'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EnrollModal
        employee={enrolling}
        onClose={() => setEnrolling(null)}
        onSaved={() => {
          setEnrolling(null);
          qc.invalidateQueries({ queryKey: ['enrolled-faces'] });
        }}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-xl p-4">
      <div className="text-xs text-fg-2">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          ok ? 'text-success' : 'text-fg'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Enroll modal with webcam
// ---------------------------------------------------------------------------

function EnrollModal({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const open = !!employee;

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setReady(false);
      setSaved(false);
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (e: any) {
        setError(e?.message ?? 'Camera access denied');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const captureAndEnroll = async () => {
    if (!employee || !videoRef.current) return;
    setBusy(true);
    setError(null);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
      );
      if (!blob) throw new Error('Failed to capture image');

      const form = new FormData();
      form.append('employeeId', employee.id);
      form.append('file', blob, 'face.jpg');

      await api.post<EnrollFaceResponse>('/api/face/enroll', form);
      setSaved(true);
      setTimeout(() => onSaved(), 1200);
    } catch (e: any) {
      setError(e?.message ?? 'Enrollment failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        employee
          ? `Enroll face: ${employee.firstName} ${employee.lastName}`
          : ''
      }
      maxWidth="max-w-xl"
    >
      {!employee ? null : (
        <div className="space-y-4">
          <div className="text-xs text-fg-2">
            Employee: {employee.employeeCode} &middot; {employee.email}
          </div>

          <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] border border-subtle">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
            {!ready && !error && (
              <div className="absolute inset-0 flex items-center justify-center text-muted">
                <Loader2 size={32} className="animate-spin" />
              </div>
            )}
            {saved && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-success/40 backdrop-blur">
                <CheckCircle2 size={64} className="text-white mb-2" />
                <div className="text-xl font-semibold text-white">
                  Enrolled!
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-muted">
            Look directly at the camera. Good lighting helps. Wait until the
            preview is crisp before clicking Capture.
          </div>

          {error && (
            <div className="text-sm text-danger bg-danger-soft border border-danger/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={captureAndEnroll}
              disabled={busy || !ready || saved}
            >
              {busy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Camera size={14} />
              )}
              {busy ? 'Enrolling...' : 'Capture & Enroll'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
