'use client';

import { useEffect } from 'react';
import { useAuth } from './auth';
import { useSuperAdminAuth } from './super-admin-auth';

export function AuthHydrator() {
  const hydrateUser = useAuth((s) => s.hydrate);
  const hydrateSuperAdmin = useSuperAdminAuth((s) => s.hydrate);

  useEffect(() => {
    hydrateUser();
    hydrateSuperAdmin();
  }, [hydrateUser, hydrateSuperAdmin]);

  return null;
}