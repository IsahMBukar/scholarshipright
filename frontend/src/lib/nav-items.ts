// Shared navigation items used by Sidebar, PageHeader, GlobalNavDrawer,
// and the scholarships page mobile menu. Single source of truth to avoid
// drift when adding/removing/reordering pages.

export interface NavItem {
  label: string;
  icon: string;
  href: string;
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Scholarships', icon: 'school', href: '/scholarships' },
  { label: 'Resume', icon: 'description', href: '/resume' },
  { label: 'Profile', icon: 'person', href: '/profile' },
  { label: 'Coaching', icon: 'record_voice_over', href: '/coaching', soon: true },
  { label: 'Interview', icon: 'quiz', href: '/interview', soon: true },
];
