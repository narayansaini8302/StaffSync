'use client';

import { Suspense } from 'react';
import { UnifiedLoginForm } from '@/components/auth/UnifiedLoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-8">
      <Suspense
        fallback={
          <div className="w-full max-w-md p-8 text-center text-slate-400">
            Loading login portal…
          </div>
        }
      >
        <UnifiedLoginForm defaultMode="admin" />
      </Suspense>
    </div>
  );
}
