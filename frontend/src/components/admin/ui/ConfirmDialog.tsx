'use client';

// DEPRECATED — re-exports from the new global location so older imports
// keep working. All new code should import from
// `@/components/ui/ConfirmDialog` directly.
//
// The provider is mounted at the root layout (src/app/layout.tsx) so
// useConfirm() works in any segment — not just admin.

export { useConfirm, ConfirmProvider } from '@/components/ui/ConfirmDialog';
export type { ConfirmOptions } from '@/components/ui/ConfirmDialog';
