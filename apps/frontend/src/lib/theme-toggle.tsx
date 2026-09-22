'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    return (
      <div className="w-full h-9 rounded-lg bg-slate-800/50 animate-pulse" />
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

  return (
    <button
      onClick={cycle}
      title={`Theme: ${label}. Click to cycle.`}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 border border-slate-800"
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}
