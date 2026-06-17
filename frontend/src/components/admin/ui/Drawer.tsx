'use client';

// Slide-over drawer used for user detail / actions.
//
// Accessibility:
//   - role="dialog" + aria-modal="true" + aria-label={title}
//   - Focus trap: Tab/Shift+Tab cycle within the drawer
//   - Focus restoration: when closed, focus returns to the element that opened it
//   - Escape closes
//   - Click on backdrop closes
//   - Body scroll locked while open
//   - When opening, focus moves to the first focusable element (close button)

import { type ReactNode, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Element that was focused before the drawer opened — restored on close.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Lock body scroll, capture trigger, focus close button.
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Wait a tick for the drawer to render before focusing.
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever opened the drawer.
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  // Close on Escape + focus trap.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      // Focus trap: cycle within the dialog.
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialogRef.current.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onBackdropClick = useCallback(() => onClose(), [onClose]);

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
        onClick={onBackdropClick}
        aria-hidden="true"
      />
      <aside
        ref={dialogRef}
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
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-gray-100 flex items-center justify-center text-text-secondary"
            aria-label="Close drawer"
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
