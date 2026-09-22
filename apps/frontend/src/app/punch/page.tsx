'use client';

import { useRef, useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const SECRET_KEY = 'kiosk_device_key';

type Direction = 'IN' | 'OUT';

type Result =
  | {
      kind: 'success';
      employee: { name: string; code: string };
      direction: Direction;
      timestamp: string;
    }
  | { kind: 'error'; message: string }
  | null;

export default function KioskPage() {
  const [secret, setSecret] = useState<string>('');
  const [secretInput, setSecretInput] = useState('');
  const [secretReady, setSecretReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Direction | null>(null);
  const [result, setResult] = useState<Result>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const saved =
      typeof window !== 'undefined' ? localStorage.getItem(SECRET_KEY) : null;
    if (saved) {
      setSecret(saved);
      setSecretReady(true);
    }
  }, []);

  useEffect(() => {
    if (!secretReady || !videoRef.current) return;

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
          setCameraReady(true);
        }
      } catch (e: any) {
        setCameraError(e?.message ?? 'Camera access denied');
      }
    })();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [secretReady]);

  const saveSecret = (e: React.FormEvent) => {
    e.preventDefault();
    const val = secretInput.trim();
    if (!val) return;
    localStorage.setItem(SECRET_KEY, val);
    setSecret(val);
    setSecretReady(true);
  };

  const changeSecret = () => {
    localStorage.removeItem(SECRET_KEY);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSecret('');
    setSecretReady(false);
    setCameraReady(false);
    setSecretInput('');
  };

  const punch = async (direction: Direction) => {
    if (busy) return;
    if (!cameraReady || !videoRef.current) return;

    setBusy(direction);
    setResult(null);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not available');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85),
      );
      if (!blob) throw new Error('Failed to capture image');

      const form = new FormData();
      form.append('file', blob, 'punch.jpg');
      form.append('direction', direction);

      const res = await fetch(`${API_URL}/api/attendance/kiosk/punch`, {
        method: 'POST',
        headers: { 'X-Device-Key': secret },
        body: form,
      });

      const data = await res.json();

      if (data.ok) {
        setResult({
          kind: 'success',
          employee: data.employee,
          direction,
          timestamp: data.log.timestamp,
        });
      } else {
        setResult({ kind: 'error', message: data.error ?? 'Unknown error' });
      }
    } catch (e: any) {
      setResult({ kind: 'error', message: e?.message ?? 'Network error' });
    } finally {
      setBusy(null);
      setTimeout(() => setResult(null), 6000);
    }
  };

  // -------------------------------------------------------------------------
  // Secret setup screen
  // -------------------------------------------------------------------------

  if (!secretReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <form
          onSubmit={saveSecret}
          className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="text-center mb-2">
            <div className="text-3xl mb-2">🔐</div>
            <h1 className="text-lg font-semibold text-slate-100">Kiosk Setup</h1>
            <p className="text-xs text-slate-400 mt-1">
              Enter the device key from your admin's Devices page
            </p>
          </div>
          <input
            type="password"
            value={secretInput}
            onChange={(e) => setSecretInput(e.target.value)}
            placeholder="dk_..."
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm"
          >
            Save & Start
          </button>
        </form>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Kiosk main screen
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🎯</span>
          <span className="font-semibold">Attendance Kiosk</span>
        </div>
        <button
          onClick={changeSecret}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Change device key
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-10">
        {cameraError ? (
          <div className="max-w-lg text-center">
            <XCircle size={48} className="text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Camera unavailable</h2>
            <p className="text-sm text-slate-400">{cameraError}</p>
            <p className="text-xs text-slate-500 mt-4">
              Allow camera access in your browser settings and reload this page.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-10 w-full max-w-lg">
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] border border-slate-800">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
                {!cameraReady && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    <Loader2 size={32} className="animate-spin" />
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
              <PunchButton
                direction="IN"
                disabled={!cameraReady || busy !== null}
                busy={busy === 'IN'}
                onClick={() => punch('IN')}
              />
              <PunchButton
                direction="OUT"
                disabled={!cameraReady || busy !== null}
                busy={busy === 'OUT'}
                onClick={() => punch('OUT')}
              />
            </div>
          </>
        )}

        {result && (
          <div className="fixed inset-x-0 bottom-0 p-6 pointer-events-none">
            <div
              className={`max-w-2xl mx-auto rounded-2xl border-2 px-6 py-5 shadow-2xl backdrop-blur ${
                result.kind === 'success'
                  ? 'bg-green-500/20 border-green-500/50'
                  : 'bg-red-500/20 border-red-500/50'
              }`}
            >
              <div className="flex items-start gap-4">
                {result.kind === 'success' ? (
                  <CheckCircle2 size={40} className="text-green-400 shrink-0 mt-1" />
                ) : (
                  <AlertCircle size={40} className="text-red-400 shrink-0 mt-1" />
                )}
                <div className="flex-1">
                  {result.kind === 'success' ? (
                    <>
                      <div className="text-2xl font-bold text-green-300">
                        {result.employee.name}
                      </div>
                      <div className="text-lg mt-1">
                        <span
                          className={`font-mono px-2 py-0.5 rounded ${
                            result.direction === 'IN'
                              ? 'bg-green-600/40 text-green-100'
                              : 'bg-orange-600/40 text-orange-100'
                          }`}
                        >
                          {result.direction}
                        </span>
                        <span className="ml-3 text-slate-200">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-2">
                        {result.employee.code}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xl font-semibold text-red-300">
                        Failed
                      </div>
                      <div className="text-sm mt-1 text-slate-200">
                        {result.message}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function PunchButton({
  direction,
  disabled,
  busy,
  onClick,
}: {
  direction: Direction;
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  const isIn = direction === 'IN';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-3xl py-14 px-6 flex flex-col items-center justify-center gap-4 transition shadow-lg disabled:opacity-40 disabled:cursor-not-allowed ${
        isIn
          ? 'bg-green-600 hover:bg-green-500 active:bg-green-700'
          : 'bg-orange-600 hover:bg-orange-500 active:bg-orange-700'
      }`}
    >
      {busy ? (
        <Loader2 size={64} className="animate-spin" />
      ) : isIn ? (
        <LogIn size={64} />
      ) : (
        <LogOut size={64} />
      )}
      <div className="text-2xl font-bold tracking-wide">
        {busy ? 'Verifying…' : isIn ? 'CHECK IN' : 'CHECK OUT'}
      </div>
    </button>
  );
}