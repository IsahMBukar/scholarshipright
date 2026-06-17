'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logoutAndRedirect } from '@/hooks/useLogout';
import { useConfirm } from '@/components/ui/ConfirmDialog';

const NAV_ITEMS = [
  { label: 'Scholarships', icon: 'school', href: '/scholarships' },
  { label: 'Resume', icon: 'description', href: '/resume' },
  { label: 'Profile', icon: 'person', href: '/profile' },
  { label: 'Agent', icon: 'smart_toy', href: '/chat' },
  { label: 'Coaching', icon: 'record_voice_over', href: '/coaching' },
  { label: 'Interview', icon: 'quiz', href: '/interview' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const showConfirm = useConfirm();

  return (
    <aside className="hidden md:flex flex-col items-center w-[80px] h-full bg-white border-r border-gray-200 py-4 gap-1 overflow-y-auto">
      {/* Logo */}
      <Link href="/scholarships" className="w-10 h-10 rounded-lg overflow-hidden mb-4">
        <img src="/images/logo-dark.jpg" alt="ScholarshipRight" className="w-10 h-10 object-contain" />
      </Link>

      {/* Nav Items */}
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-col items-center gap-0.5 w-full py-3 px-1 transition-colors group
              ${active ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}
          >
            <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            {active && (
              <div className="absolute left-0 w-[3px] h-8 bg-primary rounded-r-full" />
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      <Link
        href="/profile"
        title="Settings"
        className="flex flex-col items-center gap-0.5 w-full py-3 text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className="material-symbols-outlined text-[22px]">settings</span>
        <span className="text-[10px] font-medium">Settings</span>
      </Link>

      <button
        type="button"
        title="Sign out"
        onClick={async () => {
          const ok = await showConfirm({
            title: 'Sign out of ScholarshipRight?',
            description: 'You will be returned to the login page. Any unsaved changes will be lost.',
            confirmLabel: 'Sign out',
            cancelLabel: 'Cancel',
            tone: 'danger',
          });
          if (ok) logoutAndRedirect();
        }}
        className="flex flex-col items-center gap-0.5 w-full py-3 text-text-secondary hover:text-red-600 transition-colors"
      >
        <span className="material-symbols-outlined text-[22px]">logout</span>
        <span className="text-[10px] font-medium">Sign out</span>
      </button>
    </aside>
  );
}
