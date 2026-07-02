'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { Profile } from '@/services/api';
import { COUNTRY_NAMES } from '@/data/countries';
import { FIELDS_OF_STUDY } from '@/data/fieldsOfStudy';

/**
 * ProfileSlide — slide 2 of the onboarding carousel.
 *
 * Two sections:
 *   A. Required for matching (4 critical fields)
 *      - country_of_origin, target_degree, field_of_study, target_countries
 *      These are what the match engine needs to compute scores.
 *
 *   B. Optional quick stats (4 fields, all optional)
 *      - graduation_year, cgpa + cgpa_scale, work_experience_years,
 *        has_ielts + ielts_score
 *      Filling these in improves the match score. They are persisted
 *      to the same profile row, so /profile shows them right away.
 *
 * On save → POST /api/profile with whatever's filled, then advance.
 * Skip is offered as a last-resort escape hatch (jumps to slide 3
 * without saving).
 */

const DEGREE_OPTIONS = [
  { value: 'bachelor', label: "Bachelor's" },
  { value: 'master', label: "Master's" },
  { value: 'phd', label: 'PhD' },
];

const CURRENT_EDUCATION_OPTIONS = [
  { value: 'high_school', label: 'High School' },
  { value: 'bachelor', label: "Bachelor's" },
  { value: 'master', label: "Master's" },
  { value: 'phd', label: 'PhD' },
];

const COUNTRIES_OF_ORIGIN = COUNTRY_NAMES;

const POPULAR_TARGET_COUNTRIES = [
  'United States', 'United Kingdom', 'Canada', 'Germany', 'France',
  'Netherlands', 'Sweden', 'Switzerland', 'Australia', 'Japan',
  'South Korea', 'China', 'Turkey', 'Belgium', 'Singapore',
];

const CGPA_SCALE_OPTIONS = [
  { value: '4.0', label: '4.0 scale' },
  { value: '5.0', label: '5.0 scale' },
  { value: '10.0', label: '10.0 scale' },
  { value: '100', label: '100% scale' },
];

// Year options for graduation_year (current year ± 10)
const GRAD_YEAR = (() => {
  const y = new Date().getFullYear();
  const out: number[] = [];
  for (let i = y - 10; i <= y + 6; i++) out.push(i);
  return out;
})();

