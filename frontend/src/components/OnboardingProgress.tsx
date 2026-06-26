'use client';

import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * A compact card shown on RightPanel and any other layout surface to nudge
 * mid-onboarding users toward their next step. Auto-hides once all steps are
 * complete so it never gets in the way of regular use.
 */
export default function OnboardingProgress() {
  const router = useRouter();
  const ob = useOnboarding();

  if (ob.loading) return null;
  if (!ob.authenticated) return null;
  if (ob.percent === 100) return null;

  return (
    <button
      onClick={() => router.push('/onboarding')}
      className="w-full text-left mb-4 p-3.5 rounded-2xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="material-symbols-outlined text-primary text-[18px]">rocket_launch</span>
        <p className="text-[12px] font-bold text-text-primary uppercase tracking-wide">
          Finish setting up
        </p>
        <span className="ml-auto text-[11px] font-semibold text-primary">{ob.percent}%</span>
      </div>
      <div className="w-full h-1.5 bg-primary/15 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${ob.percent}%` }}
        />
      </div>
      <p className="text-[12px] text-text-secondary leading-snug">
        <span className="font-semibold text-text-primary">Next: </span>
        {ob.next.title}
      </p>
      <p className="text-[11px] text-primary-readable font-semibold mt-1.5 group-hover:underline">
        Continue →
      </p>
    </button>
  );
}
