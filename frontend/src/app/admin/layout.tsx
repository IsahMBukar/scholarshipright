// Segment-level layout for /admin/*. This is where we mount:
//   1. QueryClient — once, so all admin pages can use react-query hooks
//   2. ToastProvider — once, so any page can call useToast()
//
// AdminLayout (sidebar + auth gate) is applied per-page via the page component.

import QueryProvider from '@/lib/admin/query-provider';
import { ToastProvider } from '@/components/admin/ui/Toast';
import { ConfirmProvider } from '@/components/admin/ui/ConfirmDialog';
import { type ReactNode } from 'react';

export default function AdminSegmentLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
