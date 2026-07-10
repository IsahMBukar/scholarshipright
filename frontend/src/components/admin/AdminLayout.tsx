'use client';

// Admin shell. Layout used by every /admin/* page.
//
// Responsibilities:
//   1. Provide TanStack Query to all admin pages
//   2. Verify the current user is an admin (calls /api/auth/me)
//   3. Render sidebar + topbar + content area
//   4. Block non-admins with a friendly forbidden state (we never redirect,
//      because the user might be a regular user on the same tab and we want
//      to preserve their login session).

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopbar from '@/components/admin/AdminTopbar';
import { ErrorBoundary } from '@/components/admin/ui/ErrorBoundary';
import { Skeleton } from '@/components/admin/ui/Skeleton';
import { ShieldOff } from 'lucide-react';
import type { AdminRole } from '@/lib/admin/types';

import { API_URL } from '@/lib/env';

interface AdminIdentity {
  id: number;
  email: string;
  is_admin: boolean;
  admin_role: AdminRole | null;
}

function ForbiddenView({ email, onBack }: { email?: string; onBack: () => void }) {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="max-w-md w-full bg-white rounded-card border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <ShieldOff className="w-6 h-6 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary mb-1">Admin access required</h2>
        <p className="text-sm text-text-secondary mb-1">
          You don&apos;t have permission to view this page.
        </p>
        {email && (
          <p className="text-xs text-text-secondary mb-4">
            Signed in as <span className="font-mono">{email}</span>
          </p>
        )}
        <button
          onClick={onBack}
          className="h-10 px-5 rounded-btn bg-primary text-white text-sm font-medium hover:opacity-90 transition"
        >
          Back to app
        </button>
      </div>
    </div>
  );
}

function LoadingView() {
  // Skeleton shell — matches the AdminShell so there's no layout jump when
  // the auth check resolves.
  return (
    <div className="h-screen bg-gray-100 flex">
      <div className="hidden md:flex flex-col w-64 h-full bg-white border-r border-gray-200">
        <div className="flex items-center gap-3 h-16 px-5 border-b border-gray-200">
          <Skeleton className="w-9 h-9 rounded-xl" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        <div className="flex-1 p-3 space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-btn" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="h-16 border-b border-gray-200 bg-white/80 flex items-center px-6">
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-card border border-gray-200 p-5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16 mt-3" />
                <Skeleton className="h-3 w-20 mt-3" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminShell({
  identity,
  pageTitle,
  pageDescription,
  actions,
  children,
}: {
  identity: AdminIdentity;
  pageTitle: string;
  pageDescription?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="h-screen bg-gray-100 flex">
      <AdminSidebar adminEmail={identity.email} adminRole={identity.admin_role ?? undefined} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminTopbar title={pageTitle} description={pageDescription} actions={actions} />
        <main className="flex-1 overflow-y-auto p-6">
          <ErrorBoundary label={pageTitle}>{children}</ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export interface AdminLayoutProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export default function AdminLayout({ title, description, actions, children }: AdminLayoutProps) {
  return (
    <AdminLayoutInner title={title} description={description} actions={actions}>
      {children}
    </AdminLayoutInner>
  );
}

function AdminLayoutInner({ title, description, actions, children }: AdminLayoutProps) {
  const router = useRouter();
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'forbidden'; email?: string } | { kind: 'ok'; identity: AdminIdentity }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
        if (!res.ok) {
          // 401 → not logged in. Redirect to /login with return URL.
          if (!cancelled && res.status === 401) {
            router.replace(`/login?next=${encodeURIComponent('/admin')}`);
            return;
          }
          if (!cancelled) setState({ kind: 'forbidden' });
          return;
        }
        const me = (await res.json()) as Partial<AdminIdentity> & { email?: string };
        if (!cancelled) {
          if (me.is_admin) {
            setState({
              kind: 'ok',
              identity: {
                id: me.id ?? 0,
                email: me.email ?? 'unknown',
                is_admin: true,
                admin_role: (me.admin_role ?? null) as AdminRole | null,
              },
            });
          } else {
            setState({ kind: 'forbidden', email: me.email });
          }
        }
      } catch (err) {
        console.error('[AdminLayout] Auth check failed:', err);
        if (!cancelled) setState({ kind: 'forbidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (state.kind === 'loading') return <LoadingView />;
  if (state.kind === 'forbidden')
    return <ForbiddenView email={state.email} onBack={() => router.push('/scholarships')} />;
  return (
    <AdminShell
      identity={state.identity}
      pageTitle={title}
      pageDescription={description}
      actions={actions}
    >
      {children}
    </AdminShell>
  );
}
