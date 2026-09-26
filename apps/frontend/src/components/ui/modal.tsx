'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} max-h-[92vh] flex flex-col bg-surface border border-subtle rounded-xl shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-subtle shrink-0">
          <h2 className="font-medium text-fg truncate pr-2">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-hover text-fg-2 hover:text-fg shrink-0 touch-manipulation"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
