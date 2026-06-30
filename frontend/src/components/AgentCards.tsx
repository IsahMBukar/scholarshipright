'use client';

import { useState } from 'react';

// ── Shared shapes ───────────────────────────────────────────────
// The agent backend returns loosely-typed JSON; these interfaces
// describe what each card actually consumes. Optional fields are
// the norm — render code already guards every access.

interface EligibilityRequirement {
  requirement?: string;
  detail?: string;
  action?: string;
}

export interface EligibilityCardData {
  eligible?: boolean;
  summary?: string;
  match_score?: number;
  requirements_met?: EligibilityRequirement[];
  requirements_missing?: EligibilityRequirement[];
}

interface ReadinessSection {
  name?: string;
  status?: string;
  score: number;
  feedback?: string;
}

interface ReadinessDocument {
  name?: string;
  description?: string;
  importance?: 'critical' | 'recommended' | string;
}

interface ReadinessImprovement {
  area?: string;
  suggestion?: string;
  impact?: 'high' | 'medium' | 'low' | string;
}

export interface ReadinessCardData {
  overall_score: number;
  summary?: string;
  sections?: ReadinessSection[];
  missing_documents?: ReadinessDocument[];
  improvements?: ReadinessImprovement[];
}

interface RoadmapMilestone {
  category: string;
  month?: number | string;
  action?: string;
  completed?: boolean;
}

interface RoadmapAlternative {
  name?: string;
  reason?: string;
}

export interface RoadmapCardData {
  summary?: string;
  estimated_months?: number | string;
  milestones?: RoadmapMilestone[];
  alternative_scholarships?: RoadmapAlternative[];
}

interface DiscoverOpportunity {
  name?: string;
  type?: string;
  match_reason?: string;
  estimated_match?: number;
}

export interface DiscoverCardData {
  insights?: string;
  opportunities?: DiscoverOpportunity[];
}

export interface DocumentCardData {
  document_type?: string;
  word_count?: number;
  content: string;
  notes?: string;
}

// ── Eligibility Card ────────────────────────────────────────────

