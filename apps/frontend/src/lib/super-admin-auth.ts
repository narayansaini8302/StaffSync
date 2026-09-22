'use client';

import { create } from 'zustand';
import { saApi } from './super-admin-api';

export interface SuperAdmin {
  id: string;
  email: string;
}

interface SuperAdminAuthState {
  superAdmin: SuperAdmin | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useSuperAdminAuth = create<SuperAdminAuthState>((set) => ({
  superAdmin: null,
  hydrated: false,
  loading: false,
  error: null,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('sa_user');
      set({ superAdmin: raw ? JSON.parse(raw) : null, hydrated: true });
    } catch {
      set({ superAdmin: null, hydrated: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await saApi.post<{
        accessToken: string;
        superAdmin: SuperAdmin;
      }>('/api/super-admin/auth/login', { email, password });

      saApi.setToken(data.accessToken);
      localStorage.setItem('sa_user', JSON.stringify(data.superAdmin));
      set({ superAdmin: data.superAdmin, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Login failed' });
      throw e;
    }
  },

  logout: () => {
    saApi.clearToken();
    set({ superAdmin: null });
    if (typeof window !== 'undefined') {
      window.location.href = '/super-admin/login';
    }
  },
}));