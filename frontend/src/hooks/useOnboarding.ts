'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchProfile,
  fetchResumes,
  fetchMatches,
  fetchMe,
  type Profile,
  type Resume,
  createOrUpdateProfile,
} from '@/services/api';
import { createManualResume } from '@/services/api';

export type OnboardingStepId =
  | 'account'
  | 'source'
  | 'profile'
  | 'matches'
  | 'chat';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  icon: string;
  done: boolean;
  optional?: boolean;
}

export interface OnboardingState {
  loading: boolean;
  authenticated: boolean;
  // Source step
  hasResume: boolean;
  resume: Resume | null;
  resumeStatus: 'pending' | 'uploading' | 'analyzing' | 'completed' | 'error' | 'manual' | 'none';
  hasManualSource: boolean;
  sourcePath: 'none' | 'resume' | 'manual';
  // Profile step
  hasProfile: boolean;
  profile?: Profile | null;
  // Derived
  hasMatches: boolean;
  hasChatted: boolean;
  completed: OnboardingStepId[];
  next: OnboardingStep;
  all: OnboardingStep[];
  percent: number;
  refresh: () => Promise<void>;
  markManualSource: () => Promise<void>;
  saveProfileFields: (data: Partial<Profile>) => Promise<Profile | null>;
  // Profile-completion helpers
  getMissingCritical: (p?: Profile | Partial<Profile> | null) => string[];
  getMissingBoost: (p?: Profile | Partial<Profile> | null) => Array<{ label: string; points: number; icon: string }>;
  totalBoostPotential: number;
  // Slide carousel state
  slideIndex: number;
  setSlideIndex: (i: number) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  resetSlides: () => void;
  // Mark chat step done (localStorage + React state)
  markChattedNow: () => void;
}

// localStorage key bases. These are SCOPED per user at the call site
// (key becomes `${BASE}_${userId}`) so two users sharing the same
// browser never see each other's slide index / chat flag / manual
// source flag. The previous design used one global key per browser
// which meant registering a new account would resume the new user
// mid-onboarding where the previous user left off — see the regression
// test in test_onboarding_user_scoping.py.
const CHAT_FLAG_KEY = 'sr_chatted_v1';
const MANUAL_SOURCE_FLAG_KEY = 'sr_manual_source_v1';
const SLIDE_INDEX_KEY = 'sr_onboard_slide_v1';

function scopedKey(base: string, userId: string | null | undefined): string {
  // Fall back to a fixed suffix if the user id is missing — keeps the
  // keys stable enough that we can still find/clear them defensively.
  return `${base}_${userId || 'anon'}`;
}

const STEP_DEFS: Omit<OnboardingStep, 'done'>[] = [
  {
    id: 'account',
    title: 'Create your account',
    description: 'Sign up with email + password so we can save your progress.',
    href: '/signup',
    icon: 'how_to_reg',
  },
  {
    id: 'source',
    title: 'Add your details',
    description:
      'Upload a resume for auto-fill, or enter them manually. Either way works.',
    href: '/onboarding',
    icon: 'description',
  },
  {
    id: 'profile',
    title: 'Complete your profile',
    description:
      'Tell us your nationality, target degree and target countries so we can match scholarships to you.',
    href: '/profile',
    icon: 'person',
  },
  {
    id: 'matches',
    title: 'See your matches',
    description:
      'We compute which scholarships you are eligible for and how strong each fit is.',
    href: '/scholarships',
    icon: 'workspace_premium',
  },
  {
    id: 'chat',
    title: 'Chat with Scholara',
    description:
      'Ask the AI advisor anything about scholarships, eligibility, roadmaps, or application documents.',
    href: '/chat',
    icon: 'smart_toy',
  },
];

function isResumeUsable(r?: Resume | null): boolean {
  if (!r) return false;
  // A resume is usable if the AI has finished (or never ran) and the file is on disk.
  if (r.status === 'analyzing' || r.status === 'uploading') return false;
  return Boolean(r.id);
}

