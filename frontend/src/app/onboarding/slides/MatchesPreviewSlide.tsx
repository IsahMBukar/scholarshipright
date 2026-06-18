'use client';

import { useEffect, useState } from 'react';
import {
  fetchMatches,
  fetchFeaturedScholarships,
  type Scholarship,
} from '@/services/api';

/**
 * MatchesPreviewSlide — slide 3 of the onboarding carousel.
 *
 * Fetches the user's real matches from /api/matches (sorted by score
 * descending) and shows the top 2 as a "here's what you'll see" preview.
 * Each card shows a match-score badge so the user can see at a glance
 * how well each scholarship fits.
 *
 * Auto-recompute is fully transparent: if the user just updated their
 * profile/resume and the match cache is stale, the next GET /api/matches
 * call recomputes on the fly. Falls back to /api/scholarships/featured
 * (which carries match_score) only if the real matches endpoint is
 * unavailable.
 *
 * Two exit paths:
 *   - "See all my matches" → /scholarships
 *   - "Continue" → slide 4 (Scholara)
 *
 * The slide is OPTIONAL — "Skip" link visible at bottom.
 */

type Match = {
  scholarship: Scholarship;
  score: number;
  breakdown?: Record<string, number | string | unknown>;
};

function colorForScore(score: number): { ring: string; bg: string; text: string; label: string } {
  // Score is on a roughly 0-100 scale (sum of breakdown components).
  if (score >= 75) return { ring: 'ring-green-500', bg: 'bg-green-50', text: 'text-green-700', label: 'Strong match' };
  if (score >= 50) return { ring: 'ring-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', label: 'Good match' };
  if (score >= 25) return { ring: 'ring-orange-400', bg: 'bg-orange-50', text: 'text-orange-700', label: 'Partial match' };
  return { ring: 'ring-red-400', bg: 'bg-red-50', text: 'text-red-700', label: 'Weak match' };
}

// Human-readable labels for breakdown keys (top reasons shown under the card)
const REASON_LABELS: Record<string, string> = {
  field: 'Field of study',
  degree: 'Degree level',
  country: 'Eligible country',
  language: 'Language fit',
  funding_fit: 'Funding fit',
  fee: 'No app fee',
  academic: 'Academic record',
  start_date: 'Start date',
  target_country: 'Target country',
  research_experience: 'Research experience',
};

function topReasons(breakdown: Record<string, unknown> | undefined, n = 2): string[] {
  if (!breakdown) return [];
  const numeric = Object.entries(breakdown)
    .filter(([k, v]) =>
      typeof v === 'number' &&
      v > 0 &&
      !k.endsWith('_details') &&
      k !== 'hard_flags' &&
      k !== 'scoring_version'
    )
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, n);
  return numeric
    .map(([k]) => REASON_LABELS[k] || k)
    .filter(Boolean);
}

