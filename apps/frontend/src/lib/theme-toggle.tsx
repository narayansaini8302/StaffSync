'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const emptySubscribe = () => () => {};

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    return (
      <div
        className={`${
          compact ? 'w-8 h-8' : 'w-full h-9'
        } rounded-lg bg-surface border border-subtle animate-pulse`}
      />
    );
  }

  const cycle = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;
  const label =
    theme === 'system' ? 'System' : theme === 'light' ? 'Light' : 'Dark';

  if (compact) {
    return (
      <button
        onClick={cycle}
        title={`Theme: ${label}. Click to cycle.`}
        className="p-2 rounded-lg text-fg-2 hover:text-fg hover:bg-hover border border-subtle transition touch-manipulation"
        aria-label="Toggle theme"
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label}. Click to cycle.`}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-fg-2 hover:text-fg hover:bg-hover border border-subtle transition touch-manipulation"
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}
