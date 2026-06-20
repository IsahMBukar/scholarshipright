'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import NotificationBell from './NotificationBell';
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

export default function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const showConfirm = useConfirm();
  const pathname = usePathname();

  return (
    <>
      <div className="sticky top-0 z-40 bg-gray-100">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center gap-2 md:gap-6 border-b border-gray-200 pb-3">
            {/* Mobile hamburger */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden w-10 h-10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">{menuOpen ? 'close' : 'menu'}</span>
            </button>
            {/* Page title */}
            <h1 className="text-[20px] font-bold text-text-primary uppercase tracking-wide">{title}</h1>
            {/* Right-side extra content (tabs, buttons, etc.) */}
            {children && <div className="flex-1 flex items-center justify-end gap-2">{children}</div>}
            {/* Notification bell — far right on all screens */}
            <div className="flex items-center gap-2 ml-auto flex-shrink-0">
              <NotificationBell />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile slide-in menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-0 left-0 w-[280px] h-full bg-white shadow-xl animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-8 w-8 rounded-lg object-contain" />
              <button onClick={() => setMenuOpen(false)} className="w-10 h-10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors
                      ${active
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'}`}
                  >
                    <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                    {item.label}
                  </a>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 space-y-1">
              <a href="/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-text-secondary hover:bg-gray-100">
                <span className="material-symbols-outlined text-[22px]">settings</span>
                Settings
              </a>
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  const ok = await showConfirm({
                    title: 'Sign out of ScholarshipRight?',
                    description: 'You will be returned to the login page. Any unsaved changes will be lost.',
                    confirmLabel: 'Sign out',
                    cancelLabel: 'Cancel',
                    tone: 'danger',
                  });
                  if (ok) logoutAndRedirect();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-red-600 hover:bg-red-50 text-left"
              >
                <span className="material-symbols-outlined text-[22px]">logout</span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
