/**
 * Core API client for the Xtechs ERP frontend.
 *
 * Uses HttpOnly cookies for authentication (sent automatically by the browser).
 * No manual token management needed — the browser sends `access_token` cookie.
 *
 * Uses `credentials: 'include'` on all requests to ensure cookies are sent
 * cross-origin during development (NEXT_PUBLIC_API_URL != Next.js origin).
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiErrorBody {
  error?: string;
  message?: string;
  details?: unknown;
}

/**
 * Core fetch wrapper. Automatically includes credentials (cookies).
 */
export async function fetchApi<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      res.status,
      body.error ?? 'UNKNOWN_ERROR',
      body.message ?? `Request failed with status ${res.status}`,
      body.details,
    );
  }

  // 204 No Content — return null
  if (res.status === 204) {
    return null as T;
  }

  return res.json() as Promise<T>;
}

// ─── Typed API helpers ────────────────────────────────────────

export const api = {
  get: <T>(path: string, init?: RequestInit) =>
    fetchApi<T>(path, { method: 'GET', ...init }),

  post: <T>(path: string, body?: unknown, init?: RequestInit) =>
    fetchApi<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  patch: <T>(path: string, body?: unknown, init?: RequestInit) =>
    fetchApi<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...init,
    }),

  del: <T>(path: string, init?: RequestInit) =>
    fetchApi<T>(path, { method: 'DELETE', ...init }),
};
