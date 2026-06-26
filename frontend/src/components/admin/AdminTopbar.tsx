'use client';

// Topbar for the admin shell. Title from props, optional right-side actions.
// Shows breadcrumb: Home > Admin > [Current Page]

import { type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';

export interface AdminTopbarProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function AdminTopbar({ title, description, actions }: AdminTopbarProps) {
  const pathname = usePathname();
  const isRootAdmin = pathname === '/admin';

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="flex items-center justify-between gap-4 px-6 py-2.5">
        <div className="min-w-0">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-xs text-text-secondary">
            <Link href="/admin" className="hover:text-primary transition-colors">
              <Home className="w-3 h-3" />
            </Link>
            <ChevronRight className="w-3 h-3" />
            {isRootAdmin ? (
              <span className="text-text-primary font-medium">Dashboard</span>
            ) : (
              <>
                <Link href="/admin" className="hover:text-primary transition-colors">
                  Admin
                </Link>
                <ChevronRight className="w-3 h-3" />
                <span className="text-text-primary font-medium">{title}</span>
              </>
            )}
          </nav>
          {description && (
            <p className="text-xs text-text-secondary truncate">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
