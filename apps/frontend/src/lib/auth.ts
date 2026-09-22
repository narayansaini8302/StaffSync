'use client';

import { create } from 'zustand';
import { api } from './api';

export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';
}

export interface AuthState {
  user: User | null;
  hydrated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  loading: false,
  error: null,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('user');
      set({ user: raw ? JSON.parse(raw) : null, hydrated: true });
    } catch {
      set({ user: null, hydrated: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const data = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: User;
      }>('/api/auth/login', { email, password });

      api.setTokens(data.accessToken, data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'Login failed' });
      throw e;
    }
  },

  logout: () => {
    api.clearTokens();
    set({ user: null });
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
}));
