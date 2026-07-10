'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { ProfileSkeleton } from '@/components/Skeletons';
import OnboardingProgress from '@/components/OnboardingProgress';
import { fetchResumes, fetchProfile, createOrUpdateProfile, updateResume, createManualResume } from '@/services/api';
import type {
  Profile,
  Resume,
  ResumeEducation,
  ResumeExperience,
  ResumeResearchProject,
  ResumeCertification,
  ResumePublication,
  ResumeLanguage,
  ResumeReference,
} from '@/services/api';

// Shared shape for every edit modal in this page. Each modal only touches
// the subset of fields it cares about, so all of these are optional.
// All numeric-looking fields are typed as `string` because HTML inputs
// surface their values as strings — the API layer coerces on save.
type EditFormState = {
  // Contact
  location?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  // Quick stats / targets / research interests
  country_of_origin?: string;
  target_degree?: string;
  field_of_study?: string;
  target_countries?: string[];
  target_fields?: string[];
  research_interests?: string[];
  graduation_year?: string | number;
  degree_level?: string;
  cgpa?: string | number;
  cgpa_scale?: string | number;
  work_experience_years?: string | number;
  has_ielts?: boolean;
  ielts_score?: string | number;
  prior_studies_in_english?: boolean;
  // Resume fields
  summary?: string;
  skills?: string[];
  education?: ResumeEducation[];
  experience?: ResumeExperience[];
  research_projects?: ResumeResearchProject[];
  certifications?: ResumeCertification[];
  publications?: ResumePublication[];
  languages?: ResumeLanguage[];
  ref_list?: ResumeReference[];
};

// Value type accepted by saveResumeField — narrowed to the union of Resume
// field shapes we actually persist. Allows undefined so callers can pass
// optional EditFormState fields directly.
type ResumeFieldValue =
  | string
  | string[]
  | ResumeEducation[]
  | ResumeExperience[]
  | ResumeResearchProject[]
  | ResumeCertification[]
  | ResumePublication[]
  | ResumeLanguage[]
  | ResumeReference[]
  | { location?: string; email?: string; phone?: string; linkedin_url?: string }
  | undefined;
import { COUNTRY_NAMES } from '@/data/countries';
import { POPULAR_FIELDS, FIELDS_OF_STUDY_VALUES, FIELDS_OF_STUDY } from '@/data/fieldsOfStudy';

import {
  getMissingCriticalFields,
  getMissingBoostFields,
  getTotalBoostPotential,
} from '@/hooks/useOnboarding';

const DEGREE_OPTIONS = ['bachelor', 'master', 'phd'];
const CURRENT_EDUCATION_OPTIONS = ['high_school', 'bachelor', 'master', 'phd'];
const COUNTRIES = COUNTRY_NAMES;
const FIELDS = POPULAR_FIELDS;
const LANGUAGES_LIST = ['English', 'French', 'Arabic', 'Portuguese', 'Swahili', 'Spanish', 'German', 'Japanese', 'Chinese', 'Korean', 'Turkish'];
const POPULAR_TARGET_COUNTRIES = ['Germany', 'United Kingdom', 'United States', 'Canada', 'Japan', 'Australia', 'France', 'Sweden', 'Netherlands', 'Switzerland', 'South Korea', 'China', 'Turkey', 'Belgium'];

const TABS = ['Personal', 'Education', 'Work Experience', 'Research & Projects', 'Skills'];

