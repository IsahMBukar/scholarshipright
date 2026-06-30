// Centralized admin API client. All requests go through here so we can:
//  - normalize error handling
//  - keep credentials consistent (cookie auth)
//  - keep types in one place
//
// Pattern mirrors existing frontend pages: fetch with `credentials: 'include'`.

import { API_URL } from '@/lib/env';

export class AdminApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = 'AdminApiError';
  }
}

interface RequestOpts {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | boolean | undefined | null> | object;
  signal?: AbortSignal;
}

export async function adminFetch<T = unknown>(
  path: string,
  opts: RequestOpts = {}
): Promise<T> {
  const { method = 'GET', body, params, signal } = opts;

  let url = `${API_URL}${path}`;
  if (params) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      qs.append(k, String(v));
    });
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  // 204 / empty
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON, keep raw
      json = text;
    }
  }

  if (!res.ok) {
    const detail =
      (json && typeof json === 'object' && 'detail' in (json as Record<string, unknown>))
        ? String((json as Record<string, unknown>).detail)
        : `Request failed (${res.status})`;
    throw new AdminApiError(detail, res.status, json);
  }

  return json as T;
}
