'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchProfile, fetchSavedScholarships, fetchScholarships, type Profile, type Scholarship } from '@/services/api';
import { useRouter } from 'next/navigation';
import NotificationBell from './NotificationBell';
import OnboardingProgress from './OnboardingProgress';
import { getDeadlineInfo } from './scholarship/ScholarshipAtoms';

// ── Module-level cache ────────────────────────────────────────────
// Stale-while-revalidate: first mount shows cached data instantly and
// re-fetches in background. Subsequent mounts within STALE_MS reuse
// the cache without a network round-trip. Prevents 3 API calls on
// every page navigation that uses AppLayout.
const STALE_MS = 60_000; // 1 minute

interface CachedData {
  profile: Profile | null;
  scholarshipCount: number;
  savedCount: number;
  appliedCount: number;
  deadlines: Array<{ name: string; slug: string; days: number; deadline: string; openDate?: string | null }>;
}

let cachedData: CachedData | null = null;
let cacheTimestamp = 0;

function isStale() {
  return !cachedData || Date.now() - cacheTimestamp > STALE_MS;
}

async function loadRightPanelData(): Promise<CachedData> {
  const [profileData, scholarships, saved] = await Promise.allSettled([
    fetchProfile(),
    fetchScholarships({ limit: '100' }),
    fetchSavedScholarships(),
  ]);

  const profile = profileData.status === 'fulfilled' ? profileData.value : null;

  let scholarshipCount = 0;
  let deadlines: CachedData['deadlines'] = [];
  if (scholarships.status === 'fulfilled') {
    scholarshipCount = scholarships.value.total;
    const now = new Date();
    deadlines = scholarships.value.items
      .filter(s => s.deadline && new Date(s.deadline) > now)
      .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
      .slice(0, 5)
      .map(s => {
        const days = Math.ceil((new Date(s.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { name: s.name, slug: s.slug, days, deadline: s.deadline, openDate: s.open_date };
      });
  }

  let savedCount = 0;
  let appliedCount = 0;
  if (saved.status === 'fulfilled') {
    savedCount = saved.value.length;
    const appliedStatuses = ['applying', 'applied', 'reviewing', 'accepted'];
    appliedCount = saved.value.filter((s: { status?: string }) => appliedStatuses.includes(s.status || '')).length;
  }

  return { profile, scholarshipCount, savedCount, appliedCount, deadlines };
}

export default function RightPanel() {
  const router = useRouter();
  const [data, setData] = useState<CachedData>(() => cachedData || {
    profile: null, scholarshipCount: 0, savedCount: 0, appliedCount: 0, deadlines: [],
  });
  const [loading, setLoading] = useState(() => isStale());

  useEffect(() => {
    // If cache is fresh, use it directly (already set in initial state)
    if (!isStale()) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    loadRightPanelData()
      .then((fresh) => {
        if (cancelled) return;
        cachedData = fresh;
        cacheTimestamp = Date.now();
        setData(fresh);
      })
      .catch((err) => {
        console.error('RightPanel load error:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Memoize profile completion calculation
  const completionPct = useMemo(() => {
    const p = data.profile;
    const fields = [
      p?.degree_level,
      p?.field_of_study,
      p?.university,
      p?.country_of_origin,
      p?.target_degree,
      p?.target_countries?.length,
      p?.cgpa,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [data.profile]);

  // Memoize derived display values
  const { initial, displayName } = useMemo(() => {
    const p = data.profile;
    return {
      initial: p?.field_of_study?.[0]?.toUpperCase() || p?.university?.[0]?.toUpperCase() || 'U',
      displayName: p?.university || 'Student',
    };
  }, [data.profile]);

  const stats = useMemo(() => [
    { label: 'Matched', value: data.scholarshipCount, icon: 'school', href: '/scholarships' },
    { label: 'Saved', value: data.savedCount, icon: 'bookmark', href: '/scholarships' },
    { label: 'Applied', value: data.appliedCount, icon: 'send', href: '/scholarships' },
  ], [data.scholarshipCount, data.savedCount, data.appliedCount]);

  const tipText = useMemo(() => {
    if (completionPct < 50) return 'Complete your profile to get better scholarship matches. Add your research interests and target countries.';
    if (completionPct < 80) return 'Great progress! Add your IELTS score and publications to improve match accuracy.';
    return 'Your profile looks strong! Check your matches and start applying to top scholarships.';
  }, [completionPct]);

  return (
    <aside className="hidden xl:flex flex-col w-[240px] h-full border-l border-gray-200 bg-white p-5 overflow-y-auto">
      {/* Notification Bell */}
      <div className="flex justify-end mb-4">
        <NotificationBell />
      </div>

      {/* Onboarding progress (auto-hides once everything is done) */}
      <OnboardingProgress />
      {/* Profile Summary */}
      <button onClick={() => router.push('/profile')} className="mb-6 text-left group">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-text-inverse font-bold text-[16px]">
            {loading ? '...' : initial}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text-primary group-hover:text-primary transition-colors">
              {loading ? 'Loading...' : displayName}
            </p>
            <p className="text-[12px] text-text-secondary">
              {loading ? '...' : `Profile ${completionPct}% complete`}
            </p>
          </div>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${loading ? 0 : completionPct}%` }}
          />
        </div>
      </button>

      {/* Quick Stats */}
      <div className="space-y-3 mb-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary">Quick Stats</h4>
        {stats.map((stat) => (
          <button
            key={stat.label}
            onClick={() => router.push(stat.href)}
            className="flex items-center justify-between py-2 w-full hover:bg-gray-50 rounded px-1 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-text-secondary">{stat.icon}</span>
              <span className="text-[13px] text-text-secondary">{stat.label}</span>
            </div>
            <span className="text-[14px] font-bold text-text-primary">
              {loading ? '...' : stat.value}
            </span>
          </button>
        ))}
      </div>

      {/* Tip — dynamic based on profile */}
      <div className="bg-primary-light rounded-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-[20px]">lightbulb</span>
          <h4 className="text-[13px] font-bold text-text-primary">Tip</h4>
        </div>
        <p className="text-[12px] text-text-secondary leading-relaxed">{tipText}</p>
      </div>

      {/* Upcoming Deadlines */}
      <div className="mt-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary mb-3">Upcoming Deadlines</h4>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : data.deadlines.length > 0 ? (
          <div className="space-y-2">
            {data.deadlines.map((item) => {
              const dl = getDeadlineInfo(item.deadline);
              return (
              <button
                key={item.slug}
                onClick={() => router.push(`/scholarships/${item.slug}`)}
                className="flex items-center justify-between py-1.5 w-full hover:bg-gray-50 rounded px-1 transition-colors"
              >
                <span className="text-[13px] text-text-primary truncate max-w-[140px]">{item.name}</span>
                <span className={`text-[12px] font-medium whitespace-nowrap ${dl.isUrgent ? 'text-red-500' : dl.isSoon ? 'text-amber-600' : 'text-text-secondary'}`}>
                  {dl.shortLabel}
                </span>
              </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[12px] text-text-secondary">No upcoming deadlines</p>
        )}
      </div>
    </aside>
  );
}
