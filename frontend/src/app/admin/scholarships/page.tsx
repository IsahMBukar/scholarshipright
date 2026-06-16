'use client';

import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminScholarshipsPlaceholder() {
  return (
    <AdminLayout title="Scholarships" description="Catalog moderation and health">
      <div className="bg-white rounded-card border border-gray-200 p-8 text-center text-sm text-text-secondary">
        Coming in Phase 3 — activate/deactivate, feature toggles, and dead-scholarship sweep.
      </div>
    </AdminLayout>
  );
}