export function EligibilityCard({ data }: { data: EligibilityCardData }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-4 ${data.eligible ? 'bg-green-50 border-b border-green-100' : 'bg-red-50 border-b border-red-100'}`}>
        <div className="flex items-center gap-3">
          <span className={`material-symbols-outlined text-[28px] ${data.eligible ? 'text-green-600' : 'text-red-500'}`}>
            {data.eligible ? 'check_circle' : 'cancel'}
          </span>
          <div>
            <h3 className={`text-[16px] font-bold ${data.eligible ? 'text-green-800' : 'text-red-800'}`}>
              {data.eligible ? 'You Are Eligible!' : 'Not Eligible Yet'}
            </h3>
            <p className="text-[13px] text-text-secondary mt-0.5">{data.summary}</p>
          </div>
          {data.match_score && (
            <div className="ml-auto">
              <div className={`text-[24px] font-bold ${data.match_score >= 70 ? 'text-green-600' : data.match_score >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                {Math.round(data.match_score)}%
              </div>
              <p className="text-[11px] text-text-secondary">Match</p>
            </div>
          )}
        </div>
      </div>

      {/* Requirements met */}
      {!!data.requirements_met?.length && (
        <div className="px-5 py-3 border-b border-gray-100">
          <h4 className="text-[12px] font-bold text-green-700 uppercase tracking-wider mb-2">Requirements Met</h4>
          <div className="space-y-2">
            {data.requirements_met?.map((r: EligibilityRequirement, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-green-500 mt-0.5">check_circle</span>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{r.requirement}</p>
                  <p className="text-[12px] text-text-secondary">{r.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Requirements missing */}
      {!!data.requirements_missing?.length && (
        <div className="px-5 py-3">
          <h4 className="text-[12px] font-bold text-red-600 uppercase tracking-wider mb-2">Requirements Missing</h4>
          <div className="space-y-3">
            {data.requirements_missing?.map((r: EligibilityRequirement, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="material-symbols-outlined text-[18px] text-red-400 mt-0.5">cancel</span>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{r.requirement}</p>
                  <p className="text-[12px] text-text-secondary">{r.detail}</p>
                  {r.action && (
                    <p className="text-[12px] text-primary font-medium mt-1">→ {r.action}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Readiness Card ──────────────────────────────────────────────

export function ReadinessCard({ data }: { data: ReadinessCardData }) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    if (score >= 40) return 'text-orange-500 bg-orange-50';
    return 'text-red-500 bg-red-50';
  };

  const getBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-400';
    return 'bg-red-400';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header with overall score */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#f5b942]/10 to-[#f5b942]/5 border-b border-gray-100">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="#e5e7eb" strokeWidth="5" />
              <circle cx="32" cy="32" r="28" fill="none" stroke="#f5b942" strokeWidth="5"
                strokeDasharray={`${(data.overall_score / 100) * 175.9} 175.9`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[16px] font-bold text-text-primary">{data.overall_score}</span>
            </div>
          </div>
          <div>
            <h3 className="text-[16px] font-bold text-text-primary">Application Readiness</h3>
            <p className="text-[13px] text-text-secondary mt-0.5">{data.summary}</p>
          </div>
        </div>
      </div>

      {/* Section scores */}
      <div className="px-5 py-3 border-b border-gray-100">
        <h4 className="text-[12px] font-bold text-text-secondary uppercase tracking-wider mb-3">Section Scores</h4>
        <div className="space-y-2">
          {data.sections?.map((s: ReadinessSection, i: number) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-text-primary">{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${getScoreColor(s.score)}`}>
                    {s.status}
                  </span>
                  <span className="text-[13px] font-bold text-text-primary">{s.score}</span>
                </div>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${getBarColor(s.score)}`} style={{ width: `${s.score}%` }} />
              </div>
              {s.feedback && <p className="text-[11px] text-text-secondary mt-0.5">{s.feedback}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Missing documents */}
      {!!data.missing_documents?.length && (
        <div className="px-5 py-3 border-b border-gray-100">
          <h4 className="text-[12px] font-bold text-red-600 uppercase tracking-wider mb-2">Missing Documents</h4>
          <div className="space-y-2">
            {data.missing_documents?.map((d: ReadinessDocument, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-red-50 rounded-lg">
                <span className="material-symbols-outlined text-[18px] text-red-400 mt-0.5">description</span>
                <div>
                  <p className="text-[13px] font-medium text-red-800">{d.name}</p>
                  <p className="text-[12px] text-red-600">{d.description}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                    d.importance === 'critical' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'
                  }`}>{d.importance}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {!!data.improvements?.length && (
        <div className="px-5 py-3">
          <h4 className="text-[12px] font-bold text-[#f5b942] uppercase tracking-wider mb-2">Improvements</h4>
          <div className="space-y-2">
            {data.improvements?.map((imp: ReadinessImprovement, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className={`material-symbols-outlined text-[16px] mt-0.5 ${
                  imp.impact === 'high' ? 'text-red-500' : imp.impact === 'medium' ? 'text-yellow-500' : 'text-gray-400'
                }`}>trending_up</span>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{imp.area}</p>
                  <p className="text-[12px] text-text-secondary">{imp.suggestion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Roadmap Card ────────────────────────────────────────────────

export function RoadmapCard({ data }: { data: RoadmapCardData }) {
  const categoryColors: Record<string, string> = {
    experience: 'bg-blue-100 text-blue-700',
    research: 'bg-purple-100 text-purple-700',
    language: 'bg-green-100 text-green-700',
    academic: 'bg-yellow-100 text-yellow-700',
    documents: 'bg-gray-100 text-gray-700',
  };

  const categoryIcons: Record<string, string> = {
    experience: 'work',
    research: 'science',
    language: 'translate',
    academic: 'school',
    documents: 'description',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-purple-600">route</span>
          <div>
            <h3 className="text-[16px] font-bold text-text-primary">Your Roadmap to Eligibility</h3>
            <p className="text-[13px] text-text-secondary mt-0.5">{data.summary}</p>
          </div>
          <div className="ml-auto text-center">
            <div className="text-[24px] font-bold text-purple-600">{data.estimated_months}</div>
            <p className="text-[11px] text-text-secondary">months</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-5 py-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-4">
            {data.milestones?.map((m: RoadmapMilestone, i: number) => (
              <div key={i} className="relative pl-10">
                {/* Timeline dot */}
                <div className={`absolute left-2.5 top-1 w-3 h-3 rounded-full border-2 ${
                  m.completed ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300'
                }`} />

                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${categoryColors[m.category] || 'bg-gray-100 text-gray-600'}`}>
                        {m.category}
                      </span>
                      <span className="text-[11px] text-text-secondary">Month {m.month}</span>
                    </div>
                    <p className="text-[13px] font-medium text-text-primary">{m.action}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alternative scholarships */}
      {!!data.alternative_scholarships?.length && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
          <h4 className="text-[12px] font-bold text-[#f5b942] uppercase tracking-wider mb-2">Eligible Alternatives Now</h4>
          <div className="space-y-2">
            {data.alternative_scholarships?.map((alt: RoadmapAlternative, i: number) => (
              <div key={i} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-gray-100">
                <span className="material-symbols-outlined text-[18px] text-[#f5b942] mt-0.5">lightbulb</span>
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{alt.name}</p>
                  <p className="text-[12px] text-text-secondary">{alt.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ── Discover Card ───────────────────────────────────────────────

export function DiscoverCard({ data }: { data: DiscoverCardData }) {
  const typeIcons: Record<string, string> = {
    scholarship: 'school',
    fellowship: 'groups',
    grant: 'paid',
    'phd funding': 'science',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[28px] text-blue-600">explore</span>
          <div>
            <h3 className="text-[16px] font-bold text-text-primary">Opportunities Found</h3>
            <p className="text-[13px] text-text-secondary mt-0.5">{data.insights}</p>
          </div>
        </div>
      </div>

      {/* Opportunities */}
      <div className="divide-y divide-gray-50">
        {data.opportunities?.map((opp: DiscoverOpportunity, i: number) => (
          <div key={i} className="px-5 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] text-blue-600">
                  {(opp.type && typeIcons[opp.type]) || 'school'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-[14px] font-bold text-text-primary truncate">{opp.name}</h4>
                  {opp.estimated_match && (
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      opp.estimated_match >= 70 ? 'bg-green-100 text-green-700' :
                      opp.estimated_match >= 40 ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {opp.estimated_match}% match
                    </span>
                  )}
                </div>
                <span className="text-[11px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">{opp.type}</span>
                <p className="text-[12px] text-text-secondary mt-1">{opp.match_reason}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ── Document Card ───────────────────────────────────────────────

export function DocumentCard({ data }: { data: DocumentCardData }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(data.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 bg-gradient-to-r from-[#f5b942]/10 to-orange-50 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[28px] text-[#f5b942]">edit_document</span>
            <div>
              <h3 className="text-[16px] font-bold text-text-primary capitalize">
                {data.document_type?.replace(/_/g, ' ')} Generated
              </h3>
              <p className="text-[12px] text-text-secondary">{data.word_count} words</p>
            </div>
          </div>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[12px] font-medium text-text-primary hover:bg-gray-50 transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="bg-gray-50 rounded-lg p-4 max-h-[400px] overflow-y-auto">
          <pre className="text-[13px] text-text-primary whitespace-pre-wrap font-sans leading-relaxed">{data.content}</pre>
        </div>
      </div>

      {/* Notes */}
      {data.notes && (
        <div className="px-5 py-3 border-t border-gray-100 bg-yellow-50">
          <div className="flex items-start gap-2">
            <span className="material-symbols-outlined text-[18px] text-yellow-600 mt-0.5">tips_and_updates</span>
            <div>
              <p className="text-[12px] font-bold text-yellow-800 mb-1">Customization Tips</p>
              <p className="text-[12px] text-yellow-700">{data.notes}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
