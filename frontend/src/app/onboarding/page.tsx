'use client';

// /onboarding — slide carousel for new users.
//
// Flow (5 slides):
//   0. Welcome        → friendly greeting + "Let's go" button
//   1. Resume         → upload CV, or "I don't have one" → manual entry
//   2. Profile        → inline form for 4 critical fields (no redirect)
//   3. Matches        → OPTIONAL preview of real scholarships
//   4. Scholara       → OPTIONAL intro to the AI advisor
//
// The 2 required slides (1, 2) and the 2 optional slides (3, 4) all
// live in this page. Each slide can call onNext() or be skipped via
// the small link in the top-right ("Skip onboarding →").
//
// Access policy:
//   - Not signed in                → redirect to /login
//   - Brand-new user               → show carousel (slides 0 → 1 → 2 → ...)
//   - User mid-onboarding          → show the slide they left off on
//   - User has finished (has
//     resume + complete profile)   → redirect to /scholarships
//
// "Finished" = both source (resume OR manual stub) AND a complete
// profile (country_of_origin + target_degree + field_of_study). The
// optional matches / Scholara slides do NOT block this — those are
// nice-to-have intros, not prerequisites for using the app.
//
// We intentionally do NOT auto-advance to slide 3 for completed
// users. The previous version did that, which meant a returning
// completed user could "live" on /onboarding forever, never getting
// to /scholarships. The hard redirect is the correct UX: if you
// don't need onboarding, you shouldn't see it.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOnboarding } from '@/hooks/useOnboarding';
import SlideShell from './slides/SlideShell';
import WelcomeSlide from './slides/WelcomeSlide';
import ResumeSlide from './slides/ResumeSlide';
import ProfileSlide from './slides/ProfileSlide';
import MatchesPreviewSlide from './slides/MatchesPreviewSlide';
import ScholaraIntroSlide from './slides/ScholaraIntroSlide';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const TOTAL_SLIDES = 5;

export default function OnboardingPage() {
  const router = useRouter();
  const ob = useOnboarding();
  const [userName, setUserName] = useState('');
  const [authChecked, setAuthChecked] = useState(false);

  // Auth check (separate from profile fetch — see useOnboarding)
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          setUserName(data.full_name || data.email?.split('@')[0] || 'there');
        } else {
          router.push('/login');
        }
      })
      .catch(() => router.push('/login'))
      .finally(() => setAuthChecked(true));
  }, [router]);

  // ── Redirect when user has nothing left to gain from the wizard ──
  // "Done" means all 5 onboarding steps are complete:
  //   account + source (resume/manual) + profile + matches + chat.
  // A user mid-wizard (e.g. on slide 3 with resume+profile already
  // uploaded) keeps their place and is NOT redirected — that's the
  // "Finish Setup" reminder flow. They can come back and pick up
  // from where they left off.
  //
  // This replaced the old `hasResume && hasProfile` check, which
  // incorrectly fired on slide 3 mid-wizard (a user who uploaded a
  // resume and filled the profile at slides 1-2 has both flags true
  // before they ever see the matches/Scholara slides). The percent
  // signal is stricter and matches what the reminder UI cares about
  // (it hides at 100% too — see OnboardingProgress).
  useEffect(() => {
    if (ob.loading) return;
    if (ob.percent === 100) {
      router.push('/scholarships');
    }
  }, [ob.loading, ob.percent, router]);

  if (!authChecked || ob.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading…</div>
      </div>
    );
  }

  const handleSkipAll = () => {
    // Do NOT reset slideIndex — the user can re-enter /onboarding later
    // via the "Finish Setup" reminder (onboardingProgress card) and
    // resume from this slide. The /onboarding page already redirects
    // completed users (hasResume && hasProfile) away, so a stale
    // slideIndex won't trap them in the wizard.
    router.push('/scholarships');
  };

  return (
    <SlideShell
      index={ob.slideIndex}
      total={TOTAL_SLIDES}
      onBack={ob.prevSlide}
      onSkip={handleSkipAll}
      showBack={ob.slideIndex > 0}
    >
      {ob.slideIndex === 0 && (
        <WelcomeSlide
          userName={userName}
          onNext={() => {
            // Welcome → Resume. If user already has a resume (uploaded
            // earlier, e.g. from /resume?return=), skip to Profile.
            if (ob.hasResume || ob.hasManualSource) {
              ob.setSlideIndex(2);
            } else {
              ob.setSlideIndex(1);
            }
          }}
        />
      )}

      {ob.slideIndex === 1 && (
        <ResumeSlide
          initialStatus={ob.resumeStatus}
          onComplete={async () => {
            await ob.refresh();
            ob.setSlideIndex(2);
          }}
          onSkip={() => ob.setSlideIndex(2)}
          onMarkManual={ob.markManualSource}
        />
      )}

      {ob.slideIndex === 2 && (
        <ProfileSlide
          initialProfile={ob.profile}
          onSave={ob.saveProfileFields}
          onNext={async () => {
            // Profile saved → refresh derived state (hasProfile, etc.) and
            // jump to the matches preview slide.
            await ob.refresh();
            ob.setSlideIndex(3);
          }}
          onSkip={() => ob.setSlideIndex(3)}
        />
      )}

      {ob.slideIndex === 3 && (
        <MatchesPreviewSlide
          onContinue={() => ob.setSlideIndex(4)}
          onSkip={() => ob.setSlideIndex(4)}
        />
      )}

      {ob.slideIndex === 4 && (
        <ScholaraIntroSlide
          onComplete={() => router.push('/chat')}
          onSkip={() => {
            // No resetSlides — slideIndex stays at 4, completion is
            // derived from hasResume && hasProfile in the redirect effect.
            router.push('/scholarships');
          }}
        />
      )}
    </SlideShell>
  );
}