/* ─── Searchable "Other" country picker ─── */
function TargetCountryOther({
  onSelect,
  excludeSet,
}: {
  onSelect: (country: string) => void;
  excludeSet: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return COUNTRY_NAMES
      .filter(c => !excludeSet.has(c) && (q === '' || c.toLowerCase().includes(q)))
      .slice(0, 20);
  }, [query, excludeSet]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all bg-white border border-primary/30 text-primary hover:bg-primary/5 flex items-center gap-0.5"
      >
        <span className="material-symbols-outlined text-[13px]">add</span>
        Other…
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-[260px] bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search countries…"
              className="w-full px-3 py-1.5 text-[12px] bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-text-secondary">No countries found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setQuery('');
                    setOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-text-primary hover:bg-primary/5 transition-colors"
                >
                  {c}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfileSlide({
  initialProfile,
  onSave,
  onNext,
  onSkip,
}: {
  initialProfile?: Profile | null;
  onSave: (data: Partial<Profile>) => Promise<Profile | null>;
  onNext: () => void;
  onSkip: () => void;
}) {
  // ── A. Required fields ─────────────────────────────────────────────
  const [country, setCountry] = useState<string>(initialProfile?.country_of_origin || '');
  const [degreeLevel, setDegreeLevel] = useState<string>(initialProfile?.degree_level || '');
  const [targetDegree, setTargetDegree] = useState<string>(initialProfile?.target_degree || '');
  const [field, setField] = useState<string>(initialProfile?.field_of_study || '');
  const [targets, setTargets] = useState<string[]>(initialProfile?.target_countries || []);

  // ── B. Optional quick stats ────────────────────────────────────────
  const [graduationYear, setGraduationYear] = useState<string>(
    initialProfile?.graduation_year ? String(initialProfile.graduation_year) : ''
  );
  const [cgpa, setCgpa] = useState<string>(initialProfile?.cgpa != null ? String(initialProfile.cgpa) : '');
  const [cgpaScale, setCgpaScale] = useState<string>(
    initialProfile?.cgpa_scale != null ? String(initialProfile.cgpa_scale) : '4.0'
  );
  const [workYears, setWorkYears] = useState<string>(
    initialProfile?.work_experience_years != null ? String(initialProfile.work_experience_years) : ''
  );
  const [hasIelts, setHasIelts] = useState<boolean>(initialProfile?.has_ielts || false);
  const [ieltsScore, setIeltsScore] = useState<string>(
    initialProfile?.ielts_score != null ? String(initialProfile.ielts_score) : ''
  );
  // English-language study waiver — toggled when the user attests their
  // prior degree was taught in English. Most universities accept a
  // Medium-of-Instruction letter as proof of English proficiency, so
  // the matching engine grants partial/full credit on this signal.
  const [priorEnglish, setPriorEnglish] = useState<boolean>(
    initialProfile?.prior_studies_in_english || false
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTarget = (c: string) => {
    setTargets(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);
  };

  // Only the 4 required fields gate the submit button.
  const canSubmit = country && degreeLevel && targetDegree && field && targets.length > 0;

  const onSubmit = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    // Build the payload — always send the 4 required; only send optional
    // fields when the user actually entered a value (so we don't clobber
    // existing data with empty strings).
    const payload: Partial<Profile> = {
      country_of_origin: country,
      degree_level: degreeLevel,
      target_degree: targetDegree,
      field_of_study: field,
      target_fields: [field],
      target_countries: targets,
    };

    if (graduationYear) payload.graduation_year = parseInt(graduationYear, 10);
    if (cgpa) {
      payload.cgpa = parseFloat(cgpa);
      if (cgpaScale) payload.cgpa_scale = parseFloat(cgpaScale);
    }
    if (workYears) payload.work_experience_years = parseInt(workYears, 10);
    payload.has_ielts = hasIelts;
    if (hasIelts && ieltsScore) payload.ielts_score = parseFloat(ieltsScore);
    payload.prior_studies_in_english = priorEnglish;

    const result = await onSave(payload);
    setSaving(false);
    if (!result) {
      setError("We couldn't save your details. Please try again.");
      return;
    }
    // Save succeeded — advance to the matches preview slide.
    onNext();
  };

  return (
    <div className="px-4 py-3 max-w-xl mx-auto">
      <div className="text-center mb-5">
        <h2 className="text-[22px] font-extrabold text-text-primary">
          Tell us about you
        </h2>
        <p className="text-[13px] text-text-secondary mt-1">
          The 4 quick picks below power your matches. Add quick stats to boost your score.
        </p>
      </div>

      <div className="space-y-4">
        {/* ══════ A. Required for matching ══════ */}
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-text-inverse text-[10px] font-bold">1</span>
          <h3 className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider">
            Required for matching
          </h3>
        </div>

        {/* Country of origin */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            Country of origin
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
          >
            <option value="">Select your country…</option>
            {COUNTRIES_OF_ORIGIN.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Current education level */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            Current education level
          </label>
          <div className="grid grid-cols-4 gap-2">
            {CURRENT_EDUCATION_OPTIONS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDegreeLevel(d.value)}
                className={`px-3 py-2.5 rounded-btn text-[13px] font-semibold transition-all ${
                  degreeLevel === d.value
                    ? 'bg-primary text-text-inverse shadow-md shadow-primary/20'
                    : 'bg-white border border-gray-200 text-text-primary hover:border-primary hover:bg-primary/5'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target degree */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            Target degree
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DEGREE_OPTIONS.map(d => (
              <button
                key={d.value}
                type="button"
                onClick={() => setTargetDegree(d.value)}
                className={`px-3 py-2.5 rounded-btn text-[13px] font-semibold transition-all ${
                  targetDegree === d.value
                    ? 'bg-primary text-text-inverse shadow-md shadow-primary/20'
                    : 'bg-white border border-gray-200 text-text-primary hover:border-primary hover:bg-primary/5'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Field of study */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            Field of study
          </label>
          <select
            value={field}
            onChange={(e) => setField(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
          >
            <option value="">Select a field…</option>
            {FIELDS_OF_STUDY.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Target countries (multi-select chips) */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            Where do you want to study? <span className="text-text-secondary/60 normal-case font-normal">({targets.length} selected)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 p-2.5 bg-gray-50 border border-gray-200 rounded-btn min-h-[80px]">
            {POPULAR_TARGET_COUNTRIES.map(c => {
              const on = targets.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleTarget(c)}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                    on
                      ? 'bg-primary text-text-inverse shadow-sm'
                      : 'bg-white border border-gray-200 text-text-primary hover:border-primary'
                  }`}
                >
                  {on && <span className="material-symbols-outlined text-[12px] mr-0.5 align-middle">check</span>}
                  {c}
                </button>
              );
            })}
            {/* Custom-selected countries (not in popular list) */}
            {targets.filter(c => !POPULAR_TARGET_COUNTRIES.includes(c)).map(c => (
              <button
                key={c}
                type="button"
                onClick={() => toggleTarget(c)}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all bg-primary text-text-inverse shadow-sm flex items-center gap-0.5"
              >
                {c}
                <span className="material-symbols-outlined text-[12px] opacity-70">close</span>
              </button>
            ))}
            {/* "Other…" chip */}
            <TargetCountryOther
              onSelect={c => toggleTarget(c)}
              excludeSet={new Set(targets)}
            />
          </div>
        </div>

        {/* ══════ B. Optional quick stats ══════ */}
        <div className="pt-4 mt-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-text-secondary text-[10px] font-bold">2</span>
            <h3 className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider">
              Quick stats <span className="text-text-secondary/70 normal-case font-medium">— optional, improves your match score</span>
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Graduation year */}
          <div>
            <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
              Graduation year
            </label>
            <select
              value={graduationYear}
              onChange={(e) => setGraduationYear(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            >
              <option value="">Select…</option>
              {GRAD_YEAR.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Work experience years */}
          <div>
            <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
              Work experience (years)
            </label>
            <input
              type="number"
              min="0"
              max="50"
              step="1"
              value={workYears}
              onChange={(e) => setWorkYears(e.target.value)}
              placeholder="e.g. 3"
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* CGPA */}
          <div>
            <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
              CGPA
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cgpa}
              onChange={(e) => setCgpa(e.target.value)}
              placeholder="e.g. 3.5"
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            />
          </div>

          {/* CGPA scale */}
          <div>
            <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
              Scale
            </label>
            <select
              value={cgpaScale}
              onChange={(e) => setCgpaScale(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            >
              {CGPA_SCALE_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* IELTS — toggle + conditional score */}
        <div>
          <label className="text-[12px] font-bold text-text-secondary uppercase tracking-wide block mb-1.5">
            English proficiency
          </label>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setHasIelts(!hasIelts)}
              className={`flex items-center gap-2 px-3 py-2 rounded-btn text-[13px] font-semibold transition-all ${
                hasIelts
                  ? 'bg-primary text-text-inverse shadow-sm'
                  : 'bg-white border border-gray-200 text-text-primary hover:border-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {hasIelts ? 'check_box' : 'check_box_outline_blank'}
              </span>
              I have an IELTS score
            </button>
          </div>
          {hasIelts && (
            <input
              type="number"
              min="0"
              max="9"
              step="0.5"
              value={ieltsScore}
              onChange={(e) => setIeltsScore(e.target.value)}
              placeholder="Overall band (e.g. 7.0)"
              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-btn text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
            />
          )}
        </div>

        {/* Prior degree in English — soft waiver for English-test reqs.
            Shown right under the IELTS toggle so it's discoverable when
            the user is thinking about language proficiency. */}
        <div>
          <button
            type="button"
            onClick={() => setPriorEnglish(!priorEnglish)}
            className={`flex items-center gap-2 px-3 py-2 rounded-btn text-[13px] font-semibold transition-all ${
              priorEnglish
                ? 'bg-primary text-text-inverse shadow-sm'
                : 'bg-white border border-gray-200 text-text-primary hover:border-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {priorEnglish ? 'check_box' : 'check_box_outline_blank'}
            </span>
            My prior degree was taught in English
          </button>
          {priorEnglish && (
            <p className="mt-1.5 text-[11px] text-text-secondary leading-relaxed">
              We'll treat this as a waiver for English-test requirements on
              scholarships that accept prior-English study.
            </p>
          )}
        </div>

        {error && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-btn px-3 py-2">
            {error}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={onSubmit}
          disabled={!canSubmit || saving}
          className="flex-1 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn shadow-md shadow-primary/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none inline-flex items-center justify-center gap-2"
        >
          {saving && <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Saving…' : 'Find my matches'}
          {!saving && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
        </button>
        <button
          onClick={onSkip}
          className="text-[12px] text-text-secondary hover:text-primary transition-colors"
        >
          Skip
        </button>
      </div>

      <p className="text-[11px] text-text-secondary text-center mt-3">
        You can edit these any time from your profile.
      </p>
    </div>
  );
}
