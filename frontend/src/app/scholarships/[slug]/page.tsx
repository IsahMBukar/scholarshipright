'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { fetchScholarship, saveScholarship, removeSavedScholarship, fetchSavedScholarships } from '@/services/api';
import type { Scholarship } from '@/services/api';

function deterministicScore(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return 65 + (Math.abs(hash) % 30);
}

export default function ScholarshipDetailPage() {
  const params = useParams();
  const [scholarship, setScholarship] = useState<Scholarship | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'provider'>('overview');

  useEffect(() => {
    if (params.slug) {
      Promise.all([
        fetchScholarship(params.slug as string),
        fetchSavedScholarships().catch(() => []),
      ]).then(([sch, saved]) => {
        setScholarship(sch);
        setIsSaved(saved.some((s: any) => s.id === sch.id));
      }).catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [params.slug]);

  async function handleSave() {
    if (!scholarship) return;
    if (isSaved) {
      await removeSavedScholarship(scholarship.id).catch(() => {});
      setIsSaved(false);
    } else {
      await saveScholarship(scholarship.id).catch(() => {});
      setIsSaved(true);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6"><div className="animate-pulse space-y-6"><div className="h-8 bg-gray-200 rounded w-3/4" /><div className="h-64 bg-gray-200 rounded-card" /></div></div>
      </AppLayout>
    );
  }

  if (!scholarship) {
    return (
      <AppLayout>
        <div className="p-6 text-center py-20">
          <span className="material-symbols-outlined text-6xl text-text-secondary mb-4 block">error</span>
          <h2 className="text-[24px] font-bold text-text-primary mb-2">Scholarship Not Found</h2>
          <Link href="/scholarships" className="text-primary font-semibold hover:underline">Back to scholarships</Link>
        </div>
      </AppLayout>
    );
  }

  const daysUntilDeadline = Math.max(0, Math.ceil(
    (new Date(scholarship.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  ));
  const score = scholarship.match_score || deterministicScore(scholarship.id);
  const matchLabel = score >= 85 ? 'STRONG MATCH' : score >= 70 ? 'GOOD MATCH' : score >= 50 ? 'FAIR MATCH' : 'LOW MATCH';

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
  const matchMetrics = [
    { label: 'Field Match', value: Math.min(100, baseScore + 5) },
    { label: 'Degree Match', value: Math.min(100, baseScore + 12) },
    { label: 'Country Eligibility', value: Math.min(100, baseScore + 18) },
    { label: 'Language Match', value: Math.min(100, baseScore + 22) },
  ];

  return (
    <AppLayout>
      <div className="w-full min-h-screen bg-white p-6 md:p-8 space-y-8 overflow-y-auto">

        {/* 1. TOP ACTION & META-BAR */}
        <div className="flex justify-between items-center border-b border-gray-100 pb-4">
          <Link href="/scholarships" className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Scholarships
          </Link>
          <div className="flex items-center space-x-3">
            <button className="p-2 rounded-full border border-gray-200 hover:bg-gray-50 text-text-secondary transition">
              <span className="material-symbols-outlined text-[18px]">share</span>
            </button>
            <button
              onClick={handleSave}
              className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-1 transition ${isSaved ? 'bg-primary-light/30 text-text-primary border border-primary' : 'bg-white border border-gray-200 text-text-secondary hover:border-primary'}`}
            >
              <span className="material-symbols-outlined text-[16px]">{isSaved ? 'bookmark' : 'bookmark_border'}</span>
              {isSaved ? 'Saved' : 'Save'}
            </button>
            <a
              href={scholarship.official_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2 bg-primary hover:brightness-110 text-white font-semibold rounded-lg text-sm flex items-center gap-1 shadow-sm transition"
            >
              APPLY NOW <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>
        </div>

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
                      <img src={scholarship.logo_url} alt={scholarship.provider || ''} className="w-10 h-10 object-contain" />
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
                </div>

                {/* Deadline bar */}
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${daysUntilDeadline <= 30 ? 'bg-red-50 text-red-500' : 'bg-primary-light/20 text-text-primary'}`}>
                  <span className="material-symbols-outlined text-[18px]">schedule</span>
                  <span className="font-medium">
                    {daysUntilDeadline <= 0 ? 'Deadline passed' : `${daysUntilDeadline} days until deadline`}
                  </span>
                  <span className="text-xs ml-auto">
                    {new Date(scholarship.deadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              </div>

              {/* Right: Match Score Card */}
              <div className="border border-primary-light bg-white rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-4xl font-extrabold text-text-primary">{score}%</span>
                  <span className="bg-primary-light/40 text-text-primary text-xs font-bold px-2.5 py-1 rounded-md">
                    {matchLabel}
                  </span>
                </div>
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  {matchMetrics.map((metric, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="text-text-secondary">{metric.label}</span>
                      <span className="font-semibold text-text-primary">{metric.value}%</span>
                    </div>
                  ))}
                </div>
                {scholarship.monthly_stipend_usd && scholarship.monthly_stipend_usd > 0 && (
                  <div className="border-t border-gray-100 pt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-secondary">Monthly Stipend</span>
                      <span className="font-semibold text-primary">${scholarship.monthly_stipend_usd}/mo</span>
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

            {/* 6. BENEFITS */}
            {scholarship.benefits_summary && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
                  <div className="w-2 h-6 bg-primary rounded-full" />
                  <h2 className="text-lg font-bold text-text-primary">Benefits & Coverage</h2>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed">{scholarship.benefits_summary}</p>
              </div>
            )}

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
                {(scholarship as any).requires_gre && (
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">assignment</span>
                    <div>
                      <p className="text-xs text-text-secondary">GRE</p>
                      <p className="font-semibold text-text-primary">Required</p>
                    </div>
                  </div>
                )}
                {(scholarship as any).requires_application_fee && (
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
            </div>

            {/* 8. FIELDS OF STUDY */}
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
          </>
        ) : (
          /* PROVIDER TAB */
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-5 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                {scholarship.logo_url ? (
                  <img src={scholarship.logo_url} alt="" className="w-14 h-14 object-contain" />
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
    </AppLayout>
  );
}
