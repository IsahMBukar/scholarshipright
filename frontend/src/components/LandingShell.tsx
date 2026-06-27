'use client';

// Shared landing subpage layout — floating nav + footer.
// Matches the landing page V7 DNA exactly.

import Link from 'next/link';
import '@/app/landing.css';

const NAV_LINKS = [
  { href: '/scholarships/category/fully-funded', label: 'Scholarships' },
  { href: '/features', label: 'Features' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/about', label: 'About' },
];

export default function LandingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1a1a] overflow-x-hidden">
      {/* ═══ FLOATING NAV — identical to landing page ═══ */}
      <nav className="fixed left-1/2 -translate-x-1/2 z-50 bg-white/80 backdrop-blur-xl border border-[#f0ebe0] rounded-full flex items-center shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] w-max max-w-[calc(100vw-1rem)] top-[clamp(0.5rem,0.4rem+0.3vw,1rem)] px-[clamp(0.5rem,0.25rem+0.6vw,1rem)] py-[clamp(0.25rem,0.2rem+0.2vw,0.5rem)] gap-[clamp(0.25rem,0.125rem+0.5vw,0.75rem)]">
        <Link href="/" className="flex items-center flex-shrink-0 gap-[clamp(0.25rem,0.2rem+0.3vw,0.5rem)] px-[clamp(0.125rem,0.05rem+0.3vw,0.5rem)]">
          <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-[clamp(1.25rem,0.5rem+1vw,2rem)] w-[clamp(1.25rem,0.5rem+1vw,2rem)] rounded-lg object-contain" />
          <span className="text-sm font-extrabold hidden sm:block">
            Scholarship<span className="text-[#f5b942]">Right</span>
          </span>
        </Link>
        <div className="w-px h-[clamp(1rem,0.7rem+0.4vw,1.25rem)] bg-[#f0ebe0] mx-[clamp(0.125rem,0.05rem+0.2vw,0.5rem)] hidden sm:block" />
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
                <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-9 w-9 rounded-lg object-contain" />
                <span className="text-lg font-extrabold">
                  Scholarship<span className="text-[#f5b942]">Right</span>
                </span>
              </Link>
              <p className="text-sm text-gray-600 max-w-[280px] leading-relaxed mb-5">
                AI matching + advisor for fully funded scholarships. Stop scrolling lists. Start getting matched.
              </p>
              <div className="flex gap-2">
                <a href="#" className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-500 hover:border-[#f5b942] hover:text-[#d4972e] transition text-sm font-bold" aria-label="X">
                  𝕏
                </a>
                <a href="#" className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-500 hover:border-[#f5b942] hover:text-[#d4972e] transition text-xs font-bold" aria-label="LinkedIn">
                  in
                </a>
                <a href="#" className="w-9 h-9 rounded-full border border-[#f0ebe0] flex items-center justify-center text-gray-500 hover:border-[#f5b942] hover:text-[#d4972e] transition text-sm" aria-label="Instagram">
                  ◯
                </a>
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
                <li><a href="#" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Blog</a></li>
                <li><a href="#" className="text-sm text-gray-600 hover:text-[#1a1a1a] transition">Help center</a></li>
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
