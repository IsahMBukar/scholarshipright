'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from '@/lib/nav-items';

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col items-center w-[80px] h-full bg-white border-r border-gray-200 py-4 gap-1 overflow-y-auto">
      {/* Logo */}
      <Link href="/scholarships" className="w-10 h-10 rounded-lg overflow-hidden mb-4">
        <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="w-10 h-10 object-contain" />
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
            {'soon' in item && item.soon && (
              <span className="absolute top-1.5 right-1 text-[7px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-1 rounded">Soon</span>
            )}
            {active && (
              <div className="absolute left-0 w-[3px] h-8 bg-primary rounded-r-full" />
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      <Link
        href="/settings"
        title="Settings"
        className={`relative flex flex-col items-center gap-0.5 w-full py-3 transition-colors
          ${pathname === '/settings' ? 'text-primary' : 'text-text-secondary hover:text-text-primary'}`}
      >
        <span className="material-symbols-outlined text-[22px]">settings</span>
        <span className="text-[10px] font-medium">Settings</span>
        {pathname === '/settings' && (
          <div className="absolute left-0 w-[3px] h-8 bg-primary rounded-r-full" />
        )}
      </Link>
    </aside>
  );
}
