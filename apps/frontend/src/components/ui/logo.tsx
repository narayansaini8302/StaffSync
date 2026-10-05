import React, { useState, useId } from 'react';
import Link from 'next/link';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  subtitle?: string;
  href?: string;
  className?: string;
  theme?: 'default' | 'super-admin';
  customLogoUrl?: string | null;
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
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9]/g, '');

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
        {/* Vibrant Brand Tile Gradient */}
        <linearGradient id={`bg-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={isSuper ? '#4338CA' : '#2563EB'} />
          <stop offset="50%" stopColor={isSuper ? '#4F46E5' : '#1D4ED8'} />
          <stop offset="100%" stopColor={isSuper ? '#6D28D9' : '#0284C7'} />
        </linearGradient>

        <linearGradient id={`accent-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor={isSuper ? '#DDD6FE' : '#67E8F9'} />
        </linearGradient>
      </defs>

      {/* Rounded Squircle Tile */}
      <rect
        width="64"
        height="64"
        rx="16"
        fill={`url(#bg-${id})`}
      />
      <rect
        width="64"
        height="64"
        rx="16"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth="1.5"
      />

      {/* Interlocking Dynamic Dual-S Loop (Crisp White + Electric Cyan) */}
      {/* Top / Right Loop */}
      <path
        d="M44 23 C44 17.5 38 15 32 15 C23 15 17 21 17 28 C17 37 32 36 32 43 C32 46.5 29 49 24 49 C19 49 16 46 16 41.5"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Bottom / Left Loop */}
      <path
        d="M20 41 C20 46.5 26 49 32 49 C41 49 47 43 47 36 C47 27 32 28 32 21 C32 17.5 35 15 40 15 C45 15 48 18 48 22.5"
        stroke={isSuper ? '#C7D2FE' : '#38BDF8'}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Dynamic Nexus Nodes */}
      <circle cx="32" cy="32" r="3.8" fill="#FFFFFF" />
      <circle cx="20" cy="41" r="2.8" fill={isSuper ? '#DDD6FE' : '#38BDF8'} />
      <circle cx="44" cy="23" r="2.8" fill="#FFFFFF" />
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
            alt="Company Logo"
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
            <span className={isSuper ? 'text-slate-100 font-extrabold' : 'text-fg font-extrabold'}>Staff</span>
            <span
              className={
                isSuper
                  ? 'bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent ml-0.5 font-extrabold'
                  : 'bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent ml-0.5 font-extrabold'
              }
            >
              Sync
            </span>
          </div>
          {subtitle && (
            <span
              className={`text-[9px] uppercase tracking-wider font-semibold mt-0.5 truncate max-w-[170px] ${
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
