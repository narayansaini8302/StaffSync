'use client';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export interface ApiError {
  status: number;
  message: string;
  detail?: unknown;
}

function formatApiErrorMessage(body: any): string {
  if (!body) return 'Request failed';
  if (typeof body === 'string') return body;

  const raw = body.error ?? body.detail ?? body.message;
  if (typeof raw === 'string') return raw;

  const target = typeof raw === 'object' && raw !== null ? raw : body;
  if (typeof target === 'object' && target !== null) {
    const parts: string[] = [];

    if (Array.isArray(target.formErrors)) {
      parts.push(...target.formErrors.filter((msg: unknown) => typeof msg === 'string'));
    }

    if (target.fieldErrors && typeof target.fieldErrors === 'object') {
      for (const [field, errs] of Object.entries(target.fieldErrors)) {
        if (Array.isArray(errs)) {
          const joined = errs.filter(Boolean).join(', ');
          if (joined) parts.push(`${field}: ${joined}`);
        } else if (typeof errs === 'string') {
          parts.push(`${field}: ${errs}`);
        }
      }
    }

    if (Array.isArray(target.errors)) {
      for (const err of target.errors) {
        if (typeof err === 'string') parts.push(err);
        else if (err && typeof err === 'object' && typeof err.message === 'string') {
          parts.push(err.message);
        }
      }
    }

    if (parts.length > 0) {
      return parts.join(' • ');
    }
  }

  return 'Request failed';
}

class ApiClient {
  private onError: ((message: string) => void) | null = null;

  setErrorHandler(handler: (message: string) => void) {
    this.onError = handler;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('accessToken');
  }

  private getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('refreshToken');
  }

  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  clearTokens() {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  private async refresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    }
  }

  async request<T = unknown>(
    path: string,
    options: RequestInit = {},
    retry = true,
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    // Only add JSON content-type if not sending FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    }

    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const res = await fetch(`${API_URL}${cleanPath}`, { ...options, headers });

    // Auto-refresh on 401 and retry once
    if (res.status === 401 && retry) {
      const refreshed = await this.refresh();
      if (refreshed) {
        return this.request<T>(path, options, false);
      }
      this.clearTokens();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw { status: 401, message: 'Unauthorized' } as ApiError;
    }

    if (!res.ok) {
      let body: any = {};
      try {
        body = await res.json();
      } catch {
        body = { error: res.statusText };
      }

      const message = formatApiErrorMessage(body);
      if (this.onError && res.status !== 401) {
        this.onError(message);
      }
      throw {
        status: res.status,
        message,
        detail: body,
      } as ApiError;
    }

    // 204 No Content
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

  async downloadBlob(path: string): Promise<Blob> {
    const token = this.getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Download failed');
    return res.blob();
  }
}

export const api = new ApiClient();
export const API_URL_CONST = API_URL;

// Bridge API errors to toasts (dynamically imported to avoid SSR issues)
if (typeof window !== 'undefined') {
  import('./toast').then(({ toast }) => {
    api.setErrorHandler((message) => {
      toast.error('Request failed', message);
    });
  });
}