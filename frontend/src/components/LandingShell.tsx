'use client';

// Shared landing subpage layout — mobile slide drawer nav + desktop floating pill + footer.
// Matches the landing page V8 DNA (slide drawer on mobile, floating pill on desktop).

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import '@/app/landing.css';

const NAV_LINKS = [
  { href: '/scholarships/category/fully-funded', label: 'Scholarships', icon: '🎓' },
  { href: '/how-it-works', label: 'How It Works', icon: '✦' },
  { href: '/features', label: 'Features', icon: '⚡' },
  { href: '/blog', label: 'Blog', icon: '📝' },
  { href: '/about', label: 'About', icon: 'ℹ' },
];

const ACCOUNT_LINKS = [
  { href: '/login', label: 'Sign in', icon: '👤' },
  { href: '/faq', label: 'Help & FAQ', icon: '❓' },
];

export default function LandingShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => {
    setDrawerOpen((prev) => {
      document.body.style.overflow = !prev ? 'hidden' : '';
      return !prev;
    });
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    document.body.style.overflow = '';
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1a1a] overflow-x-hidden">
      {/* ═══ MOBILE NAV — topbar + slide drawer ═══════════════════ */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] md:max-w-none z-50 flex items-center justify-between px-4 py-3 bg-[#fdfbf7]/85 backdrop-blur-xl border-b border-[#f0ebe0] md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={28} height={28} priority className="h-7 w-7 rounded-lg object-contain" />
          <span className="text-[15px] font-extrabold">
            Scholarship<span className="text-[#f5b942]">Right</span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/scholarships/category/fully-funded" className="text-xs font-semibold text-gray-600 px-3 py-1.5 rounded-full hover:bg-[#f5b942]/10 transition">
            Scholarships
          </Link>
          <button
            onClick={toggleDrawer}
            className="w-9 h-9 rounded-[10px] border border-[#f0ebe0] bg-white flex flex-col items-center justify-center gap-[4px] cursor-pointer"
            aria-label="Open menu"
          >
            <span className={`block w-4 h-[2px] bg-[#1a1a1a] rounded-full transition-all duration-300 ${drawerOpen ? 'rotate-45 translate-y-[6px]' : ''}`} />
            <span className={`block w-4 h-[2px] bg-[#1a1a1a] rounded-full transition-all duration-300 ${drawerOpen ? 'opacity-0 scale-x-0' : ''}`} />
            <span className={`block w-4 h-[2px] bg-[#1a1a1a] rounded-full transition-all duration-300 ${drawerOpen ? '-rotate-45 -translate-y-[6px]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Scrim */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-[150] bg-[#1a1a1a]/40 backdrop-blur-sm md:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* Slide drawer */}
      <div className={`fixed top-0 right-0 w-[300px] max-w-[85vw] h-full z-[160] bg-white shadow-[-8px_0_40px_rgba(0,0,0,0.08)] flex flex-col transition-transform duration-[400ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:hidden ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#f0ebe0]">
          <div className="flex items-center gap-2">
            <Image src="/images/logo-light.jpg" alt="" width={24} height={24} className="h-6 w-6 rounded-md object-contain" />
            <span className="text-sm font-bold">Menu</span>
          </div>
          <button onClick={closeDrawer} className="w-8 h-8 rounded-lg bg-[#fdfbf7] flex items-center justify-center text-gray-400 text-lg" aria-label="Close menu">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 pb-1.5 pt-2">Navigate</p>
          <nav className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeDrawer}
                className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-[15px] font-semibold text-[#1a1a1a] hover:bg-[#fdfbf7] active:bg-[#fdfbf7] transition"
              >
                <span className="w-9 h-9 rounded-[10px] bg-[#f5f3ee] flex items-center justify-center text-base flex-shrink-0">{link.icon}</span>
                <span>{link.label}</span>
                <span className="ml-auto text-gray-300 text-sm">›</span>
              </Link>
            ))}
          </nav>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 pb-1.5 pt-4">Account</p>
          <nav className="flex flex-col">
            {ACCOUNT_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeDrawer}
                className="flex items-center gap-3 px-3 py-3.5 rounded-xl text-[15px] font-semibold text-[#1a1a1a] hover:bg-[#fdfbf7] active:bg-[#fdfbf7] transition"
              >
                <span className="w-9 h-9 rounded-[10px] bg-[#f5f3ee] flex items-center justify-center text-base flex-shrink-0">{link.icon}</span>
                <span>{link.label}</span>
                <span className="ml-auto text-gray-300 text-sm">›</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="px-5 py-4 border-t border-[#f0ebe0]">
          <Link
            href="/signup"
            onClick={closeDrawer}
            className="flex items-center justify-center w-full py-3.5 bg-[#f5b942] text-[#1a1a1a] text-sm font-bold rounded-xl hover:bg-[#d4972e] transition"
          >
            Start free →
          </Link>
          <div className="flex justify-center gap-4 mt-3">
            <Link href="/privacy" className="text-xs text-gray-400">Privacy</Link>
            <Link href="/terms" className="text-xs text-gray-400">Terms</Link>
            <Link href="/contact" className="text-xs text-gray-400">Contact</Link>
          </div>
        </div>
      </div>

      {/* ═══ DESKTOP NAV — floating pill (visible md+) ═════════════ */}
      <nav className="hidden md:flex fixed left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-xl border border-[#f0ebe0] rounded-full items-center shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] w-max max-w-[calc(100vw-1rem)] top-[clamp(0.5rem,0.4rem+0.3vw,1rem)] px-[clamp(0.5rem,0.25rem+0.6vw,1rem)] py-[clamp(0.25rem,0.2rem+0.2vw,0.5rem)] gap-[clamp(0.25rem,0.125rem+0.5vw,0.75rem)]">
        <Link href="/" className="flex items-center flex-shrink-0 gap-[clamp(0.25rem,0.2rem+0.3vw,0.5rem)] px-[clamp(0.125rem,0.05rem+0.3vw,0.5rem)]">
          <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={32} height={32} className="h-[clamp(1.25rem,0.5rem+1vw,2rem)] w-[clamp(1.25rem,0.5rem+1vw,2rem)] rounded-lg object-contain" />
          <span className="text-sm font-extrabold">
            Scholarship<span className="text-[#f5b942]">Right</span>
          </span>
        </Link>
        <div className="w-px h-[clamp(1rem,0.7rem+0.4vw,1.25rem)] bg-[#f0ebe0] mx-[clamp(0.125rem,0.05rem+0.2vw,0.5rem)]" />
        <div className="flex items-center gap-[clamp(0.25rem,0.125rem+0.5vw,0.75rem)]">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-[clamp(0.125rem,0.05rem+0.7vw,0.75rem)] py-[clamp(0.25rem,0.2rem+0.2vw,0.375rem)] text-[clamp(0.625rem,0.55rem+0.6vw,0.875rem)] font-medium text-gray-600 hover:text-[#1a1a1a] rounded-full hover:bg-[#fdfbf7] transition whitespace-nowrap"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <Link
          href="/signup"
          className="ml-[clamp(0.125rem,0.05rem+0.3vw,0.5rem)] flex-shrink-0 inline-flex items-center justify-center w-[4.5rem] h-[1.75rem] sm:w-[6.5rem] sm:h-[2.25rem] md:w-[8rem] md:h-[2.5rem] text-[0.625rem] sm:text-sm md:text-base font-semibold text-[#1a1a1a] bg-[#f5b942] rounded-full hover:bg-[#d4972e] hover:text-white transition whitespace-nowrap"
        >
          Start free
        </Link>
      </nav>

      {/* ═══ PAGE CONTENT ═══ */}
      <main>{children}</main>

      {/* ═══ FOOTER — identical to landing page ═══ */}
      <footer className="border-t border-[#f0ebe0] bg-white/50">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-12 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-10">
            {/* Brand column */}
            <div className="col-span-2 md:col-span-2">
              <Link href="/" className="flex items-center gap-2.5 mb-4">
                <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={36} height={36} className="h-9 w-9 rounded-lg object-contain" />
                <span className="text-lg font-extrabold">
                  Scholarship<span className="text-[#f5b942]">Right</span>
                </span>
              </Link>
              <p className="text-sm text-gray-600 max-w-[280px] leading-relaxed mb-5">
                AI matching + advisor for fully funded scholarships. Stop scrolling lists. Start getting matched.
              </p>
              <div className="flex gap-2">
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-sm font-bold" title="Coming soon" aria-label="X (coming soon)">
                  𝕏
                </span>
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-xs font-bold" title="Coming soon" aria-label="LinkedIn (coming soon)">
                  in
                </span>
                <span className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-400 opacity-50 cursor-not-allowed text-sm" title="Coming soon" aria-label="Instagram (coming soon)">
                  ◯
                </span>
              </div>
            </div>
            {/* Product */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Product</h4>
              <ul className="space-y-2.5">
                <li><Link href="/how-it-works" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">How it works</Link></li>
                <li><Link href="/how-it-works#matching" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">AI Matching</Link></li>
                <li><Link href="/how-it-works#advisor" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Scholara Advisor</Link></li>
                <li><Link href="/features" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Features</Link></li>
              </ul>
            </div>
            {/* Resources */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Resources</h4>
              <ul className="space-y-2.5">
                <li><Link href="/scholarships/category/fully-funded" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Scholarship database</Link></li>
                <li><Link href="/faq" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">FAQ</Link></li>
                <li><Link href="/blog" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Blog</Link></li>
                <li><Link href="/faq" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Help center</Link></li>
              </ul>
            </div>
            {/* Company */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Company</h4>
              <ul className="space-y-2.5">
                <li><Link href="/about" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">About</Link></li>
                <li><Link href="/contact" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Contact</Link></li>
                <li><Link href="/privacy" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Privacy</Link></li>
                <li><Link href="/terms" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Terms</Link></li>
              </ul>
            </div>
          </div>
          {/* Bottom bar */}
          <div className="pt-6 border-t border-[#f0ebe0] flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-gray-500">© 2026 ScholarshipRight. All rights reserved.</p>
            <p className="text-xs text-gray-400">Made for students who deserve fully funded.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
