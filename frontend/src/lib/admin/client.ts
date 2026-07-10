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
    } catch (err) {
      console.warn('[AdminClient] Response is not valid JSON, using raw text:', err);
      json = text;
    }
  }

  if (!res.ok) {
    const raw =
      (json && typeof json === 'object' && 'detail' in (json as Record<string, unknown>))
        ? (json as Record<string, unknown>).detail
        : null;
    let detail: string;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      // Structured error: { code, user_message, retryable, ... }
      detail = (raw as Record<string, unknown>).user_message as string
        ?? (raw as Record<string, unknown>).message as string
        ?? (raw as Record<string, unknown>).code as string
        ?? `Request failed (${res.status})`;
    } else if (Array.isArray(raw)) {
      // FastAPI validation errors: [{ loc, msg, type }, ...]
      detail = raw.map((e: Record<string, unknown>) => e.msg ?? JSON.stringify(e)).join('; ');
    } else if (typeof raw === 'string') {
      detail = raw;
    } else {
      detail = `Request failed (${res.status})`;
    }
    throw new AdminApiError(detail, res.status, json);
  }

  return json as T;
}
