'use client';

import { type ReactNode } from 'react';

/**
 * SlideShell — the consistent wrapper around every slide.
 *
 * Renders:
 *   - Top: small brand mark + step dots (clickable to navigate)
 *   - Middle: the slide content (passed as children)
 *   - Bottom: small "Skip onboarding" link
 *
 * The dots are clickable indicators for power users who want to jump
 * to a specific slide.
 */

const SLIDE_LABELS = ['Welcome', 'Resume', 'Profile', 'Matches', 'Scholara'];

export default function SlideShell({
  index,
  total,
  onBack,
  onSkip,
  onGoTo,
  showBack,
  children,
}: {
  index: number;
  total: number;
  onBack: () => void;
  onSkip: () => void;
  onGoTo?: (i: number) => void;
  showBack: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex flex-col">
      {/* Top bar */}
      <div className="w-full max-w-2xl mx-auto px-4 pt-5 flex items-center justify-between">
        <a
          href="/scholarships"
          className="text-[18px] font-extrabold text-primary tracking-tight"
        >
          ScholarshipRight
        </a>
        <button
          onClick={onSkip}
          className="text-[12px] text-text-secondary hover:text-text-primary transition-colors"
        >
          Skip onboarding →
        </button>
      </div>

      {/* Step dots — clickable for navigation */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-4 flex items-center justify-center gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onGoTo?.(i)}
            disabled={!onGoTo}
            aria-label={`Step ${i + 1} of ${total}: ${SLIDE_LABELS[i]}`}
            className={`h-1.5 rounded-full transition-all duration-500 ${
              i === index
                ? 'w-8 bg-primary'
                : i < index
                ? 'w-1.5 bg-primary/40'
                : 'w-1.5 bg-gray-200'
            } ${onGoTo ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center w-full px-4 py-6 overflow-y-auto">
        <div className="w-full max-w-xl">
          <div key={index} className="animate-onboarding-slide-in-right">
            {children}
          </div>
        </div>
      </div>

      {/* Back button (slides 1+, except welcome) */}
      {showBack && (
        <div className="w-full max-w-2xl mx-auto px-4 pb-5">
          <button
            onClick={onBack}
            className="text-[12px] text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            Back
          </button>
        </div>
      )}
    </div>
  );
}
