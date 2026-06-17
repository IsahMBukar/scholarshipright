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

  // ── Redirect completed users away from /onboarding ──────────────
  // A user is "completed" when they have a source (resume or manual
  // stub) AND a complete profile. We only redirect on the FIRST
  // render after data loads — if they navigate back to /onboarding
  // mid-flow, the slideIndex is already > 0 and we let them finish.
  //
  // We intentionally do NOT depend on ob.slideIndex here, because
  // for a completed user the persisted slideIndex is usually 3 or 4
  // (they finished), and a hard redirect is the right behavior
  // regardless. The mid-flow protection comes from checking the
  // FRESH state: if the user has been on this page for a while and
  // has touched the slideIndex, that state is already > 0 and the
  // check below wouldn't redirect them anyway.
  useEffect(() => {
    if (ob.loading) return;
    // A returning user mid-flow has ob.slideIndex > 0. Don't redirect.
    if (ob.slideIndex > 0) return;
    // A completed user has BOTH a source and a complete profile.
    if (ob.hasResume && ob.hasProfile) {
      router.push('/scholarships');
    }
    // hasManualSource covers users who picked "I don't have a resume"
    // and filled in the manual path instead.
    else if (ob.hasManualSource && ob.hasProfile) {
      router.push('/scholarships');
    }
  }, [ob.loading, ob.hasResume, ob.hasProfile, ob.hasManualSource, ob.slideIndex, router]);

  if (!authChecked || ob.loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-text-secondary">Loading…</div>
      </div>
    );
  }

  const handleSkipAll = () => {
    ob.resetSlides();
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
            ob.resetSlides();
            router.push('/scholarships');
          }}
        />
      )}
    </SlideShell>
  );
}
