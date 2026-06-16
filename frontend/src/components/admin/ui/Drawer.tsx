'use client';

// Slide-over drawer used for user detail / actions.

import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  // Render a sticky footer (e.g. action buttons).
  footer?: ReactNode;
  // Max width class — defaults to w-[420px].
  widthClass?: string;
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  widthClass = 'w-[420px]',
}: DrawerProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 transition-opacity',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      aria-hidden={!open}
    >
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside
        className={clsx(
          'absolute right-0 top-0 h-full bg-white shadow-xl flex flex-col transition-transform',
          widthClass,
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="flex items-center justify-between h-14 px-5 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-text-secondary"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="px-5 py-3 border-t border-gray-200 shrink-0 bg-gray-50/50">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
