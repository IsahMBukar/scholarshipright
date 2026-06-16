// Segment-level layout for /admin/*. This is where we mount the QueryClient
// provider ONCE so all admin pages can use react-query hooks. AdminLayout
// (sidebar + auth gate) is applied per-page via the page component itself.

import QueryProvider from '@/lib/admin/query-provider';
import { type ReactNode } from 'react';

export default function AdminSegmentLayout({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}
