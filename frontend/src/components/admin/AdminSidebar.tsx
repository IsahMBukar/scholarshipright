'use client';

// Sidebar for the admin shell. Wider than the user-facing Sidebar (256px)
// and shows labels + a footer with the current admin identity.
// Renders nothing if `isAdmin` is false — we still want children to mount so
// the page can show its own "forbidden" state during the check.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ScrollText,
  Mail,
  ShieldCheck,
  Globe2,
} from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, href: '/admin' },
  { label: 'Users', icon: Users, href: '/admin/users' },
  { label: 'Scholarships', icon: GraduationCap, href: '/admin/scholarships' },
  { label: 'Country Groups', icon: Globe2, href: '/admin/groups' },
  { label: 'Audit', icon: ScrollText, href: '/admin/audit' },
  { label: 'Invites', icon: Mail, href: '/admin/invites' },
];

export interface AdminSidebarProps {
  adminEmail?: string;
  adminRole?: string;
}

export default function AdminSidebar({ adminEmail, adminRole }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex flex-col w-64 h-full bg-white border-r border-gray-200">
      {/* Brand */}
      <div className="flex items-center gap-3 h-16 px-5 border-b border-gray-200">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5 text-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-text-primary">ScholarshipRight</div>
          <div className="text-[11px] text-text-secondary">Admin Console</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 h-10 px-3 rounded-btn text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-gray-50 hover:text-text-primary'
              )}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer / identity */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="text-[11px] uppercase tracking-wide text-text-secondary mb-0.5">
          Signed in as
        </div>
        <div className="text-sm font-medium text-text-primary truncate">
          {adminEmail ?? '—'}
        </div>
        {adminRole && (
          <div className="text-[11px] text-text-secondary mt-0.5 capitalize">
            {adminRole.replace('_', ' ')}
          </div>
        )}
      </div>
    </aside>
  );
}
