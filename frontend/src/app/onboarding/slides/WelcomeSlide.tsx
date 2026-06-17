'use client';

/**
 * WelcomeSlide — slide 0 of the onboarding carousel.
 *
 * A single, warm greeting. No checklist, no progress bar showing all
 * 5 steps at once. Just the user's name, a brief message, and a
 * "Next" button. This is the equivalent of the "welcome" screen in
 * best-in-class onboarding (Linear, Notion, Duolingo).
 */
export default function WelcomeSlide({ userName, onNext }: { userName: string; onNext: () => void }) {
  const displayName = userName || 'there';

  return (
    <div className="flex flex-col items-center text-center px-4 py-6">
      {/* Avatar / icon */}
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5 animate-onboarding-fade-in">
        <span className="material-symbols-outlined text-primary text-[40px]">waving_hand</span>
      </div>

      <h1 className="text-[28px] md:text-[32px] font-extrabold text-text-primary leading-tight animate-onboarding-slide-up">
        Hi {displayName}! <span aria-hidden>👋</span>
      </h1>

      <p className="text-[15px] md:text-[16px] text-text-secondary mt-3 max-w-md leading-relaxed animate-onboarding-slide-up">
        Let&apos;s learn a little about you so we can find the
        <span className="text-primary font-semibold"> best matching scholarships</span>
        {' '}for your background.
      </p>

      {/* Subtle preview of what's next — but not a checklist */}
      <div className="mt-7 flex items-center gap-2 text-[12px] text-text-secondary animate-onboarding-slide-up">
        <span className="material-symbols-outlined text-[16px] text-primary">bolt</span>
        <span>Takes about 60 seconds</span>
      </div>

      <button
        onClick={onNext}
        className="mt-8 px-10 py-3.5 bg-primary text-text-inverse text-[15px] font-bold rounded-btn shadow-lg shadow-primary/20 hover:brightness-110 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] transition-all animate-onboarding-slide-up"
      >
        Let&apos;s go
        <span className="material-symbols-outlined text-[18px] ml-1.5 align-middle">arrow_forward</span>
      </button>
    </div>
  );
}
