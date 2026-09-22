'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'sa_accessToken';

class SuperAdminApi {
  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(TOKEN_KEY);
  }

  setToken(token: string) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('sa_user');
  }

  async request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${path}`, { ...options, headers });

    if (res.status === 401) {
      this.clearToken();
      if (typeof window !== 'undefined' && !window.location.pathname.endsWith('/super-admin/login')) {
        window.location.href = '/super-admin/login';
      }
      throw { status: 401, message: 'Unauthorized' };
    }

    if (!res.ok) {
      let body: any = {};
      try {
        body = await res.json();
      } catch {
        body = { error: res.statusText };
      }
      throw {
        status: res.status,
        message: body.error ?? 'Request failed',
        detail: body,
      };
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  get<T = unknown>(path: string) {
    return this.request<T>(path, { method: 'GET' });
  }
  post<T = unknown>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
  delete<T = unknown>(path: string) {
    return this.request<T>(path, { method: 'DELETE' });
  }
}

export const saApi = new SuperAdminApi();