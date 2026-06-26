'use client';

// Global auth context.
//
// Responsibilities:
//   1. Track whether the user is authenticated (checks /api/auth/me on mount)
//   2. Expose user info (email, name, is_admin)
//   3. Manage a "pending action" queue — when a guest clicks Save/Apply/Match,
//      we store the action, show the auth modal, and replay it after login
//   4. Expose login/logout helpers
//
// Usage:
//   const { user, isAuthenticated, login, pendingAction, setPendingAction } = useAuth();

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface User {
  id: number;
  email: string;
  full_name?: string;
  is_admin?: boolean;
  admin_role?: string | null;
}

export interface PendingAction {
  type: 'save' | 'apply' | 'match' | 'checklist' | 'custom';
  label: string;           // Human-readable: "Save DAAD EPOS Scholarship"
  payload?: Record<string, unknown>; // Any data needed to replay
  onReplay?: () => void | Promise<void>; // Callback to execute after auth
}

interface AuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  // Pending action (set by action gating, consumed after login)
  pendingAction: PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
  // Auth methods
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser({
          id: data.id,
          email: data.email,
          full_name: data.full_name,
          is_admin: data.is_admin,
          admin_role: data.admin_role,
        });
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        await refresh();
        return { ok: true };
      }
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.detail || 'Login failed' };
    } catch {
      return { ok: false, error: 'Network error' };
    }
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch { /* ignore */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        pendingAction,
        setPendingAction,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
