'use client';

import { Suspense } from 'react';
import { UnifiedLoginForm } from '@/components/auth/UnifiedLoginForm';

export default function SuperAdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0e12] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.18),rgba(0,0,0,0))] px-4 py-12 relative overflow-hidden">
      {/* Subtle ambient decorative gradient orbs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 text-center text-zinc-400">
            Loading Super Admin portal…
          </div>
        }
      >
        <UnifiedLoginForm defaultMode="super-admin" />
      </Suspense>
    </div>
  );
}