function MatchPreview({ m }: { m: Match }) {
  const s = m.scholarship;
  const daysUntilDeadline = s.deadline
    ? Math.max(0, Math.ceil((new Date(s.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const isUrgent = daysUntilDeadline !== null && daysUntilDeadline <= 30;
  const score = Math.round(m.score);
  const colors = colorForScore(score);
  const reasons = topReasons(m.breakdown as Record<string, number> | undefined, 2);

  return (
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {/* Logo / placeholder */}
        <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
          {s.logo_url ? (
            <img src={s.logo_url} alt="" className="w-8 h-8 object-contain" />
          ) : (
            <span className="material-symbols-outlined text-[22px] text-text-secondary">school</span>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            {s.is_verified && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                <span className="material-symbols-outlined text-[11px]">verified</span>
                Verified
              </span>
            )}
            {isUrgent && daysUntilDeadline !== null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-50 text-[10px] font-semibold text-red-500">
                {daysUntilDeadline}d left
              </span>
            )}
          </div>
          <h3 className="text-[14px] font-bold text-text-primary leading-tight line-clamp-2">
            {s.name}
          </h3>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {s.provider || s.host_institution} · {s.host_country}
          </p>
          <div className="flex flex-wrap gap-1 mt-2">
            {s.funding_type === 'fully_funded' && (
              <span className="px-1.5 py-0.5 rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                Fully Funded
              </span>
            )}
            {!s.requires_ielts && (
              <span className="px-1.5 py-0.5 rounded-md bg-green-50 text-[10px] font-semibold text-green-700">
                No IELTS
              </span>
            )}
            {s.degree_levels?.[0] && (
              <span className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-semibold text-text-primary capitalize">
                {s.degree_levels[0]}
              </span>
            )}
          </div>
        </div>

        {/* Match score badge — top-right of the card */}
        <div
          className={`flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 rounded-xl ${colors.bg} ring-2 ${colors.ring}`}
          title={`${colors.label} — score ${score}`}
        >
          <span className={`text-[16px] font-extrabold leading-none ${colors.text}`}>
            {score}
          </span>
          <span className={`text-[8px] font-bold uppercase tracking-wider ${colors.text} mt-0.5`}>
            % match
          </span>
        </div>
      </div>

      {/* Top reasons — small line explaining why this matches */}
      {reasons.length > 0 && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <p className="text-[11px] text-text-secondary">
            <span className="font-semibold text-text-primary">Why:</span>{' '}
            {reasons.join(' · ')}
          </p>
        </div>
      )}
    </div>
  );
}

export default function MatchesPreviewSlide({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        // 1. Try /api/matches first (user-specific, has real scores).
        //    The backend transparently recomputes stale data on read —
        //    no manual compute step is needed.
        let list = await fetchMatches();

        // 2. If still empty (no profile yet, or engine returned zero), fall back to featured
        if (!list || list.length === 0) {
          const featured = await fetchFeaturedScholarships();
          if (!cancelled) {
            setMatches(
              featured.slice(0, 2).map(s => ({
                scholarship: s,
                // Featured uses snake_case match_score; matches uses score
                score: typeof (s as unknown as { match_score?: number }).match_score === 'number'
                  ? (s as unknown as { match_score: number }).match_score
                  : 50, // neutral default if no score available
              })),
            );
          }
          return;
        }

        if (!cancelled) setMatches(list.slice(0, 2));
      } catch (err) {
        if (!cancelled) setLoadError("We couldn't load your matches.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="px-4 py-3 max-w-xl mx-auto">
      <div className="text-center mb-5">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <span className="material-symbols-outlined text-primary text-[28px]">workspace_premium</span>
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">
          Here&apos;s what you&apos;ll see
        </h2>
        <p className="text-[13px] text-text-secondary mt-1 max-w-sm mx-auto">
          We just matched you to some scholarships. Your full list is one click away.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1].map(i => (
            <div key={i} className="rounded-2xl bg-white border border-gray-200 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-1/4" />
                  <div className="h-3.5 bg-gray-200 rounded w-3/4" />
                  <div className="h-2.5 bg-gray-200 rounded w-1/2" />
                </div>
                <div className="w-14 h-14 rounded-xl bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-6 text-center">
          <p className="text-[13px] text-red-700">{loadError}</p>
        </div>
      ) : matches.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-6 text-center">
          <p className="text-[13px] text-text-secondary">
            We couldn&apos;t find matches yet. Your full list will be ready on the next page.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {matches.map(m => (
            <MatchPreview key={m.scholarship.id} m={m} />
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col sm:flex-row gap-2">
        <a
          href="/scholarships"
          className="flex-1 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all text-center inline-flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">list</span>
          See all my matches
        </a>
        <button
          onClick={onContinue}
          className="px-5 py-3 text-[13px] font-semibold text-text-secondary hover:text-primary transition-colors"
        >
          Continue →
        </button>
      </div>

      <button
        onClick={onSkip}
        className="mt-3 mx-auto block text-[12px] text-text-secondary/70 hover:text-text-secondary transition-colors"
      >
        Skip this step
      </button>
    </div>
  );
}
