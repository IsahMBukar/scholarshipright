'use client';

import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/hooks/useOnboarding';
import type { ReactNode } from 'react';

interface Props {
  /** Which step must be done before the children render. */
  requires: 'profile' | 'resume' | 'matches';
  /** Friendly title for the blocked-state card. */
  title: string;
  /** Helpful explanation of why this gate exists. */
  description: string;
  /** Material icon name for the hero block. */
  icon: string;
  /** Optional children rendered *after* the checklist block. */
  children?: ReactNode;
}

/**
 * In-page empty-state for missing prerequisites. Renders a friendly "next step"
 * card instead of the bare page when the user hasn't completed onboarding.
 * Pass `children` if you still want to show a partial/preview of the page
 * (e.g. a disabled chat input) below the callout.
 */
export default function OnboardingGate({ requires, title, description, icon, children }: Props) {
  const router = useRouter();
  const ob = useOnboarding();

  if (ob.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-text-secondary text-[13px]">
        <span className="material-symbols-outlined text-[28px] mb-2 animate-pulse">hourglass_empty</span>
        Loading your progress…
      </div>
    );
  }

  const passed =
    (requires === 'profile' && ob.hasProfile) ||
    (requires === 'resume' && ob.hasResume) ||
    (requires === 'matches' && ob.hasMatches);

  if (passed) return <>{children}</>;

  // Friendly ordering of which step is next, given what's missing.
  const pending = ob.all.filter((s) => !s.done);

  return (
    <div className="px-4 md:px-6 py-10 max-w-[720px] mx-auto">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary-light flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-primary text-[28px]">{icon}</span>
          </div>
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold text-text-primary">{title}</h2>
            <p className="text-[14px] text-text-secondary mt-1">{description}</p>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between text-[12px] text-text-secondary font-semibold mb-1.5">
            <span>YOUR ONBOARDING PROGRESS</span>
            <span>{ob.percent}%</span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${ob.percent}%` }}
            />
          </div>
        </div>

        <ul className="space-y-2 mb-6">
          {ob.all.map((step) => (
            <li
              key={step.id}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${
                step.done
                  ? 'border-green-200 bg-green-50/60'
                  : pending[0]?.id === step.id
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <span
                className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.done ? 'bg-green-500 text-white' : 'bg-gray-100 text-text-secondary'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {step.done ? 'check' : step.icon}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-[13px] font-semibold ${
                    step.done ? 'text-green-700 line-through' : 'text-text-primary'
                  }`}
                >
                  {step.title}
                </p>
                {!step.done && (
                  <p className="text-[12px] text-text-secondary truncate">{step.description}</p>
                )}
              </div>
              {!step.done && pending[0]?.id === step.id && (
                <button
                  onClick={() => router.push(step.href)}
                  className="px-3 py-1.5 bg-primary text-text-inverse text-[12px] font-bold rounded-btn hover:brightness-110 transition-all flex-shrink-0"
                >
                  Start →
                </button>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => router.push(ob.next.href)}
            className="px-5 py-2.5 bg-primary text-text-inverse text-[14px] font-bold rounded-btn hover:brightness-110 transition-all"
          >
            {ob.next.id === 'chat' ? 'Open Scholara →' : `Continue: ${ob.next.title} →`}
          </button>
          <button
            onClick={() => router.push('/onboarding')}
            className="px-5 py-2.5 bg-gray-100 text-text-primary text-[14px] font-semibold rounded-btn hover:bg-gray-200 transition-all"
          >
            See full checklist
          </button>
        </div>
      </div>
    </div>
  );
}
