'use client';

import { useState } from 'react';
import GlobalNavDrawer from './GlobalNavDrawer';

/**
 * Floating global mobile-nav for pages that don't have their own sticky
 * bar (chat, saved). Renders a hamburger at top-left (md:hidden) plus
 * the shared GlobalNavDrawer. For pages with a sticky bar (scholarship
 * detail), use the drawer directly with a button styled to fit the bar.
 */
export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-3 left-3 z-30 w-11 h-11 bg-white/95 backdrop-blur shadow-lg border border-gray-200 rounded-xl flex items-center justify-center"
        aria-label="Open navigation menu"
      >
        <span className="material-symbols-outlined text-[22px] text-text-primary">menu</span>
      </button>
      <GlobalNavDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
