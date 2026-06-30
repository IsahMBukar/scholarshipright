'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav-items';

/**
 * Slide-in global nav drawer (mobile only). Caller controls `open` state
 * and supplies the trigger button. Used by MobileNav and the scholarship
 * detail page's sticky bar.
 */
export default function GlobalNavDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  if (!open) return null;

  return (
    <div className="md:hidden fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={onClose} />
      <div className="absolute top-0 left-0 w-[280px] h-full bg-white shadow-xl animate-slide-in-left flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center" aria-label="Close menu">
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>
        <nav className="flex flex-col p-4 gap-1 flex-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors
                  ${active
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'}`}
              >
                <span className={`material-symbols-outlined text-[22px] ${item.soon ? 'opacity-40' : ''}`}>{item.icon}</span>
                <span className={item.soon ? 'opacity-50' : ''}>{item.label}</span>
                {item.soon && <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-text-secondary">Soon</span>}
              </a>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <a
            href="/settings"
            onClick={onClose}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors
              ${pathname === '/settings'
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'}`}
          >
            <span className="material-symbols-outlined text-[22px]">settings</span>
            Settings
          </a>
        </div>
      </div>
    </div>
  );
}
