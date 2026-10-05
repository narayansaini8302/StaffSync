import React, { useState } from 'react';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  href?: string;
  className?: string;
  theme?: 'default' | 'super-admin';
  customLogoUrl?: string | null;
  customName?: string | null;
}

export function StaffSyncIcon({
  size = 32,
  className = '',
  variant = 'default',
}: {
  size?: number;
  className?: string;
  variant?: 'default' | 'super-admin';
}) {
  const isSuper = variant === 'super-admin';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-200 hover:scale-105 ${className}`}
    >
      <defs>
        <linearGradient id={`bgGrad-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isSuper ? '#0F172A' : '#0B132B'} />
          <stop offset="100%" stopColor={isSuper ? '#1E1B4B' : '#1C2541'} />
        </linearGradient>

        <linearGradient id={`loop1-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isSuper ? '#818CF8' : '#22D3EE'} />
          <stop offset="50%" stopColor={isSuper ? '#6366F1' : '#06B6D4'} />
          <stop offset="100%" stopColor={isSuper ? '#4F46E5' : '#0284C7'} />
        </linearGradient>

        <linearGradient id={`loop2-${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isSuper ? '#A5B4FC' : '#38BDF8'} />
          <stop offset="50%" stopColor={isSuper ? '#818CF8' : '#2563EB'} />
          <stop offset="100%" stopColor={isSuper ? '#6366F1' : '#4F46E5'} />
        </linearGradient>

        <filter id={`glow-${variant}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="3"
            floodColor={isSuper ? '#6366F1' : '#0284C7'}
            floodOpacity={0.5}
          />
        </filter>
      </defs>

      {/* Rounded squircle tile */}
      <rect
        width="64"
        height="64"
        rx="16"
        fill={`url(#bgGrad-${variant})`}
      />
      <rect
        width="64"
        height="64"
        rx="16"
        stroke={isSuper ? 'rgba(129, 140, 248, 0.25)' : 'rgba(56, 189, 248, 0.25)'}
        strokeWidth="1.5"
      />

      {/* Interlocking Dual-S Ribbon Infinity Loop */}
      <g filter={`url(#glow-${variant})`}>
        {/* Right S curve (Sync loop) */}
        <path
          d="M32 32 C38 23 48 23 51 29 C54 35 48 42 42 42 C36 42 32 38 28 42 C24 46 25 50 31 51 C37 52 46 49 50 43"
          stroke={`url(#loop2-${variant})`}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Left S curve (Staff loop) */}
        <path
          d="M32 32 C26 41 16 41 13 35 C10 29 16 22 22 22 C28 22 32 26 36 22 C40 18 39 14 33 13 C27 12 18 15 14 21"
          stroke={`url(#loop1-${variant})`}
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {/* Central nexus node */}
        <circle
          cx="32"
          cy="32"
          r="2.8"
          fill={isSuper ? '#C7D2FE' : '#38BDF8'}
        />
      </g>
    </svg>
  );
}

export function StaffSyncLogo({
  size = 'md',
  showText = true,
  subtitle,
  href,
  className = '',
  theme = 'default',
  customLogoUrl,
  customName,
}: LogoProps) {
  const [imgError, setImgError] = useState(false);

  const iconSizes = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 52,
  };

  const textSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  const isSuper = theme === 'super-admin';
  const hasCustomLogo = Boolean(customLogoUrl && !imgError);

  const content = (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {hasCustomLogo ? (
        <div
          className="rounded-lg overflow-hidden border border-subtle bg-surface flex items-center justify-center shrink-0 p-0.5 shadow-sm"
          style={{ width: iconSizes[size], height: iconSizes[size] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={customLogoUrl!}
            alt={customName || 'Company Logo'}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain rounded"
          />
        </div>
      ) : (
        <StaffSyncIcon
          size={iconSizes[size]}
          variant={theme}
        />
      )}

      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`font-bold tracking-tight ${textSizes[size]}`}>
            {customName ? (
              <span className={isSuper ? 'text-slate-100' : 'text-fg font-extrabold truncate max-w-[140px] sm:max-w-[180px] inline-block align-bottom'}>
                {customName}
              </span>
            ) : (
              <>
                <span className={isSuper ? 'text-slate-100' : 'text-fg font-extrabold'}>Staff</span>
                <span
                  className={
                    isSuper
                      ? 'bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent ml-0.5'
                      : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent ml-0.5'
                  }
                >
                  Sync
                </span>
              </>
            )}
          </div>
          {subtitle && (
            <span
              className={`text-[9px] uppercase tracking-wider font-semibold mt-0.5 ${
                isSuper ? 'text-indigo-400/80' : 'text-muted'
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex items-center focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
