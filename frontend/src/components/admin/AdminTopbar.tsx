'use client';

// Topbar for the admin shell. Title from props, optional right-side actions.

import { type ReactNode } from 'react';

export interface AdminTopbarProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export default function AdminTopbar({ title, description, actions }: AdminTopbarProps) {
  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="flex items-center justify-between gap-4 h-16 px-6">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-text-primary truncate">{title}</h1>
          {description && (
            <p className="text-xs text-text-secondary truncate">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
