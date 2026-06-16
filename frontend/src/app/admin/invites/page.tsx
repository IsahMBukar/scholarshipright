'use client';

import AdminLayout from '@/components/admin/AdminLayout';

export default function AdminInvitesPlaceholder() {
  return (
    <AdminLayout title="Invites" description="Provision new admins">
      <div className="bg-white rounded-card border border-gray-200 p-8 text-center text-sm text-text-secondary">
        Coming in Phase 3 — create / revoke / resend admin invites.
      </div>
    </AdminLayout>
  );
}
