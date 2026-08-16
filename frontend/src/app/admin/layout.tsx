// Segment-level layout for /admin/*. This is where we mount:
//   1. QueryClient — once, so all admin pages can use react-query hooks
//
// AdminLayout (sidebar + auth gate) is applied per-page via the page component.
//
// Note: <ConfirmProvider> and <ToastProvider> are mounted at the root layout,
// so useConfirm() and useToast() are available everywhere — not just admin pages.

import type { Metadata } from 'next';
import QueryProvider from '@/lib/admin/query-provider';
import { type ReactNode } from 'react';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminSegmentLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