/* ─── Timeline Entry ─── */
function TimelineEntry({ date, title, subtitle, details, isLast }: {
  date: string; title: string; subtitle?: string; details?: string[]; isLast?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center pt-1">
        <div className="w-3 h-3 rounded-full border-2 border-primary bg-white flex-shrink-0 shadow-sm" />
        {!isLast && <div className="w-[2px] bg-primary/20 flex-1 mt-1" />}
      </div>
      <div className="pb-7 flex-1 min-w-0">
        <span className="inline-block px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-semibold rounded-full mb-1.5">{date}</span>
        <h4 className="text-[15px] font-bold text-text-primary leading-snug">{title}</h4>
        {subtitle && <p className="text-[13px] text-text-secondary mt-0.5">{subtitle}</p>}
        {details && details.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {details.map((d, i) => (
              <li key={i} className="text-[13px] text-text-secondary leading-relaxed flex gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ─── Contact Pill ─── */
function ContactPill({ icon, text, href }: { icon: string; text: string; href?: string }) {
  const inner = (
    <>
      <span className="material-symbols-outlined text-[14px] text-primary">{icon}</span>
      <span className="text-[12px] text-text-secondary truncate max-w-[200px]">{text}</span>
    </>
  );
  const cls = "flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 border border-primary/15 rounded-full hover:bg-primary/10 transition-colors";
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{inner}</a> : <div className={cls}>{inner}</div>;
}

/* ─── Section Header ─── */
function SectionHeader({ title, icon, onEdit }: { title: string; icon: string; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
        <h3 className="text-[16px] font-bold text-text-primary">{title}</h3>
      </div>
      {onEdit && (
        <button onClick={onEdit} className="p-2 hover:bg-primary/10 rounded-lg transition-colors group">
          <span className="material-symbols-outlined text-[16px] text-text-secondary group-hover:text-primary">edit</span>
        </button>
      )}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number | undefined }) {
  return (
    <div className="bg-primary/5 border border-primary/15 rounded-xl p-3.5">
      <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>
      <p className="text-[11px] text-text-secondary mt-1 font-medium">{label}</p>
      <p className="text-[16px] font-bold text-text-primary mt-0.5">{value || '—'}</p>
    </div>
  );
}

/* ─── Resume Strength Card ─── */
const SECTION_LABELS: Record<string, string> = {
  full_name: 'Full name',
  email: 'Email',
  phone: 'Phone',
  location: 'Location',
  linkedin_url: 'LinkedIn URL',
  portfolio_url: 'Portfolio URL',
  summary: 'Professional summary',
  education: 'Education',
  experience: 'Experience',
  skills: 'Skills',
  languages: 'Languages',
  projects: 'Projects',
  research_projects: 'Research projects',
  publications: 'Publications',
  awards: 'Awards',
  certifications: 'Certifications',
  ref_list: 'References',
};

const GRADE_STYLES: Record<string, { bg: string; text: string; bar: string }> = {
  Excellent: { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  Strong:    { bg: 'bg-sky-50',     text: 'text-sky-700',     bar: 'bg-sky-500' },
  Fair:      { bg: 'bg-amber-50',   text: 'text-amber-700',   bar: 'bg-amber-500' },
  Incomplete:{ bg: 'bg-rose-50',    text: 'text-rose-700',    bar: 'bg-rose-500' },
};

function ResumeStrengthCard({ data }: { data: NonNullable<Resume['level_aware_completeness']> | null }) {
  if (!data) return null;
  const { base_score, bonus_score, total_score, display_score, grade, missing_required, present_bonus, level_label, hint, present_required, required_count } = data;
  const style = GRADE_STYLES[grade] ?? GRADE_STYLES.Fair;
  // Widths: required section gets a bar up to 100%, bonus adds extra on top
  // (uncapped). For the visual, we cap the bar at 100% and use a small
  // "+5% bonus" tag when there's bonus content.
  const cappedBase = Math.min(base_score, 100);
  return (
    <div className="mt-4 border border-primary/20 rounded-xl bg-gradient-to-br from-primary/5 to-transparent p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">workspace_premium</span>
          <h3 className="text-[14px] font-bold text-text-primary">Resume Strength</h3>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${style.bg} ${style.text}`}>
          {grade}
        </span>
      </div>
      <p className="text-[11px] text-text-secondary -mt-1 mb-3">
        Scored for: <span className="font-semibold text-text-primary">{level_label}</span>
      </p>

      {/* Score bar — required (up to 100%) + bonus (overflow) */}
      <div className="space-y-2 mb-3">
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="font-medium text-text-secondary">
              Base completeness ({present_required.length} / {required_count} required)
            </span>
            <span className="font-bold text-text-primary">{cappedBase.toFixed(0)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full ${style.bar} transition-all`} style={{ width: `${cappedBase}%` }} />
          </div>
        </div>
        {bonus_score > 0 && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-text-secondary">
              Bonus sections ({present_bonus.length} non-standard for this level)
            </span>
            <span className="font-bold text-emerald-700">+{bonus_score.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Total summary line */}
      <p className="text-[12px] text-text-secondary leading-relaxed mb-2">
        Total: <span className="font-bold text-text-primary">{display_score.toFixed(0)}%</span>
        {total_score > 100 && (
          <span className="text-emerald-700 font-semibold">
            {' '}(raw {total_score.toFixed(0)}%)
          </span>
        )}
        {' '}— {grade === 'Excellent' ? 'your resume is highly competitive for this level.' :
                grade === 'Strong' ? 'solid foundation, a few additions would push you into the top tier.' :
                grade === 'Fair' ? 'good progress — focus on the missing required sections below.' :
                'a strong start — fill in the required sections to be considered.'}
      </p>

      {/* Missing required sections */}
      {missing_required.length > 0 && (
        <div className="mt-3 pt-3 border-t border-primary/10">
          <p className="text-[11px] font-semibold text-text-primary mb-1.5">
            Missing for {level_label} ({missing_required.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missing_required.map(s => (
              <span key={s} className="text-[11px] bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2 py-0.5">
                {SECTION_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Present bonus sections */}
      {present_bonus.length > 0 && (
        <div className="mt-3 pt-3 border-t border-primary/10">
          <p className="text-[11px] font-semibold text-text-primary mb-1.5">
            Bonus sections you have ({present_bonus.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {present_bonus.map(s => (
              <span key={s} className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">
                {SECTION_LABELS[s] ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Per-level hint */}
      <div className="mt-3 pt-3 border-t border-primary/10 flex gap-2">
        <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 flex-shrink-0">tips_and_updates</span>
        <p className="text-[12px] text-text-secondary leading-relaxed italic">{hint}</p>
      </div>
    </div>
  );
}

/* ─── Empty State ─── */
function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center py-8 text-center">
      <span className="material-symbols-outlined text-[32px] text-primary/30 mb-2">{icon}</span>
      <p className="text-[13px] text-text-secondary max-w-[280px]">{message}</p>
    </div>
  );
}

/* ─── Modal Shell ─── */
function Modal({ title, onClose, children, dirty }: { title: string; onClose: () => void; children: React.ReactNode; dirty?: boolean }) {
  function handleClose() {
    if (dirty) {
      if (!window.confirm('You have unsaved changes. Discard them?')) return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-xl border border-primary/20" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[18px] font-bold text-text-primary">{title}</h3>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <span className="material-symbols-outlined text-[18px] text-text-secondary">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ─── Form Field (from shared components/form/FormHelpers) ─── */
import { Field, Input, Select } from '@/components/form/FormHelpers';

function SaveButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
      <button onClick={onClick} disabled={loading} className="px-6 py-2.5 bg-primary text-text-inverse text-[13px] font-bold rounded-lg hover:brightness-110 transition-all shadow-sm disabled:opacity-50">
        {loading ? 'Saving...' : 'Save Changes'}
      </button>
    </div>
  );
}

/* ─── Tag Multi-Select ─── */
function TagSelect({
  options,
  selected,
  onToggle,
  allOptions,
  placeholder = 'Other…',
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  /** Full option list for searchable "Other" dropdown. When provided,
   *  any selected items NOT in `options` are shown as extra chips,
   *  and an "Other…" chip opens a searchable dropdown from this list. */
  allOptions?: string[];
  placeholder?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Custom selections (in selected but not in the popular options list)
  const popularSet = new Set(options);
  const customSelected = selected.filter(s => !popularSet.has(s));

  // Filtered results from the full list
  const filteredOptions = useMemo(() => {
    if (!allOptions) return [];
    const selectedSet = new Set(selected);
    const q = query.toLowerCase().trim();
    return allOptions
      .filter(o => !selectedSet.has(o) && (q === '' || o.toLowerCase().includes(q)))
      .slice(0, 20); // max 20 results
  }, [allOptions, selected, query]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [searchOpen]);

  // Focus input when dropdown opens
  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {/* Popular options */}
        {options.map(o => (
          <button key={o} onClick={() => onToggle(o)} className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border ${selected.includes(o) ? 'bg-primary text-text-inverse border-primary' : 'bg-gray-50 text-text-secondary border-gray-200 hover:border-primary/30'}`}>
            {o.replace(/_/g, ' ')}
          </button>
        ))}

        {/* Custom-selected items (not in popular list) */}
        {customSelected.map(o => (
          <button key={o} onClick={() => onToggle(o)} className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border bg-primary text-text-inverse border-primary flex items-center gap-1">
            {o.replace(/_/g, ' ')}
            <span className="material-symbols-outlined text-[12px] opacity-70">close</span>
          </button>
        ))}

        {/* "Other…" chip — opens searchable dropdown */}
        {allOptions && (
          <div className="relative" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors border bg-gray-50 text-primary border-primary/30 hover:bg-primary/5 flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[13px]">add</span>
              Other…
            </button>

            {searchOpen && (
              <div className="absolute top-full left-0 mt-1 w-[260px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-primary"
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto">
                  {filteredOptions.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-text-secondary">No countries found</p>
                  ) : (
                    filteredOptions.map(o => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => {
                          onToggle(o);
                          setQuery('');
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-text-primary hover:bg-primary/5 transition-colors"
                      >
                        {o}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // useSearchParams() in App Router requires a Suspense boundary. We
  // split the page into an inner component and wrap the export in
  // <Suspense> so the URL query (?focus=matching) can be read.
  return (
    <Suspense
      fallback={
        <AppLayout>
          <PageHeader title="PROFILE" />
          <div className="min-h-[60vh] flex items-center justify-center text-text-secondary text-sm">
            Loading…
          </div>
        </AppLayout>
      }
    >
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const [activeTab, setActiveTab] = useState('Personal');
  const [resume, setResume] = useState<Resume | null>(null);
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // `?focus=matching` makes the page highlight the 3 fields the match
  // engine needs (country of origin, target degree, target countries).
  // Comes from the onboarding hub's "Complete profile" button.
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusMatching = searchParams.get('focus') === 'matching';
  const [showMatchingBanner, setShowMatchingBanner] = useState(focusMatching);

  useEffect(() => {
    setShowMatchingBanner(focusMatching);
  }, [focusMatching]);

  // Edit form states
  const [editForm, setEditForm] = useState<EditFormState>({});
  const editFormSnapshot = useRef<EditFormState>({});

  // Compute dirty by comparing current form to snapshot
  const isFormDirty = () => {
    const snap = editFormSnapshot.current;
    return JSON.stringify(editForm) !== JSON.stringify(snap);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [resumes, profileData] = await Promise.all([
          fetchResumes().catch((err) => { console.error('[Profile] Failed to fetch resumes:', err); return []; }),
          // fetchProfile returns null on 404 (no profile row yet — common for
          // fresh users right after onboarding). Coerce to {} so all downstream
          // `profile.X` reads return undefined instead of crashing.
          fetchProfile().catch((err) => { console.error('[Profile] Failed to fetch profile:', err); return null; }),
        ]);
        const primary = resumes.find((r) => r.is_primary) || resumes[0];
        setResume(primary || null);
        setProfile(profileData || {});
      } catch (err) { console.error('[Profile] Failed to load profile data:', err); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const openEdit = (section: string, data?: EditFormState) => {
    const formData: EditFormState = data || {};
    editFormSnapshot.current = JSON.parse(JSON.stringify(formData));
    setEditing(section);
    setEditForm(formData);
  };

  const saveProfile = async (data: Partial<Profile>) => {
    setSaving(true);
    try {
      await createOrUpdateProfile({ ...profile, ...data });
      setProfile(prev => ({ ...prev, ...data }));
      setEditing(null);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const saveResumeField = async (field: string, value: ResumeFieldValue) => {
    if (!resume?.id) return;
    setSaving(true);
    try {
      await updateResume(resume.id, { [field]: value });
      setResume((prev) => prev ? ({ ...prev, [field]: value }) : prev);
      setEditing(null);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const toggleArr = (arr: string[], item: string) => arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  if (loading) return <AppLayout><PageHeader title="PROFILE" /><ProfileSkeleton /></AppLayout>;

  const edu = (resume?.education || []).slice().reverse();
  const exp = (resume?.experience || []).slice().reverse();
  const rp = (resume?.research_projects || []).slice().reverse();
  const skills: string[] = resume?.skills || [];
  const certs = resume?.certifications || [];
  const langs = resume?.languages || [];
  const pubs = resume?.publications || [];
  const refs = resume?.ref_list || [];

  const fmtDate = (s?: string, e?: string) => `${s || '?'} → ${e || 'Present'}`;

  // Which matching fields are still missing?
  // CRITICAL = blocks matches from being meaningful (3 fields)
  // BOOST    = improves score (up to ~37 extra points)
  const missingCritical = getMissingCriticalFields(profile);
  const missingBoost = getMissingBoostFields(profile);
  const totalBoost = getTotalBoostPotential(profile);
  const showMatching = showMatchingBanner && (missingCritical.length > 0 || missingBoost.length > 0);

  return (
    <AppLayout>
      <PageHeader title="PROFILE" />
      <OnboardingProgress />
      <div className="px-4 md:px-6 py-6 max-w-[860px]">

        {/* Matching-fields focus banner (shown after onboarding hub CTA) */}
        {showMatching && (
          <MatchingFieldsPrompt
            critical={missingCritical}
            boost={missingBoost}
            totalBoostPoints={totalBoost}
            onDismiss={() => setShowMatchingBanner(false)}
            onEdit={() => openEdit('targets', {
              country_of_origin: profile.country_of_origin,
              target_degree: profile.target_degree,
              target_countries: profile.target_countries,
            })}
          />
        )}

        {/* No-resume banner (manual path / fresh user) */}
        {!resume && (
          <NoResumeBanner
            onUpload={() => router.push('/resume')}
            onManual={async () => {
              try {
                const stub = await createManualResume();
                setResume(stub);
              } catch (err) {
                console.error('[Profile] Failed to create manual resume:', err);
              }
            }}
          />
        )}

        {/* Privacy Banner */}
        <div className="flex items-center gap-2.5 px-4 py-3 bg-primary/8 border border-primary/15 rounded-xl mb-5">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[15px] text-primary">mood</span>
          </div>
          <span className="text-[13px] text-text-secondary flex-1">Your profile data is kept private and secure.</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors relative ${activeTab === tab ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}>
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-2 right-2 h-[3px] bg-primary rounded-full" />}
            </button>
          ))}
        </div>

        {/* Content Card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

          {/* ══════ PERSONAL ══════ */}
          {activeTab === 'Personal' && (
            <div className="divide-y divide-gray-100">
              <div className="p-5 md:p-6">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-[24px] font-extrabold text-text-primary uppercase tracking-wide leading-tight">
                    {resume?.full_name || profile?.university || 'Your Name'}
                  </h2>
                  <button onClick={() => openEdit('contact')} className="p-2 hover:bg-primary/10 rounded-lg transition-colors group">
                    <span className="material-symbols-outlined text-[18px] text-text-secondary group-hover:text-primary">edit</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {resume?.location && <ContactPill icon="location_on" text={resume.location} />}
                  {resume?.email && <ContactPill icon="email" text={resume.email} />}
                  {resume?.phone && <ContactPill icon="phone" text={resume.phone} />}
                  {resume?.linkedin_url && <ContactPill icon="link" text={resume.linkedin_url} href={resume.linkedin_url} />}
                  {!resume?.email && !resume?.phone && <p className="text-[13px] text-text-secondary italic">Upload a resume to auto-fill contact info</p>}
                </div>
              </div>

              <div className="p-5 md:p-6">
                <SectionHeader title="Quick Stats" icon="analytics" onEdit={() => openEdit('stats', {
                  country_of_origin: profile.country_of_origin,
                  target_degree: profile.target_degree,
                  field_of_study: profile.field_of_study,
                  target_countries: profile.target_countries,
                  graduation_year: profile.graduation_year,
                  degree_level: profile.degree_level,
                  cgpa: profile.cgpa,
                  cgpa_scale: profile.cgpa_scale,
                  work_experience_years: profile.work_experience_years,
                  has_ielts: profile.has_ielts,
                  ielts_score: profile.ielts_score,
                })} />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <StatCard icon="public" label="Country" value={profile.country_of_origin} />
                  <StatCard icon="school" label="Target Degree" value={profile.target_degree ? profile.target_degree.charAt(0).toUpperCase() + profile.target_degree.slice(1) : undefined} />
                  <StatCard icon="science" label="Field of Study" value={profile.field_of_study ? profile.field_of_study.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : undefined} />
                  <StatCard icon="travel_explore" label="Target Countries" value={profile.target_countries?.length ? `${profile.target_countries.length} selected` : undefined} />
                  <StatCard icon="calendar_today" label="Graduation" value={profile.graduation_year} />
                  <StatCard icon="school" label="Current Degree" value={profile.degree_level ? profile.degree_level.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : undefined} />
                  <StatCard icon="grade" label="CGPA" value={profile.cgpa} />
                  <StatCard icon="work" label="Experience" value={profile.work_experience_years ? `${profile.work_experience_years} yrs` : undefined} />
                  <StatCard icon="translate" label="IELTS" value={profile.has_ielts ? profile.ielts_score : undefined} />
                </div>
                {profile.prior_studies_in_english && (
                  <div className="mt-3 flex items-center gap-2 text-[12px] text-text-secondary bg-primary/5 border border-primary/20 rounded-btn px-3 py-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">school</span>
                    <span>
                      Prior degree taught in English — English-test waiver is active on your matches.
                    </span>
                  </div>
                )}
                <ResumeStrengthCard data={resume?.level_aware_completeness ?? null} />
              </div>

              <div className="p-5 md:p-6">
                <SectionHeader title="Summary" icon="description" onEdit={() => openEdit('summary', { summary: resume?.summary || '' })} />
                <p className="text-[14px] text-text-secondary leading-relaxed">
                  {resume?.summary || (profile.research_interests?.length ? `Research interests: ${profile.research_interests.join(', ')}` : 'No summary yet. Upload a resume or add your profile details.')}
                </p>
              </div>
            </div>
          )}

          {/* ══════ EDUCATION ══════ */}
          {activeTab === 'Education' && (
            <div className="divide-y divide-gray-100">
              <div className="p-5 md:p-6">
                <SectionHeader title="Education" icon="school" onEdit={() => openEdit('education', { education: resume?.education || [] })} />
                {edu.length > 0 ? (
                  <div className="ml-1">
                    {edu.map((e, i) => (
                      <TimelineEntry key={i} date={fmtDate(e.start_date || e.date, e.end_date)} title={e.degree || 'Degree'} subtitle={e.institution || ''} details={[e.field_of_study, e.gpa ? `CGPA ${e.gpa}` : null, e.description].filter(Boolean) as string[]} isLast={i === edu.length - 1} />
                    ))}
                  </div>
                ) : <EmptyState icon="school" message="No education entries. Upload a resume to auto-populate." />}
              </div>

              {certs.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="Certifications" icon="verified" onEdit={() => openEdit('certifications', { certifications: resume?.certifications || [] })} />
                  <div className="space-y-3">
                    {certs.map((c, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-primary/5 rounded-xl border border-primary/10">
                        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-primary">workspace_premium</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-text-primary">{c.name}</p>
                          <p className="text-[12px] text-text-secondary">{c.issuer}{c.date ? ` • ${c.date}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pubs.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="Publications" icon="article" onEdit={() => openEdit('publications', { publications: resume?.publications || [] })} />
                  <div className="space-y-3">
                    {pubs.map((p, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-primary">description</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-text-primary">{p.title}</p>
                          <p className="text-[12px] text-text-secondary">{p.journal}{p.date ? ` • ${p.date}` : ''}{p.doi && <a href={p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" className="text-primary ml-1 hover:underline text-[11px]">DOI ↗</a>}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══════ WORK EXPERIENCE ══════ */}
          {activeTab === 'Work Experience' && (
            <div className="p-5 md:p-6">
              <SectionHeader title="Work Experience" icon="work" onEdit={() => openEdit('experience', { experience: resume?.experience || [] })} />
              {exp.length > 0 ? (
                <div className="ml-1">
                  {exp.map((e, i) => {
                    const achievements = (e as { achievements?: string[] }).achievements;
                    const details = achievements?.length ? achievements : (e.description ? [e.description] : []);
                    return (
                      <TimelineEntry key={i} date={fmtDate(e.start_date, e.end_date)} title={e.position || e.title || 'Role'} subtitle={e.company || ''} details={details} isLast={i === exp.length - 1} />
                    );
                  })}
                </div>
              ) : <EmptyState icon="work" message="No work experience listed. Upload a resume to auto-populate." />}
            </div>
          )}

          {/* ══════ RESEARCH & PROJECTS ══════ */}
          {activeTab === 'Research & Projects' && (
            <div className="p-5 md:p-6">
              <SectionHeader title="Research & Projects" icon="science" onEdit={() => openEdit('research_projects', { research_projects: resume?.research_projects || [] })} />
              {rp.length > 0 ? (
                <div className="ml-1">
                  {rp.map((r, i) => (
                    <TimelineEntry key={i} date={fmtDate(r.start_date, r.end_date)} title={r.title || 'Project'} subtitle={[r.organization, r.role].filter(Boolean).join(' • ')} details={[r.description, r.technologies ? `Tech: ${r.technologies}` : null, r.outcomes ? `Outcomes: ${r.outcomes}` : null].filter(Boolean) as string[]} isLast={i === rp.length - 1} />
                  ))}
                </div>
              ) : <EmptyState icon="science" message="No research or projects listed. Upload a resume to auto-populate." />}
            </div>
          )}

          {/* ══════ SKILLS ══════ */}
          {activeTab === 'Skills' && (
            <div className="divide-y divide-gray-100">
              <div className="p-5 md:p-6">
                <SectionHeader title="Skills" icon="psychology" onEdit={() => openEdit('skills', { skills: [...skills] })} />
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s, i) => <span key={i} className="px-3.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-text-secondary font-medium">{s}</span>)}
                  </div>
                ) : <EmptyState icon="psychology" message="No skills listed." />}
              </div>

              {langs.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="Languages" icon="translate" onEdit={() => openEdit('languages', { languages: resume?.languages || [] })} />
                  <div className="flex flex-wrap gap-2">
                    {langs.map((l, i) => {
                      const name = typeof l === 'string' ? l : l.language;
                      const prof = typeof l === 'object' && l.proficiency ? l.proficiency : '';
                      return (
                        <div key={i} className="flex items-center gap-2 px-3.5 py-2 bg-primary/5 border border-primary/15 rounded-lg">
                          <span className="material-symbols-outlined text-[14px] text-primary">flag</span>
                          <span className="text-[13px] font-semibold text-text-primary">{name}</span>
                          {prof && <span className="text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{prof}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {profile.target_countries && profile.target_countries.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="Target Countries" icon="public" onEdit={() => openEdit('targets', { target_countries: profile.target_countries, target_degree: profile.target_degree, target_fields: profile.target_fields })} />
                  <div className="flex flex-wrap gap-2">
                    {profile.target_countries.map(c => <span key={c} className="px-3.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[13px] text-text-secondary font-medium">{c}</span>)}
                  </div>
                </div>
              )}

              {profile.research_interests && profile.research_interests.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="Research Interests" icon="biotech" onEdit={() => openEdit('research_interests', { research_interests: profile.research_interests })} />
                  <div className="flex flex-wrap gap-2">
                    {profile.research_interests.map(r => <span key={r} className="px-3.5 py-1.5 bg-primary/5 border border-primary/15 rounded-lg text-[13px] text-primary font-medium">{r.replace(/_/g, ' ')}</span>)}
                  </div>
                </div>
              )}

              {refs.length > 0 && (
                <div className="p-5 md:p-6">
                  <SectionHeader title="References" icon="contacts" onEdit={() => openEdit('ref_list', { ref_list: resume?.ref_list || [] })} />
                  <div className="space-y-3">
                    {refs.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-primary">person</span>
                        </div>
                        <div>
                          <p className="text-[13px] font-bold text-text-primary">{r.name}</p>
                          <p className="text-[12px] text-text-secondary">{r.position}</p>
                          {r.contact && <p className="text-[12px] text-primary">{r.contact}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════ EDIT MODALS ═══════════════ */}

      {/* Contact */}
      {editing === 'contact' && (
        <Modal title="Edit Contact Info" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            <Field label="Location"><Input value={editForm.location || resume?.location || ''} onChange={v => setEditForm({ ...editForm, location: v })} placeholder="City, Country" /></Field>
            <Field label="Email"><Input value={editForm.email || resume?.email || ''} onChange={v => setEditForm({ ...editForm, email: v })} placeholder="email@example.com" /></Field>
            <Field label="Phone"><Input value={editForm.phone || resume?.phone || ''} onChange={v => setEditForm({ ...editForm, phone: v })} placeholder="+1234567890" /></Field>
            <Field label="LinkedIn URL"><Input value={editForm.linkedin_url || resume?.linkedin_url || ''} onChange={v => setEditForm({ ...editForm, linkedin_url: v })} placeholder="https://linkedin.com/in/..." /></Field>
          </div>
          <SaveButton loading={saving} onClick={() => saveResumeField('contact', { location: editForm.location, email: editForm.email, phone: editForm.phone, linkedin_url: editForm.linkedin_url })} />
        </Modal>
      )}

      {/* Quick Stats */}
      {editing === 'stats' && (
        <Modal title="Edit Quick Stats" onClose={() => setEditing(null)}>
          <div className="space-y-5">
            {/* Section A: Onboarding-collected fields (target + origin) */}
            <div>
              <h3 className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider mb-2.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-text-inverse text-[9px] font-bold">1</span>
                Target & Origin
              </h3>
              <div className="space-y-3">
                <Field label="Country of origin">
                  <Select value={editForm.country_of_origin || ''} onChange={v => setEditForm({ ...editForm, country_of_origin: v })} options={[{ value: '', label: 'Select' }, ...COUNTRIES.map(c => ({ value: c, label: c }))]} />
                </Field>
                <Field label="Target degree">
                  <Select value={editForm.target_degree || ''} onChange={v => setEditForm({ ...editForm, target_degree: v })} options={[{ value: '', label: 'Select' }, ...DEGREE_OPTIONS.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1) }))]} />
                </Field>
                <Field label="Field of study">
                  <Select value={editForm.field_of_study || ''} onChange={v => setEditForm({ ...editForm, field_of_study: v })} options={[{ value: '', label: 'Select' }, ...FIELDS_OF_STUDY]} />
                </Field>
                <Field label="Target countries">
                  <TagSelect options={POPULAR_TARGET_COUNTRIES} selected={editForm.target_countries || []} onToggle={c => setEditForm({ ...editForm, target_countries: toggleArr(editForm.target_countries || [], c) })} allOptions={COUNTRY_NAMES} placeholder="Search countries…" />
                </Field>
              </div>
            </div>

            {/* Section B: Quick stats (academic + English proficiency) */}
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider mb-2.5 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 text-text-secondary text-[9px] font-bold">2</span>
                Quick stats
                <span className="text-text-secondary/70 normal-case font-medium">— boost your match score</span>
              </h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Graduation year">
                    <Input value={editForm.graduation_year?.toString() || ''} onChange={v => setEditForm({ ...editForm, graduation_year: v })} type="number" placeholder="e.g. 2024" />
                  </Field>
                  <Field label="Current degree">
                    <Select value={editForm.degree_level || ''} onChange={v => setEditForm({ ...editForm, degree_level: v })} options={[{ value: '', label: 'Select' }, ...CURRENT_EDUCATION_OPTIONS.map(d => ({ value: d, label: d === 'high_school' ? 'High School' : d.charAt(0).toUpperCase() + d.slice(1) }))]} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CGPA"><Input value={editForm.cgpa?.toString() || ''} onChange={v => setEditForm({ ...editForm, cgpa: v })} type="number" placeholder="e.g. 3.50" /></Field>
                  <Field label="CGPA scale">
                    <Select value={editForm.cgpa_scale?.toString() || '4.0'} onChange={v => setEditForm({ ...editForm, cgpa_scale: v })} options={[{ value: '4.0', label: '4.0' }, { value: '5.0', label: '5.0' }, { value: '10.0', label: '10.0' }, { value: '100', label: '100%' }]} />
                  </Field>
                </div>
                <Field label="Work experience (years)"><Input value={editForm.work_experience_years?.toString() || ''} onChange={v => setEditForm({ ...editForm, work_experience_years: v })} type="number" placeholder="e.g. 3" /></Field>
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="has_ielts_edit" checked={editForm.has_ielts || false} onChange={e => setEditForm({ ...editForm, has_ielts: e.target.checked })} className="w-4 h-4 accent-primary" />
                  <label htmlFor="has_ielts_edit" className="text-[14px] text-text-primary cursor-pointer">I have an IELTS score</label>
                </div>
                {editForm.has_ielts && <Field label="IELTS Score"><Input value={editForm.ielts_score?.toString() || ''} onChange={v => setEditForm({ ...editForm, ielts_score: v })} type="number" placeholder="e.g. 7.0" /></Field>}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="prior_english_edit"
                    checked={editForm.prior_studies_in_english || false}
                    onChange={e => setEditForm({ ...editForm, prior_studies_in_english: e.target.checked })}
                    className="w-4 h-4 accent-primary"
                  />
                  <label htmlFor="prior_english_edit" className="text-[14px] text-text-primary cursor-pointer">
                    My prior degree was taught in English
                  </label>
                </div>
                {editForm.prior_studies_in_english && (
                  <p className="text-[12px] text-text-secondary leading-relaxed -mt-2">
                    We&apos;ll treat this as a waiver for English-test requirements on
                    scholarships that accept prior-English study.
                  </p>
                )}
              </div>
            </div>
          </div>
          <SaveButton loading={saving} onClick={() => saveProfile({
            country_of_origin: editForm.country_of_origin,
            target_degree: editForm.target_degree,
            field_of_study: editForm.field_of_study,
            target_countries: editForm.target_countries,
            graduation_year: editForm.graduation_year ? parseInt(String(editForm.graduation_year)) : undefined,
            degree_level: editForm.degree_level,
            cgpa: editForm.cgpa ? parseFloat(String(editForm.cgpa)) : undefined,
            cgpa_scale: editForm.cgpa_scale ? parseFloat(String(editForm.cgpa_scale)) : undefined,
            work_experience_years: editForm.work_experience_years ? parseInt(String(editForm.work_experience_years)) : undefined,
            has_ielts: editForm.has_ielts,
            ielts_score: editForm.ielts_score ? parseFloat(String(editForm.ielts_score)) : undefined,
            prior_studies_in_english: editForm.prior_studies_in_english,
          })} />
        </Modal>
      )}

      {/* Summary */}
      {editing === 'summary' && (
        <Modal title="Edit Summary" onClose={() => setEditing(null)}>
          <Field label="Professional Summary">
            <textarea value={editForm.summary || ''} onChange={e => setEditForm({ ...editForm, summary: e.target.value })} rows={5} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none resize-none" placeholder="Write a brief professional summary..." />
          </Field>
          <SaveButton loading={saving} onClick={() => saveResumeField('summary', editForm.summary)} />
        </Modal>
      )}

      {/* Education */}
      {editing === 'education' && (
        <Modal title="Edit Education" onClose={() => setEditing(null)}>
          {(editForm.education || []).map((edu: ResumeEducation & { date?: string }, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Entry {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.education || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, education: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={edu.degree || ''} onChange={v => { const arr = [...(editForm.education || [])]; arr[idx] = { ...arr[idx], degree: v }; setEditForm({ ...editForm, education: arr }); }} placeholder="Degree (e.g. B.Sc. Computer Science)" />
              <Input value={edu.institution || ''} onChange={v => { const arr = [...(editForm.education || [])]; arr[idx] = { ...arr[idx], institution: v }; setEditForm({ ...editForm, education: arr }); }} placeholder="Institution" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={edu.start_date || edu.date || ''} onChange={v => { const arr = [...(editForm.education || [])]; arr[idx] = { ...arr[idx], start_date: v }; setEditForm({ ...editForm, education: arr }); }} placeholder="Start date" />
                <Input value={edu.end_date || ''} onChange={v => { const arr = [...(editForm.education || [])]; arr[idx] = { ...arr[idx], end_date: v }; setEditForm({ ...editForm, education: arr }); }} placeholder="End date" />
              </div>
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, education: [...(editForm.education || []), { degree: '', institution: '', start_date: '', end_date: '' } as ResumeEducation] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Education
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('education', editForm.education)} />
        </Modal>
      )}

      {/* Experience */}
      {editing === 'experience' && (
        <Modal title="Edit Work Experience" onClose={() => setEditing(null)}>
          {(editForm.experience || []).map((exp: ResumeExperience, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Entry {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.experience || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, experience: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={exp.position || exp.title || ''} onChange={v => { const arr = [...(editForm.experience || [])]; arr[idx] = { ...arr[idx], position: v }; setEditForm({ ...editForm, experience: arr }); }} placeholder="Job Title" />
              <Input value={exp.company || ''} onChange={v => { const arr = [...(editForm.experience || [])]; arr[idx] = { ...arr[idx], company: v }; setEditForm({ ...editForm, experience: arr }); }} placeholder="Company" />
              <div className="grid grid-cols-2 gap-2">
                <Input value={exp.start_date || ''} onChange={v => { const arr = [...(editForm.experience || [])]; arr[idx] = { ...arr[idx], start_date: v }; setEditForm({ ...editForm, experience: arr }); }} placeholder="Start date" />
                <Input value={exp.end_date || ''} onChange={v => { const arr = [...(editForm.experience || [])]; arr[idx] = { ...arr[idx], end_date: v }; setEditForm({ ...editForm, experience: arr }); }} placeholder="End date" />
              </div>
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, experience: [...(editForm.experience || []), { position: '', company: '', start_date: '', end_date: '' } as ResumeExperience] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Experience
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('experience', editForm.experience)} />
        </Modal>
      )}

      {/* Research & Projects */}
      {editing === 'research_projects' && (
        <Modal title="Edit Research & Projects" onClose={() => setEditing(null)}>
          {(editForm.research_projects || []).map((rp: ResumeResearchProject, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Entry {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.research_projects || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, research_projects: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={rp.title || ''} onChange={v => { const arr = [...(editForm.research_projects || [])]; arr[idx] = { ...arr[idx], title: v }; setEditForm({ ...editForm, research_projects: arr }); }} placeholder="Project/Research Title" />
              <Input value={rp.organization || ''} onChange={v => { const arr = [...(editForm.research_projects || [])]; arr[idx] = { ...arr[idx], organization: v }; setEditForm({ ...editForm, research_projects: arr }); }} placeholder="Organization" />
              <Input value={rp.technologies || ''} onChange={v => { const arr = [...(editForm.research_projects || [])]; arr[idx] = { ...arr[idx], technologies: v }; setEditForm({ ...editForm, research_projects: arr }); }} placeholder="Technologies used" />
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, research_projects: [...(editForm.research_projects || []), { title: '', organization: '', technologies: '' } as ResumeResearchProject] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Research / Project
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('research_projects', editForm.research_projects)} />
        </Modal>
      )}

      {/* Skills */}
      {editing === 'skills' && (
        <Modal title="Edit Skills" onClose={() => setEditing(null)}>
          <div className="space-y-3">
            {(editForm.skills || []).map((s: string, idx: number) => (
              <div key={idx} className="flex gap-2">
                <Input value={s} onChange={v => { const arr = [...(editForm.skills || [])]; arr[idx] = v; setEditForm({ ...editForm, skills: arr }); }} placeholder="Skill" />
                <button onClick={() => { const arr = [...(editForm.skills || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, skills: arr }); }} className="px-2 text-red-500 hover:bg-red-50 rounded-lg">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => setEditForm({ ...editForm, skills: [...(editForm.skills || []), ''] })} className="w-full py-2 mt-3 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Skill
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('skills', (editForm.skills || []).filter((s: string) => s.trim()))} />
        </Modal>
      )}

      {/* Languages */}
      {editing === 'languages' && (
        <Modal title="Edit Languages" onClose={() => setEditing(null)}>
          <TagSelect options={LANGUAGES_LIST} selected={(editForm.languages || []).map((l: ResumeLanguage | string) => typeof l === 'string' ? l : l.language || '')} onToggle={name => {
            const current = editForm.languages || [];
            const exists = current.find((l: ResumeLanguage | string) => (typeof l === 'string' ? l : l.language) === name);
            setEditForm({ ...editForm, languages: exists ? current.filter((l: ResumeLanguage | string) => (typeof l === 'string' ? l : l.language) !== name) : [...current, name as unknown as ResumeLanguage] });
          }} />
          <SaveButton loading={saving} onClick={() => saveResumeField('languages', editForm.languages)} />
        </Modal>
      )}

      {/* Targets */}
      {editing === 'targets' && (
        <Modal title="Edit Target Preferences" onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="Target Degree">
              <Select value={editForm.target_degree || ''} onChange={v => setEditForm({ ...editForm, target_degree: v })} options={[{ value: '', label: 'Select' }, { value: 'master', label: "Master's" }, { value: 'phd', label: 'PhD' }]} />
            </Field>
            <Field label="Target Countries">
              <TagSelect options={POPULAR_TARGET_COUNTRIES} selected={editForm.target_countries || []} onToggle={c => setEditForm({ ...editForm, target_countries: toggleArr(editForm.target_countries || [], c) })} allOptions={COUNTRY_NAMES} placeholder="Search countries…" />
            </Field>
            <Field label="Target Fields">
              <TagSelect options={FIELDS} selected={editForm.target_fields || []} onToggle={f => setEditForm({ ...editForm, target_fields: toggleArr(editForm.target_fields || [], f) })} allOptions={FIELDS_OF_STUDY_VALUES} placeholder="Search fields…" />
            </Field>
          </div>
          <SaveButton loading={saving} onClick={() => saveProfile({ target_degree: editForm.target_degree, target_countries: editForm.target_countries, target_fields: editForm.target_fields })} />
        </Modal>
      )}

      {/* Research Interests */}
      {editing === 'research_interests' && (
        <Modal title="Edit Research Interests" onClose={() => setEditing(null)}>
          <TagSelect options={FIELDS} selected={editForm.research_interests || []} onToggle={f => setEditForm({ ...editForm, research_interests: toggleArr(editForm.research_interests || [], f) })} allOptions={FIELDS_OF_STUDY_VALUES} placeholder="Search fields…" />
          <SaveButton loading={saving} onClick={() => saveProfile({ research_interests: editForm.research_interests })} />
        </Modal>
      )}

      {/* Certifications */}
      {editing === 'certifications' && (
        <Modal title="Edit Certifications" onClose={() => setEditing(null)}>
          {(editForm.certifications || []).map((c: ResumeCertification, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Cert {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.certifications || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, certifications: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={c.name || ''} onChange={v => { const arr = [...(editForm.certifications || [])]; arr[idx] = { ...arr[idx], name: v }; setEditForm({ ...editForm, certifications: arr }); }} placeholder="Certification name" />
              <Input value={c.issuer || ''} onChange={v => { const arr = [...(editForm.certifications || [])]; arr[idx] = { ...arr[idx], issuer: v }; setEditForm({ ...editForm, certifications: arr }); }} placeholder="Issuer" />
              <Input value={c.date || ''} onChange={v => { const arr = [...(editForm.certifications || [])]; arr[idx] = { ...arr[idx], date: v }; setEditForm({ ...editForm, certifications: arr }); }} placeholder="Date" />
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, certifications: [...(editForm.certifications || []), { name: '', issuer: '', date: '' } as ResumeCertification] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Certification
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('certifications', editForm.certifications)} />
        </Modal>
      )}

      {/* Publications */}
      {editing === 'publications' && (
        <Modal title="Edit Publications" onClose={() => setEditing(null)}>
          {(editForm.publications || []).map((p: ResumePublication, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Pub {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.publications || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, publications: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={p.title || ''} onChange={v => { const arr = [...(editForm.publications || [])]; arr[idx] = { ...arr[idx], title: v }; setEditForm({ ...editForm, publications: arr }); }} placeholder="Paper title" />
              <Input value={p.journal || ''} onChange={v => { const arr = [...(editForm.publications || [])]; arr[idx] = { ...arr[idx], journal: v }; setEditForm({ ...editForm, publications: arr }); }} placeholder="Journal/Conference" />
              <Input value={p.doi || ''} onChange={v => { const arr = [...(editForm.publications || [])]; arr[idx] = { ...arr[idx], doi: v }; setEditForm({ ...editForm, publications: arr }); }} placeholder="DOI" />
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, publications: [...(editForm.publications || []), { title: '', journal: '', doi: '' } as ResumePublication] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Publication
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('publications', editForm.publications)} />
        </Modal>
      )}

      {/* References */}
      {editing === 'ref_list' && (
        <Modal title="Edit References" onClose={() => setEditing(null)}>
          {(editForm.ref_list || []).map((r: ResumeReference, idx: number) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-lg mb-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-bold text-primary">Ref {idx + 1}</span>
                <button onClick={() => { const arr = [...(editForm.ref_list || [])]; arr.splice(idx, 1); setEditForm({ ...editForm, ref_list: arr }); }} className="text-[12px] text-red-500 hover:underline">Remove</button>
              </div>
              <Input value={r.name || ''} onChange={v => { const arr = [...(editForm.ref_list || [])]; arr[idx] = { ...arr[idx], name: v }; setEditForm({ ...editForm, ref_list: arr }); }} placeholder="Name" />
              <Input value={r.position || ''} onChange={v => { const arr = [...(editForm.ref_list || [])]; arr[idx] = { ...arr[idx], position: v }; setEditForm({ ...editForm, ref_list: arr }); }} placeholder="Position" />
              <Input value={r.contact || ''} onChange={v => { const arr = [...(editForm.ref_list || [])]; arr[idx] = { ...arr[idx], contact: v }; setEditForm({ ...editForm, ref_list: arr }); }} placeholder="Contact" />
            </div>
          ))}
          <button onClick={() => setEditForm({ ...editForm, ref_list: [...(editForm.ref_list || []), { name: '', position: '', contact: '' } as ResumeReference] })} className="w-full py-2 border-2 border-dashed border-gray-200 rounded-lg text-[13px] text-text-secondary hover:border-primary hover:text-primary transition-colors">
            + Add Reference
          </button>
          <SaveButton loading={saving} onClick={() => saveResumeField('ref_list', editForm.ref_list)} />
        </Modal>
      )}

    </AppLayout>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Onboarding sub-components used by the banners above.
   ───────────────────────────────────────────────────────────────── */

function MatchingFieldsPrompt({
  critical,
  boost,
  totalBoostPoints,
  onDismiss,
  onEdit,
}: {
  critical: string[];
  boost: Array<{ label: string; points: number; icon: string }>;
  totalBoostPoints: number;
  onDismiss: () => void;
  onEdit: () => void;
}) {
  const isProfileReady = critical.length === 0;
  return (
    <div className={`mb-5 p-4 md:p-5 rounded-2xl border-2 ${
      isProfileReady ? 'border-emerald-200 bg-emerald-50/50' : 'border-primary/30 bg-primary/5'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
          isProfileReady ? 'bg-emerald-100' : 'bg-primary/15'
        }`}>
          <span className={`material-symbols-outlined text-[20px] ${
            isProfileReady ? 'text-emerald-700' : 'text-primary'
          }`}>
            {isProfileReady ? 'check_circle' : 'target'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-bold text-text-primary">
              {isProfileReady
                ? 'Profile is matchable!'
                : 'Finish setting up your matches'}
            </h3>
            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="text-text-secondary hover:text-text-primary p-1"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          {/* Required section — only shown if there are still blockers */}
          {!isProfileReady && (
            <div className="mt-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary/80">
                Required to see matches
              </p>
              <p className="text-[13px] text-text-secondary mt-1">
                We need:{' '}
                <span className="font-semibold text-text-primary">
                  {critical.join(', ')}
                </span>
                . Without these, the engine can&apos;t tell if you&apos;re eligible.
              </p>
            </div>
          )}

          {/* Boost section — only shown if there are still boost opportunities */}
          {boost.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-text-secondary/80">
                  Boost your score
                </p>
                {totalBoostPoints > 0 && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    +{totalBoostPoints} pts possible
                  </span>
                )}
              </div>
              <ul className="mt-1.5 space-y-1">
                {boost.map((b) => (
                  <li
                    key={b.label}
                    className="flex items-center gap-2 text-[12px] text-text-secondary"
                  >
                    <span className="material-symbols-outlined text-[14px] text-text-secondary/70">
                      {b.icon}
                    </span>
                    <span>{b.label}</span>
                    <span className="text-emerald-700 font-semibold ml-auto">
                      +{b.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action button — only when there's something to do */}
          {(critical.length > 0 || boost.length > 0) && (
            <button
              onClick={onEdit}
              className="mt-4 inline-flex items-center gap-1.5 bg-primary text-text-inverse font-bold text-[12px] px-4 py-2 rounded-btn hover:brightness-110 transition-all"
            >
              {isProfileReady ? 'Boost your matches' : 'Add matching details'}
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NoResumeBanner({
  onUpload,
  onManual,
}: {
  onUpload: () => void;
  onManual: () => void | Promise<void>;
}) {
  return (
    <div className="mb-5 p-4 md:p-5 rounded-2xl border-2 border-amber-200 bg-amber-50">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-amber-700 text-[20px]">upload_file</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-text-primary">
            No resume yet
          </h3>
          <p className="text-[13px] text-text-secondary mt-1">
            Upload a resume to auto-fill education, work, and skills — or
            start an empty profile and fill things in by hand.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={onUpload}
              className="inline-flex items-center gap-1.5 bg-primary text-text-inverse font-bold text-[12px] px-4 py-2 rounded-btn hover:brightness-110 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">upload</span>
              Upload a resume
            </button>
            <button
              onClick={onManual}
              className="inline-flex items-center gap-1.5 bg-white border border-gray-200 text-text-primary font-bold text-[12px] px-4 py-2 rounded-btn hover:bg-gray-50 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">edit_note</span>
              Start empty profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
