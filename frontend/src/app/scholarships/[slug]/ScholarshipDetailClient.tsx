'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import AppLayout from '@/components/AppLayout';
import { ScholarshipDetailSkeleton } from '@/components/Skeletons';
import { useAuth } from '@/hooks/useAuth';
import { fetchScholarship, saveScholarship, removeSavedScholarship, fetchSavedScholarships, updateSavedScholarship, incrementScholarshipView } from '@/services/api';
import type { Scholarship, MatchBreakdown, DegreeDocument, CustomDocument } from '@/services/api';

// ── Helper: build doc list from a degree-level document row ────────
type Doc = { name: string; note?: string; required: boolean };

function buildDocsFromDegreeDoc(
  dd: DegreeDocument,
  acceptedEnglishTests?: string[],
): Doc[] {
  const docs: Doc[] = [];
  docs.push({ name: 'Completed online application form', required: true });

  if (dd.req_transcripts) docs.push({ name: 'Academic transcripts', note: 'Official, sealed copies', required: true });
  if (dd.req_cv_resume) docs.push({ name: 'CV / Resume', required: true });
  if (dd.req_sop_motivation_letter) docs.push({ name: 'Statement of Purpose / Motivation Letter', required: true });
  if (dd.req_recommendation_letters) {
    const n = dd.recommendation_letters_count;
    const note = n === 3 ? 'Typically 3 references' : n === 2 ? 'Typically 2 academic references' : `${n} references required`;
    docs.push({ name: 'Letters of Recommendation', note, required: true });
  }
  if (dd.req_english_test && acceptedEnglishTests?.length) {
    docs.push({ name: 'English proficiency test score', note: `Accepted: ${acceptedEnglishTests.join(', ')}`, required: true });
  }
  if (dd.req_passport_or_id) docs.push({ name: 'Passport or national ID copy', note: 'Valid for at least 6 months', required: true });
  if (dd.req_financial_proof) docs.push({ name: 'Financial statement / bank letter', note: 'Proof of funds or sponsorship', required: true });

  const cement = dd.previous_degree_required;
  if (cement === 'high_school_diploma') docs.push({ name: 'High school diploma', required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'bachelor_degree') docs.push({ name: "Bachelor's degree certificate", required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'master_degree') docs.push({ name: "Master's degree certificate", required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'phd_degree') docs.push({ name: "PhD degree certificate", required: true });

  if (dd.research_proposal_required) docs.push({ name: 'Research proposal', note: '2-5 page outline of intended research', required: true });
  if (dd.writing_sample_required) docs.push({ name: 'Writing sample', note: 'Published papers or academic writing', required: true });

  const test = dd.standardized_test;
  if (test === 'sat_act') docs.push({ name: 'SAT or ACT scores', required: true });
  else if (test === 'gre_gmat') docs.push({ name: 'GRE or GMAT scores', required: true });
  else if (test === 'gre') docs.push({ name: 'GRE scores', required: true });
  else if (test === 'gmat') docs.push({ name: 'GMAT scores', required: true });

  if (dd.additional_required_documents) {
    const extra = dd.additional_required_documents.split(/[\n•·|]/).map((s) => s.trim()).filter((s) => s.length > 0);
    for (const item of extra) docs.push({ name: item, required: true });
  }

  if (dd.req_photo) docs.push({ name: 'Passport-size photo', required: true });
  return docs;
}

// ── Helper: render a doc list ──────────────────────────────────────
function DocList({ docs }: { docs: Doc[] }) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
      {docs.map((doc, i) => (
        <li key={`${doc.name}-${i}`} className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary mt-0.5 flex-shrink-0">
            {doc.required ? 'check_box' : 'circle'}
          </span>
          <div className="min-w-0">
            <p className={`text-[14px] leading-snug ${doc.required ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
              {doc.name}
              {!doc.required && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wider font-bold text-text-secondary/70">Optional</span>
              )}
            </p>
            {doc.note && <p className="text-[12px] text-text-secondary mt-0.5">{doc.note}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Tabbed per-degree-level documents ──────────────────────────────
function DegreeLevelDocs({
  degreeDocs,
  acceptedEnglishTests,
}: {
  degreeDocs: DegreeDocument[];
  acceptedEnglishTests?: string[];
}) {
  const [activeTab, setActiveTab] = useState(0);
  const current = degreeDocs[activeTab];
  const docs = current ? buildDocsFromDegreeDoc(current, acceptedEnglishTests) : [];

  return (
    <div className="space-y-3">
      <div className="flex gap-1 border-b border-gray-200">
        {degreeDocs.map((dd, i) => (
          <button
            key={dd.degree_level}
            type="button"
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === i
                ? 'text-primary border-b-2 border-primary -mb-[2px]'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {dd.degree_level}
          </button>
        ))}
      </div>
      <DocList docs={docs} />
    </div>
  );
}

// ── Flat doc list (legacy fallback — no per-level overrides) ───────
function FlatDocList({ scholarship }: { scholarship: Scholarship }) {
  const docs: Doc[] = [];
  docs.push({ name: 'Completed online application form', required: true });
  if (scholarship.req_transcripts) docs.push({ name: 'Academic transcripts', note: 'Official, sealed copies', required: true });
  if (scholarship.req_cv_resume) docs.push({ name: 'CV / Resume', required: true });
  if (scholarship.req_sop_motivation_letter) docs.push({ name: 'Statement of Purpose / Motivation Letter', required: true });
  if (scholarship.req_recommendation_letters) {
    const n = scholarship.recommendation_letters_count;
    const note = n === 3 ? 'Typically 3 references (common for PhD)' : n === 2 ? 'Typically 2 academic references' : `${n} references required`;
    docs.push({ name: 'Letters of Recommendation', note, required: true });
  }
  if (scholarship.req_english_test && scholarship.accepted_english_tests?.length) {
    docs.push({ name: 'English proficiency test score', note: `Accepted: ${scholarship.accepted_english_tests.join(', ')}`, required: true });
  }
  if (scholarship.req_passport_or_id) docs.push({ name: 'Passport or national ID copy', note: 'Valid for at least 6 months', required: true });
  if (scholarship.req_financial_proof) docs.push({ name: 'Financial statement / bank letter', note: 'Proof of funds or sponsorship', required: true });

  const cement = scholarship.previous_degree_required;
  if (cement === 'high_school_diploma') docs.push({ name: 'High school diploma', required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'bachelor_degree') docs.push({ name: "Bachelor's degree certificate", required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'master_degree') docs.push({ name: "Master's degree certificate", required: true, note: 'Final-year students: expected graduation letter accepted' });
  else if (cement === 'phd_degree') docs.push({ name: "PhD degree certificate", required: true });

  if (scholarship.research_proposal_required) docs.push({ name: 'Research proposal', note: '2-5 page outline of intended research', required: true });
  if (scholarship.writing_sample_required) docs.push({ name: 'Writing sample', note: 'Published papers or academic writing', required: true });
  const test = scholarship.standardized_test;
  if (test === 'sat_act') docs.push({ name: 'SAT or ACT scores', required: true });
  else if (test === 'gre_gmat') docs.push({ name: 'GRE or GMAT scores', required: true });
  else if (test === 'gre') docs.push({ name: 'GRE scores', required: true });
  else if (test === 'gmat') docs.push({ name: 'GMAT scores', required: true });

  if (scholarship.additional_required_documents) {
    const extra = scholarship.additional_required_documents.split(/[\n•·|]/).map((s) => s.trim()).filter((s) => s.length > 0);
    for (const item of extra) docs.push({ name: item, required: true });
  }
  if (scholarship.req_photo) docs.push({ name: 'Passport-size photo', required: true });

  return <DocList docs={docs} />;
}

export default function ScholarshipDetailClient() {
  const params = useParams();
  const router = useRouter();
  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savedStatus, setSavedStatus] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'overview' | 'provider'>('overview');
  const [loadError, setLoadError] = useState<string | null>(null);
  const viewedRef = useRef<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { isAuthenticated, setPendingAction } = useAuth();

  function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = scholarship?.name || 'Scholarship';
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  useEffect(() => {
    if (params.slug) {
      const slug = params.slug as string;
      Promise.all([
        fetchScholarship(slug),
        fetchSavedScholarships().catch(() => []),
      ]).then(([sch, saved]) => {
        setScholarship(sch);
        const found = saved.find((s: { scholarship_id?: string; id: string; status?: string }) => (s.scholarship_id || s.id) === sch.id);
        setIsSaved(!!found);
        if (found) setSavedStatus(found.status || 'saved');
      }).catch((err) => {
        console.error(err);
        if (err?.status === 404 || err?.message?.includes('404')) {
          setLoadError('not_found');
        } else {
          setLoadError('network');
        }
      })
        .finally(() => setLoading(false));

      // Track view once per slug (guards against double-mount in dev)
      if (viewedRef.current !== slug) {
        viewedRef.current = slug;
        incrementScholarshipView(slug);
      }
    }
  }, [params.slug]);

  async function handleSave() {
    if (!scholarship) return;
    // Action gating for guests
    if (!isAuthenticated) {
      setPendingAction({
        type: 'save',
        label: `Save "${scholarship.name}"`,
        onReplay: async () => {
          await saveScholarship(scholarship!.id).catch(() => {});
          setIsSaved(true);
          setSavedStatus('saved');
        },
      });
      return;
    }
    if (isSaved) {
      await removeSavedScholarship(scholarship.id).catch(() => {});
      setIsSaved(false);
      setSavedStatus('');
    } else {
      await saveScholarship(scholarship.id).catch(() => {});
      setIsSaved(true);
      setSavedStatus('saved');
    }
  }

  async function handleApplyNow() {
    if (!scholarship) return;
    // Action gating for guests
    if (!isAuthenticated) {
      setPendingAction({
        type: 'apply',
        label: `Apply to "${scholarship.name}"`,
        onReplay: async () => {
          if (!isSaved) {
            await saveScholarship(scholarship!.id).catch(() => {});
            setIsSaved(true);
          }
          await updateSavedScholarship(scholarship!.id, { status: 'applying' }).catch(() => {});
          setSavedStatus('applying');
          // Navigate to the official application page (same as card behavior)
          if (scholarship!.official_url) {
            window.open(scholarship!.official_url, '_blank');
          }
        },
      });
      return;
    }
    // Auto-save if not saved yet
    if (!isSaved) {
      await saveScholarship(scholarship.id).catch(() => {});
      setIsSaved(true);
    }
    // Set status to applying
    await updateSavedScholarship(scholarship.id, { status: 'applying' }).catch(() => {});
    setSavedStatus('applying');
    // Navigate to the official application page (same as card behavior)
    if (scholarship.official_url) {
      window.open(scholarship.official_url, '_blank');
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <ScholarshipDetailSkeleton />
      </AppLayout>
    );
  }

  if (!scholarship) {
    return (
      <AppLayout>
        <div className="p-6 text-center py-20">
          <span className="material-symbols-outlined text-6xl text-text-secondary mb-4 block">
            {loadError === 'network' ? 'wifi_off' : 'error'}
          </span>
          <h2 className="text-[24px] font-bold text-text-primary mb-2">
            {loadError === 'network' ? 'Something went wrong' : 'Scholarship Not Found'}
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            {loadError === 'network'
              ? 'We couldn\'t load this scholarship. Please check your connection and try again.'
              : 'This scholarship doesn\'t exist or has been removed.'}
          </p>
          {loadError === 'network' ? (
            <button
              onClick={() => router.refresh()}
              className="text-primary-readable font-semibold hover:underline"
            >
              Try again
            </button>
          ) : (
            <Link href="/scholarships" className="text-primary-readable font-semibold hover:underline">Back to scholarships</Link>
          )}
        </div>
      </AppLayout>
    );
  }

  const daysUntilDeadline = Math.max(0, Math.ceil(
    (new Date(scholarship.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const score = scholarship.match_score;
  const matchLabel = score != null
    ? (score >= 85 ? 'STRONG MATCH' : score >= 70 ? 'GOOD MATCH' : score >= 50 ? 'FAIR MATCH' : 'LOW MATCH')
    : null;

  // Derive data from scholarship
  const tags = [
    ...(scholarship.degree_levels || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)),
    scholarship.funding_type === 'fully_funded' ? 'Fully Funded' : scholarship.funding_type?.replace('_', ' '),
    scholarship.host_country,
    ...(scholarship.fields_of_study || []).map(f => f.replace(/_/g, ' ')),
    !scholarship.requires_ielts ? 'No IELTS' : null,
    scholarship.covers_living ? 'Living Allowance' : null,
    scholarship.covers_flight ? 'Flight Covered' : null,
  ].filter(Boolean) as string[];

  const baseScore = score;
  const breakdown: MatchBreakdown | undefined = scholarship.match_breakdown;
  const hasRealBreakdown = !!breakdown && (
    breakdown.field != null ||
    breakdown.degree != null ||
    breakdown.country != null ||
    breakdown.academic != null ||
    breakdown.language != null ||
    breakdown.research_experience != null ||
    breakdown.semantic != null
  );

  // Hard-fail flags from the match engine. Each maps to a user-friendly
  // warning shown above the breakdown.
  const HARD_FLAG_LABELS: Record<string, string> = {
    nationality_not_listed: 'Your nationality is not on the eligible list',
    degree_level_mismatch: 'Your target degree does not match what this scholarship accepts',
    below_min_cgpa: 'Your CGPA is below the minimum requirement',
    ielts_requirement_not_met: 'Your IELTS score does not meet the minimum',
  };
  const hardFlags = (breakdown?.hard_flags || []).filter((f) => f in HARD_FLAG_LABELS);

  // Per-criterion metrics. We display the 6 most decision-relevant signals
  // (eligibility + academics + research) instead of all 12 to keep the card
  // compact. Each criterion has known (min, max) from the match engine.
  const CRITERIA: Array<{ key: keyof MatchBreakdown; label: string; max: number; min: number; icon: string }> = [
    { key: 'country', label: 'Country Eligibility', max: 10, min: -35, icon: 'public' },
    { key: 'degree', label: 'Degree Match', max: 12, min: -25, icon: 'workspace_premium' },
    { key: 'field', label: 'Field Match', max: 15, min: 0, icon: 'school' },
    { key: 'academic', label: 'Academic Standing', max: 10, min: -12, icon: 'grade' },
    { key: 'language', label: 'Language Match', max: 8, min: -8, icon: 'translate' },
    { key: 'research_experience', label: 'Research Evidence', max: 10, min: 0, icon: 'science' },
  ];

  const matchMetrics = CRITERIA.map((c) => {
    const raw = breakdown?.[c.key] as number | undefined;
    if (typeof raw !== 'number') {
      return { ...c, raw: null as number | null, percent: 0, state: 'unknown' as const };
    }
    const range = c.max - c.min;
    const percent = range > 0
      ? Math.max(0, Math.min(100, ((raw - c.min) / range) * 100))
      : 0;
    let state: 'good' | 'neutral' | 'bad' = 'neutral';
    if (raw < 0) state = 'bad';
    else if (raw >= c.max * 0.5) state = 'good';
    else if (raw > 0) state = 'neutral';
    else state = 'bad'; // zero on a positive-only criterion = missing signal
    return { ...c, raw, percent, state };
  });

  const formatValue = (v: number | null): string => {
    if (v == null) return '—';
    if (v > 0) return `+${v}`;
    return `${v}`;
  };

  return (
    <AppLayout>
      <div className="w-full min-h-screen bg-white">

        {/* 1. STICKY TOP ACTION & META-BAR */}
        <div className="sticky top-0 z-40 bg-white border-b border-gray-100">
          <div className="flex justify-between items-center px-4 md:px-8 py-3">
            <Link
              href="/scholarships"
              aria-label="Back to scholarships"
              className="flex items-center gap-2 px-3 py-2 rounded-full hover:bg-gray-100 transition"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-text-secondary">arrow_back</span>
              <span className="hidden sm:inline text-[13px] text-text-secondary font-medium">Back to scholarships</span>
            </Link>
            <div className="flex items-center gap-2">
              {/* Status badge if saved */}
              {isSaved && savedStatus && savedStatus !== 'saved' && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600 whitespace-nowrap">
                  <span className="material-symbols-outlined text-[13px]">
                    {savedStatus === 'applying' ? 'edit_note' : savedStatus === 'applied' ? 'check_circle' : savedStatus === 'reviewing' ? 'hourglass_top' : savedStatus === 'accepted' ? 'celebration' : 'cancel'}
                  </span>
                  {savedStatus.charAt(0).toUpperCase() + savedStatus.slice(1)}
                </span>
              )}
              <button
                onClick={handleShare}
                aria-label="Share this scholarship"
                className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50 text-text-secondary transition"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {copied ? 'check' : 'share'}
                </span>
              </button>
              <button
                onClick={handleSave}
                className={`w-10 h-10 flex items-center justify-center rounded-full border transition ${isSaved ? 'bg-primary-light/30 border-primary text-primary' : 'border-gray-200 text-text-secondary hover:border-primary'}`}
              >
                <span className="material-symbols-outlined text-[18px]">{isSaved ? 'bookmark' : 'bookmark_border'}</span>
              </button>
              <button
                onClick={handleApplyNow}
                className="px-4 py-2 bg-primary hover:brightness-110 text-white font-semibold rounded-lg text-[13px] md:text-sm flex items-center gap-1 shadow-sm transition"
              >
                APPLY <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8 space-y-6 md:space-y-8">

        {/* 2. SUBSECTION NAVIGATION TABS */}
        <div className="flex justify-between items-center border-b border-gray-100">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'overview' ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('provider')}
              className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'provider' ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              Provider / Institution
            </button>
          </div>
        </div>

        {activeTab === 'overview' ? (
          <>
            {/* 3. HERO HEADER & MATCH SCORE CARD */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              {/* Left: Details */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center border border-gray-200">
                    {scholarship.logo_url ? (
                      <Image src={scholarship.logo_url} alt={scholarship.provider || ''} width={40} height={40} unoptimized className="w-10 h-10 object-contain" />
                    ) : (
                      <span className="text-xl font-bold text-primary">{(scholarship.provider || scholarship.host_country || 'S').charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-text-primary">{scholarship.provider || scholarship.host_institution || scholarship.host_country}</h3>
                    <p className="text-xs text-text-secondary">
                      {scholarship.is_verified && '✓ Verified · '}
                      Deadline: {new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                </div>

                <h1 className="text-2xl md:text-3xl font-bold text-text-primary tracking-tight">{scholarship.name}</h1>

                {/* Grid Metadata */}
                <div className="grid grid-cols-2 gap-3 text-sm text-text-secondary">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">location_on</span>
                    {scholarship.host_country}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">schedule</span>
                    {scholarship.duration_months ? `${scholarship.duration_months} months` : 'Varies'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">school</span>
                    {scholarship.degree_levels?.join(', ') || 'All levels'}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">public</span>
                    {scholarship.eligible_nationalities?.join(', ') || 'Open'}
                  </div>
                  {typeof scholarship.view_count === 'number' && scholarship.view_count > 0 && (
                    <div className="flex items-center gap-2" title={`${scholarship.view_count} students have viewed this scholarship`}>
                      <span className="material-symbols-outlined text-primary text-[18px]">visibility</span>
                      <span>
                        <span className="font-semibold text-text-primary">{scholarship.view_count.toLocaleString()}</span>{' '}
                        {scholarship.view_count === 1 ? 'student' : 'students'} viewed
                      </span>
                    </div>
                  )}
                  {scholarship.open_date && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">event_available</span>
                      <span>
                        Apps open {new Date(scholarship.open_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                  {scholarship.program_start_date && (
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[18px]">flight_takeoff</span>
                      <span>
                        Starts {new Date(scholarship.program_start_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Deadline bar — prominent urgency indicator */}
                {(() => {
                  const isPassed = daysUntilDeadline <= 0;
                  const isUrgent = !isPassed && daysUntilDeadline <= 7;
                  const isSoon = !isPassed && daysUntilDeadline <= 30;
                  const wrapperClass = isPassed
                    ? 'bg-gray-100 text-text-secondary'
                    : isUrgent
                    ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                    : isSoon
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                    : 'bg-primary-light/20 text-text-primary';
                  return (
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${wrapperClass}`}>
                      {!isPassed && (
                        <span className="relative flex w-2.5 h-2.5 flex-shrink-0">
                          {(isUrgent || isSoon) && (
                            <span className={`absolute inset-0 rounded-full animate-ping opacity-75 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`} />
                          )}
                          <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${isUrgent ? 'bg-red-500' : isSoon ? 'bg-amber-500' : 'bg-primary'}`} />
                        </span>
                      )}
                      <span className="material-symbols-outlined text-[20px]">{isPassed ? 'event_busy' : 'event'}</span>
                      <div className="flex-1 min-w-0">
                        {isPassed ? (
                          <span className="font-semibold text-[15px]">Applications closed</span>
                        ) : (
                          <>
                            <span className="font-bold text-[18px] leading-none">
                              {daysUntilDeadline} day{daysUntilDeadline === 1 ? '' : 's'} left
                            </span>
                            <span className="block text-xs opacity-80 mt-0.5">
                              {isUrgent ? 'Apply now — closing soon' : isSoon ? 'Don\'t miss the deadline' : 'Time remaining to apply'}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="text-[13px] font-medium opacity-80 whitespace-nowrap">
                        {new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Right: Match Score Card */}
              <div className="border border-primary-light bg-white rounded-xl p-5 shadow-sm space-y-4">
                {score != null ? (
                  <>
                <div className="flex justify-between items-baseline">
                  <span className="text-4xl font-extrabold text-text-primary">{score}%</span>
                  <span className="bg-primary-light/40 text-text-primary text-xs font-bold px-2.5 py-1 rounded-md">
                    {matchLabel}
                  </span>
                </div>
                <div className="space-y-2.5 border-t border-gray-100 pt-3">
                  {/* Hard-fail warnings from the match engine */}
                  {hardFlags.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 space-y-1">
                      {hardFlags.map((flag) => (
                        <div key={flag} className="flex items-start gap-1.5 text-[11px] text-red-700 leading-snug">
                          <span className="material-symbols-outlined text-[14px] flex-shrink-0 mt-0.5">error</span>
                          <span className="font-medium">{HARD_FLAG_LABELS[flag]}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Country eligibility warning */}
                  {breakdown?.country_eligible === false && breakdown?.country_reason && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <div className="flex items-start gap-1.5 text-[11px] text-amber-800 leading-snug">
                        <span className="material-symbols-outlined text-[14px] flex-shrink-0 mt-0.5">block</span>
                        <span className="font-medium">Not eligible — {breakdown.country_reason}</span>
                      </div>
                    </div>
                  )}

                  {!hasRealBreakdown ? (
                    <div className="text-center py-2 px-1">
                      <p className="text-[11px] text-text-secondary leading-snug">
                        {score === baseScore
                          ? 'Sign in and compute your match to see per-criterion breakdown.'
                          : 'Match breakdown is being computed — check back shortly.'}
                      </p>
                    </div>
                  ) : (
                    matchMetrics.map((metric) => {
                      const barColor = {
                        good: 'bg-emerald-500',
                        neutral: 'bg-amber-400',
                        bad: 'bg-red-500',
                        unknown: 'bg-gray-200',
                      }[metric.state];
                      const valueColor = {
                        good: 'text-emerald-700',
                        neutral: 'text-text-primary',
                        bad: 'text-red-600',
                        unknown: 'text-text-secondary',
                      }[metric.state];
                      return (
                        <div key={metric.key}>
                          <div className="flex justify-between items-center text-[11px] mb-1">
                            <span className="text-text-secondary font-medium flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">{metric.icon}</span>
                              {metric.label}
                            </span>
                            <span className={`font-semibold ${valueColor}`}>
                              {formatValue(metric.raw)}
                              {metric.raw != null && (
                                <span className="text-text-secondary font-normal"> / {metric.max}</span>
                              )}
                            </span>
                          </div>
                          <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${barColor} transition-all`}
                              style={{ width: `${metric.percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                {scholarship.monthly_stipend_usd && scholarship.monthly_stipend_usd > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Monthly Stipend</span>
                      <span className="font-semibold text-primary">${scholarship.monthly_stipend_usd}/mo</span>
                    </div>
                  </div>
                )}
                  </>
                ) : !isAuthenticated ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[24px] text-text-secondary">lock</span>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-primary">Sign in to see your match score</p>
                      <p className="text-[11px] text-text-secondary mt-1">Create a free profile to find out how well you fit this scholarship.</p>
                    </div>
                    <Link
                      href="/signup"
                      className="mt-1 px-5 py-2 bg-primary hover:brightness-110 text-white text-sm font-semibold rounded-lg shadow-sm transition"
                    >
                      Create free profile
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    <div className="relative w-10 h-10">
                      <div className="absolute inset-0 rounded-full border-2 border-gray-100"></div>
                      <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-text-primary">Calculating your match…</p>
                      <p className="text-[11px] text-text-secondary mt-1">We&apos;re matching this scholarship to your profile.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4. TAG CLOUD */}
            <div className="flex flex-wrap gap-2">
              {tags.map((tag, idx) => (
                <span key={idx} className="bg-primary-light/30 text-text-secondary text-xs font-medium px-2.5 py-1 rounded-md">
                  {tag}
                </span>
              ))}
            </div>

            {/* 5. DESCRIPTION */}
            {scholarship.description && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className="w-2 h-6 bg-primary rounded-full" />
                  <h2 className="text-lg font-bold text-text-primary">About This Scholarship</h2>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{scholarship.description}</p>
              </div>
            )}

            {/* 6. BENEFITS — structured card grid */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-text-primary">Benefits & Coverage</h2>
              </div>

              {(() => {
                const stipend = scholarship.monthly_stipend_usd && scholarship.monthly_stipend_usd > 0
                  ? `$${scholarship.monthly_stipend_usd}/mo`
                  : null;
                // Annual package = stipend × 12 if we have one (rough estimate).
                const annualPackage = scholarship.monthly_stipend_usd && scholarship.monthly_stipend_usd > 0
                  ? `~$${(scholarship.monthly_stipend_usd * 12).toLocaleString()}/yr`
                  : null;
                const cards: Array<{
                  key: string;
                  icon: string;
                  label: string;
                  value: string;
                  state: 'covered' | 'partial' | 'none' | 'info';
                }> = [];
                cards.push({
                  key: 'tuition',
                  icon: 'school',
                  label: 'Tuition',
                  value: scholarship.covers_tuition ? 'Full tuition waiver' : 'Not covered',
                  state: scholarship.covers_tuition ? 'covered' : 'none',
                });
                if (stipend) {
                  cards.push({
                    key: 'stipend',
                    icon: 'payments',
                    label: 'Monthly Stipend',
                    value: stipend,
                    state: 'info',
                  });
                }
                if (annualPackage) {
                  cards.push({
                    key: 'package',
                    icon: 'savings',
                    label: 'Annual Package',
                    value: annualPackage,
                    state: 'info',
                  });
                }
                cards.push({
                  key: 'living',
                  icon: 'home',
                  label: 'Living Allowance',
                  value: scholarship.covers_living ? 'Included' : 'Not included',
                  state: scholarship.covers_living ? 'covered' : 'none',
                });
                cards.push({
                  key: 'flight',
                  icon: 'flight',
                  label: 'Flight',
                  value: scholarship.covers_flight ? 'Round-trip covered' : 'Not covered',
                  state: scholarship.covers_flight ? 'covered' : 'none',
                });
                cards.push({
                  key: 'health',
                  icon: 'health_and_safety',
                  label: 'Health Insurance',
                  value: scholarship.covers_health ? 'Full coverage' : 'Not included',
                  state: scholarship.covers_health ? 'covered' : 'none',
                });

                return (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {cards.map((card) => {
                        const stateClasses =
                          card.state === 'covered'
                            ? 'border-green-200 bg-green-50'
                            : card.state === 'none'
                            ? 'border-gray-200 bg-gray-50'
                            : 'border-primary-light bg-primary-light/10';
                        const iconColor =
                          card.state === 'covered'
                            ? 'text-green-600'
                            : card.state === 'none'
                            ? 'text-gray-400'
                            : 'text-primary';
                        const valueColor =
                          card.state === 'covered'
                            ? 'text-green-700'
                            : card.state === 'none'
                            ? 'text-text-secondary'
                            : 'text-text-primary';
                        return (
                          <div
                            key={card.key}
                            className={`flex items-start gap-3 p-3.5 rounded-xl border ${stateClasses}`}
                          >
                            <span className={`material-symbols-outlined text-[22px] mt-0.5 ${iconColor}`}>
                              {card.icon}
                            </span>
                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wider font-semibold text-text-secondary">
                                {card.label}
                              </p>
                              <p className={`text-[14px] font-bold mt-0.5 ${valueColor}`}>
                                {card.value}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {scholarship.benefits_summary && (
                      <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line pt-2">
                        {scholarship.benefits_summary}
                      </p>
                    )}
                  </>
                );
              })()}
            </div>

            {/* 7. ELIGIBILITY & REQUIREMENTS */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-text-primary">Requirements & Qualifications</h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">school</span>
                  <div>
                    <p className="text-xs text-text-secondary">Degree Level</p>
                    <p className="font-semibold text-text-primary">{scholarship.degree_levels?.join(', ') || 'Any'}</p>
                  </div>
                </div>
                {scholarship.min_cgpa && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">grade</span>
                    <div>
                      <p className="text-xs text-text-secondary">Min CGPA</p>
                      <p className="font-semibold text-text-primary">{scholarship.min_cgpa}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">translate</span>
                  <div>
                    <p className="text-xs text-text-secondary">Language</p>
                    <p className="font-semibold text-text-primary">{scholarship.language_of_instruction || 'English'}</p>
                  </div>
                </div>
                {scholarship.requires_ielts && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">quiz</span>
                    <div>
                      <p className="text-xs text-text-secondary">IELTS</p>
                      <p className="font-semibold text-text-primary">Required {scholarship.min_ielts_score ? `(min ${scholarship.min_ielts_score})` : ''}</p>
                    </div>
                  </div>
                )}
                {(scholarship as { requires_gre?: boolean }).requires_gre && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">assignment</span>
                    <div>
                      <p className="text-xs text-text-secondary">GRE</p>
                      <p className="font-semibold text-text-primary">Required</p>
                    </div>
                  </div>
                )}
                {scholarship.requires_application_fee && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">payments</span>
                    <div>
                      <p className="text-xs text-text-secondary">Application Fee</p>
                      <p className="font-semibold text-text-primary">Required</p>
                    </div>
                  </div>
                )}
              </div>

              {scholarship.eligible_nationalities?.length > 0 && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-1">Eligible Nationalities</h4>
                  <p className="text-sm text-text-secondary">{scholarship.eligible_nationalities.join(', ')}</p>
                </div>
              )}

              {/* Accepted English Tests — pills */}
              {((scholarship.accepted_english_tests ?? []).length > 0) && (
                <div className="pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary mb-2">Accepted English Tests</h4>
                  <div className="flex flex-wrap gap-2">
                    {(scholarship.accepted_english_tests ?? []).map((test) => (
                      <span
                        key={test}
                        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary bg-primary/8 border border-primary/20 px-3 py-1.5 rounded-lg"
                      >
                        <span className="material-symbols-outlined text-[14px]">verified</span>
                        {test}
                      </span>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-secondary mt-1.5">
                    Any one of these tests will be accepted as proof of English proficiency.
                  </p>
                </div>
              )}
            </div>

            {/* 8. REQUIRED DOCUMENTS — data-driven from the scholarship's
                 required_documents fields (req_* booleans + cement +
                 flexible). When degree_documents is present (per-level
                 overrides), shows tabs per degree level. Otherwise falls
                 back to the flat document list. */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-text-primary">Required Documents</h2>
              </div>

              {scholarship.degree_documents && scholarship.degree_documents.length > 0 ? (
                <DegreeLevelDocs
                  degreeDocs={scholarship.degree_documents}
                  acceptedEnglishTests={scholarship.accepted_english_tests}
                />
              ) : (
                <FlatDocList scholarship={scholarship} />
              )}

              {/* Custom document requirements */}
              {scholarship.custom_documents && scholarship.custom_documents.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[13px] font-semibold text-text-primary">Additional Requirements</p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {scholarship.custom_documents.map((doc) => (
                      <li key={doc.id} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-[20px] text-primary mt-0.5 flex-shrink-0">
                          {doc.required ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                        <div className="min-w-0">
                          <p className={`text-[14px] leading-snug ${doc.required ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
                            {doc.name}
                            {!doc.required && (
                              <span className="ml-1.5 text-[10px] uppercase tracking-wider font-bold text-text-secondary/70">Optional</span>
                            )}
                            {doc.degree_level && (
                              <span className="ml-1.5 text-[10px] capitalize px-1.5 py-0.5 bg-gray-100 rounded text-text-secondary">
                                {doc.degree_level}
                              </span>
                            )}
                          </p>
                          {doc.description && (
                            <p className="text-[12px] text-text-secondary mt-0.5">{doc.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[11px] text-text-secondary pt-1">
                Always confirm the exact document list on the scholarship's official page before submitting.
              </p>
            </div>

            {/* 9. FIELDS OF STUDY */}
            {scholarship.fields_of_study?.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className="w-2 h-6 bg-primary rounded-full" />
                  <h2 className="text-lg font-bold text-text-primary">Fields of Study</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {scholarship.fields_of_study.map((field) => (
                    <span key={field} className="bg-primary-light/30 text-text-secondary text-xs font-medium px-3 py-1.5 rounded-md">
                      {field.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 9. HOW TO APPLY */}
            {scholarship.how_to_apply && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className="w-2 h-6 bg-primary rounded-full" />
                  <h2 className="text-lg font-bold text-text-primary">How to Apply</h2>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">{scholarship.how_to_apply}</p>
              </div>
            )}

            {/* 11. APPLICATION TIMELINE */}
            {(scholarship.open_date || scholarship.deadline || scholarship.program_start_date) && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className="w-2 h-6 bg-primary rounded-full" />
                  <h2 className="text-lg font-bold text-text-primary">Application Timeline</h2>
                </div>

                {(() => {
                  const rawPoints: Array<{ key: string; label: string; date: Date | null; icon: string }> = [
                    { key: 'open', label: 'Applications Open', date: scholarship.open_date ? new Date(scholarship.open_date) : null, icon: 'event_available' },
                    { key: 'deadline', label: 'Deadline', date: new Date(scholarship.deadline), icon: 'event' },
                    { key: 'start', label: 'Program Starts', date: scholarship.program_start_date ? new Date(scholarship.program_start_date) : null, icon: 'flight_takeoff' },
                  ];
                  const points = rawPoints.filter((p): p is { key: string; label: string; date: Date; icon: string } => p.date !== null);

                  if (points.length < 2) return null;

                  const fmtFull = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                  const fmtFullLong = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

                  // Calculate days between points for connector labels
                  const dayDiff = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

                  return (
                    <div className="relative bg-gradient-to-br from-primary/5 via-white to-primary-light/10 rounded-2xl border border-primary/15 p-6 md:p-8">
                      {/* Timeline track */}
                      <div className="relative flex justify-between items-start">
                        {/* Connecting line behind the dots */}
                        <div className="absolute top-[14px] left-[14px] right-[14px] h-[2px] bg-gradient-to-r from-primary/30 via-primary to-primary/30" />

                        {points.map((point, idx) => {
                          const isDeadline = point.key === 'deadline';
                          const isPast = point.date.getTime() < Date.now();
                          const dotColor = isDeadline
                            ? isPast ? 'bg-gray-400 ring-gray-200' : 'bg-primary ring-primary-light/40'
                            : isPast ? 'bg-gray-300 ring-gray-100' : 'bg-white border-2 border-primary ring-primary-light/30';
                          const labelColor = isPast ? 'text-text-secondary' : 'text-text-primary';
                          const showFullDate = points.length > 0 && (point.key === 'deadline' || (point.date.getDate() !== 1 && point.key === 'start'));

                          return (
                            <div key={point.key} className="relative z-10 flex flex-col items-center text-center flex-1 px-1">
                              <div className={`w-7 h-7 rounded-full ring-4 flex items-center justify-center ${dotColor}`}>
                                <span className={`material-symbols-outlined text-[14px] ${isPast ? 'text-gray-500' : 'text-primary'}`}>
                                  {point.icon}
                                </span>
                              </div>
                              <p className={`mt-3 text-[11px] uppercase tracking-wider font-bold ${labelColor}`}>
                                {point.label}
                              </p>
                              <p className={`mt-1 text-[14px] font-bold leading-tight ${labelColor}`}>
                                {showFullDate ? fmtFull(point.date) : fmtMonth(point.date)}
                              </p>
                              {idx < points.length - 1 && (
                                <p className="mt-1 text-[10px] text-text-secondary">
                                  {dayDiff(point.date, points[idx + 1].date)} days
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Sub-text with full deadline date and countdown */}
                      <div className="mt-6 pt-4 border-t border-primary/10 text-center">
                        <p className="text-[12px] text-text-secondary">
                          Deadline: <span className="font-semibold text-text-primary">{fmtFullLong(new Date(scholarship.deadline))}</span>
                          {' · '}
                          {daysUntilDeadline > 0
                            ? <span className="font-semibold text-primary">{daysUntilDeadline} days from today</span>
                            : <span className="text-text-secondary">Applications closed</span>}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 12. PROVIDER */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-text-primary">Provider / Institution</h2>
              </div>
              <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200">
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                  {scholarship.logo_url ? (
                    <Image src={scholarship.logo_url} alt={`${scholarship.provider || scholarship.name} logo`} width={56} height={56} unoptimized className="w-14 h-14 object-contain" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">{(scholarship.provider || 'S').charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text-primary">{scholarship.provider || scholarship.host_institution}</h3>
                  <p className="text-sm text-text-secondary">{scholarship.host_country}</p>
                </div>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {scholarship.provider
                  ? `${scholarship.provider} is the organization behind ${scholarship.name}. Visit their official website for the most up-to-date information about application procedures and requirements.`
                  : 'Visit the official website for more information about the scholarship provider.'}
              </p>
              <a
                href={scholarship.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:brightness-110 transition"
              >
                Visit Official Website <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </a>
              {scholarship.source && (
                <p className="text-xs text-text-secondary">Source: {scholarship.source}</p>
              )}
            </div>
          </>
        ) : (
          /* PROVIDER TAB */
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                {scholarship.logo_url ? (
                  <Image src={scholarship.logo_url} alt={`${scholarship.provider || scholarship.name} logo`} width={56} height={56} unoptimized className="w-14 h-14 object-contain" />
                ) : (
                  <span className="text-2xl font-bold text-primary">{(scholarship.provider || 'S').charAt(0)}</span>
                )}
              </div>
              <div>
                <h3 className="text-lg font-bold text-text-primary">{scholarship.provider || scholarship.host_institution}</h3>
                <p className="text-sm text-text-secondary">{scholarship.host_country}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                <div className="w-2 h-6 bg-primary rounded-full" />
                <h2 className="text-lg font-bold text-text-primary">About the Provider</h2>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {scholarship.provider
                  ? `${scholarship.provider} is the organization behind ${scholarship.name}. Visit their official website for the most up-to-date information about application procedures and requirements.`
                  : 'Visit the official website for more information about the scholarship provider.'}
              </p>
              <a
                href={scholarship.official_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white font-semibold rounded-lg text-sm hover:brightness-110 transition"
              >
                Visit Official Website <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              </a>
            </div>

            {scholarship.source && (
              <div className="text-xs text-text-secondary">
                Source: {scholarship.source}
              </div>
            )}
          </div>
        )}
        </div>

        {/* Match CTA — shown to guests as a conversion point */}
        {!isAuthenticated && (
          <div className="mt-8 p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-white rounded-2xl border border-primary/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-[24px]">auto_awesome</span>
              </div>
              <div className="flex-1">
                <h3 className="text-[16px] font-bold text-text-primary">How well do you match this scholarship?</h3>
                <p className="text-[13px] text-text-secondary mt-1 leading-relaxed">
                  Create a free account to receive a personalized match score, eligibility explanation,
                  and a checklist of what you need to strengthen your application.
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={() => setPendingAction({
                      type: 'match',
                      label: 'Get your match score',
                      onReplay: () => { router.push('/onboarding'); },
                    })}
                    className="px-5 py-2.5 bg-primary text-white text-[13px] font-bold rounded-btn hover:brightness-110 transition-all"
                  >
                    Upload Resume
                  </button>
                  <a
                    href="/signup"
                    className="px-5 py-2.5 bg-white border border-gray-200 text-text-primary text-[13px] font-semibold rounded-btn hover:bg-gray-50 transition-all"
                  >
                    Create free account
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
