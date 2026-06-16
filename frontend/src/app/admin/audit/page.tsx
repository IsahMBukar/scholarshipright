'use client';

import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminAuditPlaceholder() {
  return (
    <AdminLayout title="Audit log" description="Every privileged action, every actor">
      <div className="bg-white rounded-card border border-gray-200 p-8 text-center text-sm text-text-secondary">
        Coming in Phase 3 — searchable / filterable / exportable audit stream.
      </div>
    </AdminLayout>
  );
}