export function useOnboarding(): OnboardingState {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [resume, setResume] = useState<Resume | null | undefined>(undefined);
  const [matchesCount, setMatchesCount] = useState<number | undefined>(undefined);
  const [hasChatted, setHasChatted] = useState<boolean>(false);
  const [hasManualSource, setHasManualSource] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    // Auth state must come from /api/auth/me, NOT from /api/profile —
    // a brand-new user has no Profile row yet but IS authenticated.
    // Treat 401 as "not signed in"; everything else is fine.
    let meId: string | null = null;
    try {
      const me = await fetchMe();
      meId = me?.id ? String(me.id) : null;
      setAuthenticated(true);
      setUserId(meId);
    } catch {
      setAuthenticated(false);
      setUserId(null);
    }
    // Per-user localStorage reads so two accounts on the same browser
    // don't trample each other's state.
    if (typeof window !== 'undefined') {
      const uid = meId;
      setHasChatted(
        uid ? window.localStorage.getItem(scopedKey(CHAT_FLAG_KEY, uid)) === '1' : false
      );
      setHasManualSource(
        uid
          ? window.localStorage.getItem(scopedKey(MANUAL_SOURCE_FLAG_KEY, uid)) === '1'
          : false
      );
    }
    try {
      const [pRes, rRes, mRes] = await Promise.allSettled([
        fetchProfile(),
        fetchResumes(),
        fetchMatches(),
      ]);
      if (pRes.status === 'fulfilled') {
        setProfile(pRes.value);
      } else {
        setProfile(null);
      }
      if (rRes.status === 'fulfilled') {
        const list = rRes.value || [];
        const primary = list.find((r) => r.is_primary) || list[0];
        setResume(primary || null);
      } else {
        setResume(null);
      }
      if (mRes.status === 'fulfilled') {
        setMatchesCount(Array.isArray(mRes.value) ? mRes.value.length : 0);
      } else {
        setMatchesCount(0);
      }
    } catch {
      setProfile(null);
      setResume(null);
      setMatchesCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Mark manual path: persist flag + create stub resume so the profile
  // page's edit modals can save to a real resume record.
  const markManualSource = useCallback(async () => {
    if (typeof window !== 'undefined' && userId) {
      window.localStorage.setItem(scopedKey(MANUAL_SOURCE_FLAG_KEY, userId), '1');
    }
    setHasManualSource(true);
    // Best-effort: create the stub resume record on the backend so the
    // existing profile UI has something to write to.
    try {
      const stub = await createManualResume();
      // Refresh the resume state so the page sees the new record.
      const list = await fetchResumes();
      const primary = list.find((r) => r.is_primary) || list[0];
      setResume(primary || stub);
    } catch {
      /* offline / already-created — flag is enough to mark the step done */
    }
  }, [userId]);

  // ── Slide carousel state ─────────────────────────────────────────
  // We persist the current slide in localStorage so users can resume
  // exactly where they left off if they navigate away mid-onboarding.
  // Slides:
  //   0 = Welcome
  //   1 = Resume (upload or manual)
  //   2 = Profile (inline form)
  //   3 = Matches preview (optional)
  //   4 = Scholara intro (optional)
  const TOTAL_SLIDES = 5;
  const [slideIndex, setSlideIndexState] = useState<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!userId) return; // wait until we know who's asking
    const saved = window.localStorage.getItem(scopedKey(SLIDE_INDEX_KEY, userId));
    if (saved != null) {
      const n = parseInt(saved, 10);
      if (Number.isFinite(n) && n >= 0 && n < TOTAL_SLIDES) {
        setSlideIndexState(n);
      }
    }
  }, [userId]);

  const setSlideIndex = useCallback((i: number) => {
    const clamped = Math.max(0, Math.min(TOTAL_SLIDES - 1, i));
    setSlideIndexState(clamped);
    if (typeof window !== 'undefined' && userId) {
      window.localStorage.setItem(scopedKey(SLIDE_INDEX_KEY, userId), String(clamped));
    }
  }, [userId]);

  const nextSlide = useCallback(() => setSlideIndex(slideIndex + 1), [slideIndex, setSlideIndex]);
  const prevSlide = useCallback(() => setSlideIndex(slideIndex - 1), [slideIndex, setSlideIndex]);
  const resetSlides = useCallback(() => {
    if (typeof window !== 'undefined' && userId) {
      window.localStorage.removeItem(scopedKey(SLIDE_INDEX_KEY, userId));
    }
    setSlideIndexState(0);
  }, [userId]);

  // markChattedNow — flip the chat step to "done" both in localStorage
  // (persists across page loads) AND in React state (so the
  // OnboardingProgress reminder hides immediately and the
  // /onboarding redirect effect sees percent===100). The previous
  // version only wrote localStorage, which left users stuck on
  // slide 4 of the wizard even after clicking "Open Scholara" —
  // the React state had hasChatted=false so percent stayed 80%.
  // Standalone `markChatted` (exported at the bottom) is kept for
  // backward compatibility but new code should use this method.
  const markChattedNow = useCallback(() => {
    if (typeof window === 'undefined' || !userId) return;
    try {
      window.localStorage.setItem(scopedKey(CHAT_FLAG_KEY, userId), '1');
      setHasChatted(true);
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [userId]);

  // ── Save profile fields (used by the inline profile slide) ───────
  // Returns the saved Profile or null on failure. We refresh internal
  // state so the next /api/profile call sees the new values.
  const saveProfileFields = useCallback(
    async (data: Partial<Profile>): Promise<Profile | null> => {
      try {
        const saved = await createOrUpdateProfile(data);
        setProfile(saved as Profile);
        return saved as Profile;
      } catch (err) {
        console.error('saveProfileFields failed:', err);
        return null;
      }
    },
    []
  );

  const hasResume = isResumeUsable(resume);
  const hasProfile = isProfileComplete(profile);
  const hasMatches = (matchesCount ?? 0) > 0;

  const sourceDone = hasResume || hasManualSource;
  const sourcePath: 'none' | 'resume' | 'manual' = hasResume
    ? 'resume'
    : hasManualSource
    ? 'manual'
    : 'none';

  const resumeStatus: OnboardingState['resumeStatus'] = !resume
    ? 'none'
    : (resume.status as OnboardingState['resumeStatus']);

  const completed: OnboardingStepId[] = [];
  if (authenticated) completed.push('account');
  if (sourceDone) completed.push('source');
  if (hasProfile) completed.push('profile');
  if (hasMatches) completed.push('matches');
  if (hasChatted) completed.push('chat');

  const all: OnboardingStep[] = STEP_DEFS.map((s) => ({
    ...s,
    done: completed.includes(s.id),
  }));

  const next = all.find((s) => !s.done) || all[all.length - 1];

  return {
    loading,
    authenticated,
    hasResume,
    resume: resume ?? null,
    resumeStatus,
    hasManualSource,
    sourcePath,
    hasProfile,
    profile,
    hasMatches,
    hasChatted,
    completed,
    next,
    all,
    percent: Math.round((completed.length / all.length) * 100),
    refresh,
    markManualSource,
    saveProfileFields,
    getMissingCritical: getMissingCriticalFields,
    getMissingBoost: getMissingBoostFields,
    totalBoostPotential: getTotalBoostPotential(profile),
    slideIndex,
    setSlideIndex,
    nextSlide,
    prevSlide,
    resetSlides,
    markChattedNow,
  };
}

/* ─────────────────────────────────────────────────────────────────
   Standalone helpers — export so non-hook callers (like the profile
   page) can compute the same missing-fields breakdown without
   re-implementing the logic.
   ───────────────────────────────────────────────────────────────── */

export const CRITICAL_PROFILE_FIELDS = [
  { key: 'country_of_origin', label: 'Country of origin' },
  { key: 'target_degree', label: 'Target degree' },
] as const;

export const BOOST_PROFILE_FIELDS = [
  { key: 'cgpa', label: 'CGPA', points: 15, icon: 'grade' },
  { key: 'has_ielts', label: 'IELTS score', points: 8, icon: 'translate' },
  { key: 'target_countries', label: 'Target countries', points: 10, icon: 'public' },
  { key: 'degree_level', label: 'Current degree', points: 4, icon: 'school' },
] as const;

// Accept Partial<Profile> (the page's local state shape) as well as a
// fully-resolved Profile, so callers don't have to cast at every call site.
type AnyProfile = Profile | Partial<Profile> | null | undefined;

export function hasStudyField(p?: AnyProfile): boolean {
  return Boolean(p?.field_of_study || (p?.target_fields || []).length > 0);
}

export function isProfileComplete(p?: AnyProfile): boolean {
  if (!p) return false;
  return Boolean(p.country_of_origin && p.target_degree && hasStudyField(p));
}

export function getMissingCriticalFields(p?: AnyProfile): string[] {
  if (!p) return CRITICAL_PROFILE_FIELDS.map((f) => f.label);
  const missing: string[] = [];
  if (!p.country_of_origin) missing.push('Country of origin');
  if (!p.target_degree) missing.push('Target degree');
  if (!hasStudyField(p)) missing.push('Field of study');
  return missing;
}

export function getMissingBoostFields(
  p?: AnyProfile
): Array<{ label: string; points: number; icon: string }> {
  if (!p) return BOOST_PROFILE_FIELDS.map((b) => ({ label: b.label, points: b.points, icon: b.icon }));
  return BOOST_PROFILE_FIELDS.filter((f) => {
    const v = p[f.key as keyof typeof p];
    if (f.key === 'target_countries') return !v || (v as string[]).length === 0;
    if (f.key === 'has_ielts') return !(v as boolean);
    return v == null || v === '';
  }).map((b) => ({ label: b.label, points: b.points, icon: b.icon }));
}

export function getTotalBoostPotential(p?: AnyProfile): number {
  return getMissingBoostFields(p).reduce((sum, b) => sum + b.points, 0);
}

export function markChatted(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      window.localStorage.setItem(scopedKey(CHAT_FLAG_KEY, userId), '1');
    }
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function clearManualSourceFlag(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (userId) {
      window.localStorage.removeItem(scopedKey(MANUAL_SOURCE_FLAG_KEY, userId));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Wipe ALL onboarding localStorage keys for the given user. Called from
 * the logout flow so a fresh signup on the same browser doesn't inherit
 * the previous user's slide index, chat flag, or manual-source flag.
 *
 * Also scans for the legacy unscoped keys (from before per-user scoping)
 * and removes them defensively.
 */
export function clearOnboardingForUser(userId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    const ls = window.localStorage;
    // Scoped keys for this user
    if (userId) {
      ls.removeItem(scopedKey(SLIDE_INDEX_KEY, userId));
      ls.removeItem(scopedKey(MANUAL_SOURCE_FLAG_KEY, userId));
      ls.removeItem(scopedKey(CHAT_FLAG_KEY, userId));
    }
    // Legacy unscoped keys (pre-fix). Safe to remove — anything still
    // using them is relying on the buggy behavior we're fixing.
    ls.removeItem(SLIDE_INDEX_KEY);
    ls.removeItem(MANUAL_SOURCE_FLAG_KEY);
    ls.removeItem(CHAT_FLAG_KEY);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
