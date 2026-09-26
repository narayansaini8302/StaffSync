'use client';

import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const styles: Record<Variant, string> = {
  primary: 'bg-brand hover:bg-brand-hover text-brand-fg',
  secondary: 'bg-elevated hover:bg-hover text-fg border border-subtle',
  danger: 'bg-danger hover:opacity-90 text-white',
  ghost: 'text-fg-2 hover:bg-hover',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}
