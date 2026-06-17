'use client';

import { markChatted } from '@/hooks/useOnboarding';

/**
 * ScholaraIntroSlide — slide 4 (final) of the onboarding carousel.
 *
 * Tries Scholara in 1 sentence, shows 3 sample prompts the user can
 * try, and offers "Open Scholara" or "Skip for now".
 *
 * Optional: the user can skip without consequences.
 */

const SAMPLE_PROMPTS = [
  { icon: 'auto_awesome', text: 'Am I eligible for DAAD scholarships?' },
  { icon: 'description', text: 'Help me write a motivation letter for a Master\'s application' },
  { icon: 'timeline', text: 'What should I prepare 6 months before applying?' },
];

export default function ScholaraIntroSlide({
  onComplete,
  onSkip,
}: {
  onComplete: () => void;
  onSkip: () => void;
}) {
  const handleOpen = () => {
    markChatted();
    onComplete();
  };

  return (
    <div className="px-4 py-3 max-w-xl mx-auto">
      <div className="text-center mb-5">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-primary text-[32px]">smart_toy</span>
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">
          Meet Scholara
        </h2>
        <p className="text-[13px] text-text-secondary mt-1 max-w-sm mx-auto">
          Your AI scholarship advisor. Ask anything about eligibility, applications, or strategy.
        </p>
      </div>

      {/* Sample prompts — clickable cards that prefill the chat */}
      <div className="space-y-2 mb-5">
        <p className="text-[11px] font-bold text-text-secondary uppercase tracking-wide">
          Try asking:
        </p>
        {SAMPLE_PROMPTS.map((p, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3.5 py-2.5 bg-white border border-gray-200 rounded-card hover:border-primary hover:bg-primary/5 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px] text-primary flex-shrink-0 mt-0.5">
              {p.icon}
            </span>
            <p className="text-[13px] text-text-primary leading-snug">
              &ldquo;{p.text}&rdquo;
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleOpen}
          className="flex-1 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">chat</span>
          Open Scholara
        </button>
        <a
          href="/scholarships"
          className="px-5 py-3 text-[13px] font-semibold text-text-secondary hover:text-primary transition-colors text-center"
        >
          Browse scholarships first →
        </a>
      </div>

      <button
        onClick={onSkip}
        className="mt-3 mx-auto block text-[12px] text-text-secondary/70 hover:text-text-secondary transition-colors"
      >
        Skip for now
      </button>

      <div className="mt-5 p-3 bg-green-50 border border-green-200 rounded-card text-center">
        <p className="text-[12px] text-green-800">
          <span className="material-symbols-outlined text-[14px] align-middle mr-0.5">celebration</span>
          You&apos;re all set! Profile complete + matches unlocked.
        </p>
      </div>
    </div>
  );
}
