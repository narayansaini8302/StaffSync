'use client';

import { create } from 'zustand';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  remove: (id: string) => void;
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }));
    }, 4500);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'success', title, description }),
  error: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'error', title, description }),
  info: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'info', title, description }),
};

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);

  return (
    <div className="fixed top-3 right-3 left-3 sm:left-auto sm:right-4 sm:top-4 z-[100] flex flex-col gap-2 pointer-events-none items-end">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto w-full sm:w-80 max-w-[calc(100vw-24px)] rounded-xl border shadow-lg backdrop-blur px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top-2 sm:slide-in-from-right duration-200 ${
            t.kind === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-200'
              : t.kind === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
          }`}
        >
          {t.kind === 'success' ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          ) : t.kind === 'error' ? (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          ) : (
            <Info size={18} className="shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{t.title}</div>
            {t.description && (
              <div className="text-xs text-slate-300 mt-0.5">{t.description}</div>
            )}
          </div>
          <button
            onClick={() => remove(t.id)}
            className="text-slate-400 hover:text-slate-100 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
