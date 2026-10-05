'use client';

import { create } from 'zustand';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

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
    }, 5000);
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
  warning: (title: string, description?: string) =>
    useToasts.getState().push({ kind: 'warning', title, description }),
};

const kindStyles: Record<
  ToastKind,
  {
    icon: typeof CheckCircle2;
    iconColor: string;
    iconBg: string;
    accentBorder: string;
    badgeBorder: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    accentBorder: 'border-l-emerald-500 dark:border-l-emerald-400',
    badgeBorder: 'border-emerald-200/80 dark:border-emerald-800/50',
  },
  error: {
    icon: AlertCircle,
    iconColor: 'text-rose-600 dark:text-rose-400',
    iconBg: 'bg-rose-50 dark:bg-rose-950/40',
    accentBorder: 'border-l-rose-500 dark:border-l-rose-400',
    badgeBorder: 'border-rose-200/80 dark:border-rose-800/50',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-950/40',
    accentBorder: 'border-l-amber-500 dark:border-l-amber-400',
    badgeBorder: 'border-amber-200/80 dark:border-amber-800/50',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-50 dark:bg-blue-950/40',
    accentBorder: 'border-l-blue-500 dark:border-l-blue-400',
    badgeBorder: 'border-blue-200/80 dark:border-blue-800/50',
  },
};

export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  const remove = useToasts((s) => s.remove);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 left-4 sm:left-auto sm:right-6 sm:top-6 z-[100] flex flex-col gap-2.5 pointer-events-none items-end max-w-full"
    >
      {toasts.map((t) => {
        const style = kindStyles[t.kind] || kindStyles.info;
        const Icon = style.icon;

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto w-full sm:w-96 max-w-[calc(100vw-32px)] rounded-xl bg-white dark:bg-[#18191f] text-slate-900 dark:text-slate-100 border border-slate-200/90 dark:border-zinc-800 border-l-4 ${style.accentBorder} shadow-xl shadow-slate-900/10 dark:shadow-black/60 p-3.5 flex items-start gap-3 transition-all duration-200 animate-in slide-in-from-top-2 sm:slide-in-from-right-3`}
          >
            <div
              className={`w-8 h-8 rounded-lg ${style.iconBg} ${style.iconColor} border ${style.badgeBorder} flex items-center justify-center shrink-0 mt-0.5`}
            >
              <Icon size={18} strokeWidth={2.2} />
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">
                {t.title}
              </div>
              {t.description && (
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed break-words font-normal">
                  {t.description}
                </div>
              )}
            </div>

            <button
              onClick={() => remove(t.id)}
              className="p-1 -mr-1 -mt-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors shrink-0 touch-manipulation cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
