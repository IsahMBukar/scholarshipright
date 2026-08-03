'use client';

import { useState } from 'react';
import {
  updateResume,
  polishResume,
  aiGenerateSummary,
  type Resume,
  type PolishLevel,
} from '@/services/api';
import { POPULAR_FIELDS, FIELDS_OF_STUDY_VALUES } from '@/data/fieldsOfStudy';

interface Props {
  resume: Resume;
  onResumeUpdate: (resume: Resume) => void;
  /** Called after the polish step — parent opens the builder wizard. */
  onFinish: (resume: Resume) => void;
  onClose: () => void;
}

type StepKey =
  | 'meta' | 'personal' | 'education' | 'skills'
  | 'experience' | 'projects' | 'publications' | 'awards' | 'certifications' | 'languages' | 'references'
  | 'summary' | 'polish';

interface StepDef {
  key: StepKey;
  label: string;
  icon: string;
  hint: string;
  optional?: boolean;
}

const STEPS: StepDef[] = [
  { key: 'meta', label: 'Resume Details', icon: 'tune', hint: 'Name this resume and set its target.' },
  { key: 'personal', label: 'Personal Info', icon: 'person', hint: 'How reviewers can reach you.' },
  { key: 'education', label: 'Education', icon: 'school', hint: 'Your academic background.' },
  { key: 'skills', label: 'Skills', icon: 'psychology', hint: 'Technical and soft skills.' },
  { key: 'experience', label: 'Work Experience', icon: 'work', hint: 'Internships, jobs, volunteering.', optional: true },
  { key: 'projects', label: 'Research & Projects', icon: 'science', hint: 'Projects, research, hackathons.', optional: true },
  { key: 'publications', label: 'Publications', icon: 'article', hint: 'Papers, articles, presentations.', optional: true },
  { key: 'awards', label: 'Awards', icon: 'emoji_events', hint: 'Prizes, honours, scholarships.', optional: true },
  { key: 'certifications', label: 'Certifications', icon: 'verified', hint: 'Courses and certificates.', optional: true },
  { key: 'languages', label: 'Languages', icon: 'translate', hint: 'Languages you speak.', optional: true },
  { key: 'references', label: 'References', icon: 'contacts', hint: 'People who can vouch for you.', optional: true },
  { key: 'summary', label: 'Professional Summary', icon: 'description', hint: 'A short intro about you.' },
  { key: 'polish', label: 'Polish & Finish', icon: 'auto_awesome', hint: 'Choose how much AI help you want.' },
];

// Entry-form field schemas for list sections.
interface FieldDef { key: string; label: string; type: 'text' | 'textarea' | 'date'; placeholder?: string }

const SECTION_FIELDS: Record<string, FieldDef[]> = {
  education: [
    { key: 'institution', label: 'Institution', type: 'text', placeholder: 'e.g. University of Lagos' },
    { key: 'degree', label: 'Degree', type: 'text', placeholder: 'e.g. Bachelor of Science' },
    { key: 'field', label: 'Field of study', type: 'text', placeholder: 'e.g. Computer Science' },
    { key: 'start_date', label: 'Start date', type: 'date', placeholder: 'e.g. Sep 2020' },
    { key: 'end_date', label: 'End date', type: 'date', placeholder: 'e.g. Jun 2024' },
    { key: 'gpa', label: 'GPA / grade', type: 'text', placeholder: 'e.g. 3.8/4.0' },
    { key: 'description', label: 'Highlights', type: 'textarea', placeholder: 'Thesis, honours, coursework…' },
  ],
  experience: [
    { key: 'company', label: 'Company / organization', type: 'text' },
    { key: 'position', label: 'Role', type: 'text', placeholder: 'e.g. Software Engineer Intern' },
    { key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Lagos, Nigeria' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'end_date', label: 'End date', type: 'date', placeholder: 'e.g. Present' },
    { key: 'description', label: 'What you did', type: 'textarea' },
  ],
  projects: [
    { key: 'title', label: 'Project / research title', type: 'text' },
    { key: 'organization', label: 'For whom', type: 'text', placeholder: 'University, company, personal' },
    { key: 'role', label: 'Your role', type: 'text' },
    { key: 'technologies', label: 'Tools / technologies', type: 'text', placeholder: 'e.g. Python, React' },
    { key: 'start_date', label: 'Start date', type: 'date' },
    { key: 'end_date', label: 'End date', type: 'date', placeholder: 'e.g. Ongoing' },
    { key: 'description', label: 'What it does', type: 'textarea' },
  ],
  publications: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'journal', label: 'Journal / venue', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'doi', label: 'DOI / link', type: 'text' },
  ],
  awards: [
    { key: 'name', label: 'Award / honour', type: 'text' },
    { key: 'issuer', label: 'Issued by', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
  ],
  certifications: [
    { key: 'name', label: 'Certification', type: 'text' },
    { key: 'issuer', label: 'Issuer', type: 'text' },
    { key: 'date', label: 'Date', type: 'date' },
  ],
  languages: [
    { key: 'language', label: 'Language', type: 'text', placeholder: 'e.g. English' },
    { key: 'proficiency', label: 'Proficiency', type: 'text', placeholder: 'Native, Fluent, Advanced…' },
  ],
  references: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'position', label: 'Position', type: 'text' },
    { key: 'contact', label: 'Email / phone', type: 'text' },
  ],
};

const LIST_FIELD_MAP: Record<string, keyof Resume> = {
  education: 'education',
  experience: 'experience',
  projects: 'research_projects',
  publications: 'publications',
  awards: 'awards',
  certifications: 'certifications',
  languages: 'languages',
  references: 'ref_list',
};

const LIST_KEYS = new Set(Object.keys(LIST_FIELD_MAP));

export default function ResumeFormWizard({ resume, onResumeUpdate, onFinish, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<Partial<Resume>>(() => ({
    title: resume.title,
    target_fields: resume.target_fields || [],
    target_degree: resume.target_degree,
    full_name: resume.full_name,
    email: resume.email,
    phone: resume.phone,
    location: resume.location,
    linkedin_url: resume.linkedin_url,
    portfolio_url: resume.portfolio_url,
    summary: resume.summary,
    education: resume.education || [],
    experience: resume.experience || [],
    research_projects: resume.research_projects || [],
    skills: resume.skills || [],
    certifications: resume.certifications || [],
    publications: resume.publications || [],
    awards: resume.awards || [],
    languages: resume.languages || [],
    ref_list: resume.ref_list || [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polishLevel, setPolishLevel] = useState<PolishLevel>('simple');
  const [addingSkill, setAddingSkill] = useState(false);
  const [skillDraft, setSkillDraft] = useState('');

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  const setField = (key: keyof Resume, value: any) => setData((d) => ({ ...d, [key]: value }));

  async function persist(partial?: Partial<Resume>) {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateResume(resume.id, partial || data);
      onResumeUpdate(updated);
      setData((d) => ({ ...d, ...updated }));
      return updated;
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Failed to save. Please try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleContinue() {
    if (isLast) {
      setSaving(true);
      setError(null);
      try {
        const updated = await polishResume(resume.id, polishLevel);
        onResumeUpdate(updated);
        onFinish(updated);
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Polishing failed. Please try again.');
      } finally {
        setSaving(false);
      }
      return;
    }

    const current = STEPS[stepIndex];
    let ok = false;
    if (current.key === 'meta') {
      ok = !!(await persist({
        title: data.title,
        target_degree: data.target_degree,
        target_fields: data.target_fields,
      }));
    } else if (current.key === 'summary') {
      ok = !!(await persist({ summary: data.summary }));
    } else if (current.key === 'skills') {
      ok = !!(await persist({ skills: data.skills }));
    } else if (current.key === 'personal') {
      ok = !!(await persist({
        full_name: data.full_name, email: data.email, phone: data.phone,
        location: data.location, linkedin_url: data.linkedin_url, portfolio_url: data.portfolio_url,
      }));
    } else if (LIST_KEYS.has(current.key)) {
      const field = LIST_FIELD_MAP[current.key];
      ok = !!(await persist({ [field]: data[field] }));
    } else {
      ok = !!(await persist());
    }
    if (!ok) return;
    setStepIndex((i) => i + 1);
  }

  const goPrev = () => setStepIndex((i) => Math.max(0, i - 1));
  const skipToNext = () => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1));

  const addListEntry = (field: keyof Resume, entry: any) => {
    const list = Array.isArray(data[field]) ? (data[field] as any[]) : [];
    setField(field, [...list, entry]);
  };

  const removeListEntry = (field: keyof Resume, index: number) => {
    const list = Array.isArray(data[field]) ? (data[field] as any[]) : [];
    setField(field, list.filter((_, i) => i !== index));
  };

  const addSkill = () => {
    const s = skillDraft.trim();
    if (!s) return;
    const list = Array.isArray(data.skills) ? [...data.skills] : [];
    if (!list.includes(s)) list.push(s);
    setField('skills', list);
    setSkillDraft('');
    setAddingSkill(false);
  };

  const removeSkill = (s: string) => {
    const list = Array.isArray(data.skills) ? data.skills.filter((x) => x !== s) : [];
    setField('skills', list);
  };


  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-6 animate-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/20 animate-sheet-up sm:animate-modal-in flex flex-col"
        style={{ maxHeight: '92dvh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[22px]">{step.icon}</span>
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-text-primary">{step.label}</h3>
              <p className="text-[12px] text-text-secondary">{step.hint}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[20px] text-text-secondary">close</span>
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-gray-100">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {step.key === 'meta' && <MetaStep data={data} setField={setField} />}
          {step.key === 'personal' && <PersonalStep data={data} setField={setField} />}
          {step.key === 'skills' && (
            <SkillsStep
              skills={Array.isArray(data.skills) ? data.skills : []}
              adding={addingSkill} setAdding={setAddingSkill}
              draft={skillDraft} setDraft={setSkillDraft}
              onAdd={addSkill} onRemove={removeSkill}
            />
          )}
          {step.key === 'summary' && <SummaryStep data={data} setField={setField} resumeId={resume.id} />}
          {step.key === 'polish' && (
            <PolishStep level={polishLevel} setLevel={setPolishLevel} onGenerateSummary={async () => {
              const r = await aiGenerateSummary(resume.id);
              setField('summary', r.summary);
              await persist({ summary: r.summary });
            }} />
          )}
          {LIST_KEYS.has(step.key) && (
            <ListEditorStep
              field={LIST_FIELD_MAP[step.key]}
              fields={SECTION_FIELDS[step.key]}
              entries={Array.isArray(data[LIST_FIELD_MAP[step.key]]) ? (data[LIST_FIELD_MAP[step.key]] as any[]) : []}
              onAdd={(entry) => addListEntry(LIST_FIELD_MAP[step.key], entry)}
              onRemove={(i) => removeListEntry(LIST_FIELD_MAP[step.key], i)}
            />
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 rounded-xl border border-red-200 text-[13px] text-red-700">{error}</div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100">
          <button onClick={isFirst ? onClose : goPrev} className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">{isFirst ? 'close' : 'arrow_back'}</span>
            {isFirst ? 'Cancel' : 'Back'}
          </button>
          <div className="flex items-center gap-2">
            {step.optional && !isLast && (
              <button onClick={skipToNext} className="px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:text-primary transition-colors">
                Skip
              </button>
            )}
            <button
              onClick={handleContinue}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white text-[13px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
            >
              {saving && <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span>}
              {isLast ? 'Finish & Review' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── Form input primitive (shared by the clean typed steps) ── */
function Field({
  label, value, onChange, placeholder, type = 'text', textarea = false,
}: {
  label: string; value: any; onChange: (v: string) => void;
  placeholder?: string; type?: string; textarea?: boolean;
}) {
  const cls = "w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all";
  return (
    <div>
      <label className="text-[13px] font-semibold text-text-primary block mb-1.5">{label}</label>
      {textarea ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${cls} resize-y`} />
      ) : (
        <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

function MetaStep({ data, setField }: { data: Partial<Resume>; setField: (k: keyof Resume, v: any) => void }) {
  const DEGREE_OPTIONS = [
    { value: 'bachelor', label: "Bachelor's" },
    { value: 'master', label: "Master's" },
    { value: 'phd', label: 'PhD' },
    { value: 'diploma', label: 'Diploma' },
    { value: 'certificate', label: 'Certificate' },
  ];
  const [showAllFields, setShowAllFields] = useState(false);
  const [fieldQuery, setFieldQuery] = useState('');
  const targetDegree = (data.target_degree as string) || '';
  const targetFields = Array.isArray(data.target_fields) ? data.target_fields : [];

  const toggleField = (f: string) => {
    setField('target_fields', targetFields.includes(f) ? targetFields.filter((x) => x !== f) : [...targetFields, f]);
  };

  const filteredAll = showAllFields
    ? FIELDS_OF_STUDY_VALUES.filter((f) => f.toLowerCase().includes(fieldQuery.toLowerCase())).slice(0, 200)
    : [];

  return (
    <div className="space-y-5">
      {/* Resume title */}
      <div>
        <label className="text-[13px] font-semibold text-text-primary block mb-1.5">Resume Title</label>
        <input
          type="text"
          value={(data.title as string) || ''}
          onChange={(e) => setField('title', e.target.value)}
          placeholder="e.g. CS Master's Resume, PhD Research CV…"
          className="w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
        />
        <p className="text-[11px] text-text-secondary mt-1">Helps you tell your resumes apart in the list.</p>
      </div>

      {/* Target degree */}
      <div>
        <label className="text-[13px] font-semibold text-text-primary block mb-1.5">Target Degree / Program</label>
        <div className="flex flex-wrap gap-2">
          {DEGREE_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setField('target_degree', targetDegree === d.value ? '' : d.value)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                targetDegree === d.value ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target fields of study */}
      <div>
        <label className="text-[13px] font-semibold text-text-primary block mb-1.5">Target Fields of Study</label>
        <p className="text-[11px] text-text-secondary mb-2">What scholarships is this resume for? Pick all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {POPULAR_FIELDS.map((f) => (
            <button
              key={f}
              onClick={() => toggleField(f)}
              className={`px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors ${
                targetFields.includes(f) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
              }`}
            >
              {f.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Custom / other field search */}
        <div className="mt-3">
          <button
            onClick={() => setShowAllFields((s) => !s)}
            className="text-[12px] font-semibold text-primary hover:underline"
          >
            {showAllFields ? 'Hide full list' : 'Don’t see your field? Search all →'}
          </button>
          {showAllFields && (
            <div className="mt-2">
              <input
                type="text"
                value={fieldQuery}
                onChange={(e) => setFieldQuery(e.target.value)}
                placeholder="Search 2,500+ fields…"
                className="w-full p-2.5 bg-white border border-gray-200 rounded-lg text-[13px] focus:ring-1 focus:ring-primary outline-none"
              />
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-100 rounded-lg">
                {filteredAll.map((f) => (
                  <button
                    key={f}
                    onClick={() => toggleField(f)}
                    className={`w-full text-left px-3 py-2 text-[12px] hover:bg-gray-50 transition-colors ${targetFields.includes(f) ? 'text-primary font-semibold' : 'text-text-primary'}`}
                  >
                    {f}
                  </button>
                ))}
                {filteredAll.length === 0 && <p className="px-3 py-3 text-[12px] text-text-secondary">No matches.</p>}
              </div>
            </div>
          )}
        </div>

        {/* Selected custom fields chips */}
        {targetFields.filter((f) => !POPULAR_FIELDS.includes(f)).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {targetFields.filter((f) => !POPULAR_FIELDS.includes(f)).map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-[12px] font-medium rounded-lg">
                {f.replace(/_/g, ' ')}
                <button onClick={() => toggleField(f)} className="hover:text-red-500"><span className="material-symbols-outlined text-[14px]">close</span></button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PersonalStep({ data, setField }: { data: Partial<Resume>; setField: (k: keyof Resume, v: any) => void }) {
  const fields: { key: keyof Resume; label: string; placeholder?: string }[] = [
    { key: 'full_name', label: 'Full name', placeholder: 'e.g. Aisha Bello' },
    { key: 'email', label: 'Email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '+234 800 000 0000' },
    { key: 'location', label: 'Location', placeholder: 'City, Country' },
    { key: 'linkedin_url', label: 'LinkedIn URL (optional)' },
    { key: 'portfolio_url', label: 'Portfolio / website (optional)' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {fields.map((f) => (
        <div key={f.key} className={f.key === 'full_name' ? 'sm:col-span-2' : ''}>
          <Field label={f.label} value={data[f.key]} onChange={(v) => setField(f.key, v)} placeholder={f.placeholder} />
        </div>
      ))}
    </div>
  );
}

function SkillsStep({ skills, adding, setAdding, draft, setDraft, onAdd, onRemove }: {
  skills: string[]; adding: boolean; setAdding: (b: boolean) => void;
  draft: string; setDraft: (s: string) => void; onAdd: () => void; onRemove: (s: string) => void;
}) {
  return (
    <div>
      <p className="text-[12px] text-text-secondary mb-3">List your technical and soft skills — programming languages, tools, everything. One per line or comma-separated.</p>
      {skills.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary text-[13px] font-medium rounded-lg">
              {s}
              <button onClick={() => onRemove(s)} className="hover:text-red-500"><span className="material-symbols-outlined text-[14px]">close</span></button>
            </span>
          ))}
        </div>
      )}
      {adding ? (
        <div className="flex gap-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-[14px] focus:ring-2 focus:ring-primary outline-none resize-y" placeholder="e.g. Python, Data Analysis, Public Speaking" />
          <div className="flex flex-col gap-1.5">
            <button onClick={onAdd} className="px-4 py-2 bg-primary text-white text-[13px] font-bold rounded-xl hover:brightness-110">Add</button>
            <button onClick={() => { setAdding(false); setDraft(''); }} className="px-4 py-2 border border-gray-200 text-[13px] rounded-xl hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold text-primary bg-primary/5 border border-dashed border-primary/30 rounded-xl hover:bg-primary/10">
          <span className="material-symbols-outlined text-[16px]">add</span> Add skills
        </button>
      )}
    </div>
  );
}

function SummaryStep({ data, setField, resumeId }: { data: Partial<Resume>; setField: (k: keyof Resume, v: any) => void; resumeId: string }) {
  const [gen, setGen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <p className="text-[12px] text-text-secondary mb-3">A 2–3 sentence intro that highlights who you are and what you bring. You can auto-generate one from your details.</p>
      <textarea value={data.summary || ''} onChange={(e) => setField('summary', e.target.value)} rows={5} className="w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] focus:ring-2 focus:ring-primary outline-none resize-y" placeholder="Write or generate a professional summary…" />
      {err && <p className="text-[12px] text-red-600 mt-2">{err}</p>}
      <button
        onClick={async () => { setGen(true); setErr(null); try { const r = await aiGenerateSummary(resumeId); setField('summary', r.summary); } catch { setErr('Could not generate a summary. You can keep your own text.'); } finally { setGen(false); } }}
        disabled={gen}
        className="mt-3 flex items-center gap-2 px-4 py-2.5 border-2 border-primary text-primary text-[13px] font-bold rounded-xl hover:bg-primary/5 disabled:opacity-50"
      >
        {gen ? <span className="material-symbols-outlined text-[18px] animate-spin">refresh</span> : <span className="material-symbols-outlined text-[18px]">auto_awesome</span>}
        {gen ? 'Generating…' : 'Generate with AI'}
      </button>
    </div>
  );
}


function PolishStep({ level, setLevel }: { level: PolishLevel; setLevel: (l: PolishLevel) => void; onGenerateSummary: () => void }) {
  const OPTIONS: { id: PolishLevel; icon: string; title: string; desc: string }[] = [
    { id: 'simple', icon: 'edit', title: 'Simple', desc: 'Keep exactly what you typed. We only clean up minor formatting.' },
    { id: 'medium', icon: 'auto_fix_high', title: 'Medium', desc: 'AI rewrites key fields — your summary and the descriptions in education, work, projects & research.' },
    { id: 'high', icon: 'auto_awesome', title: 'High', desc: 'A full professional rewrite of everything into a polished, scholarship-ready tone.' },
  ];
  return (
    <div>
      <p className="text-[13px] text-text-secondary mb-4">Almost done! Choose how much AI finishing you want before we open the full editor.</p>
      <div className="flex flex-col gap-3">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => setLevel(o.id)}
            className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
              level === o.id ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-[22px]">{o.icon}</span>
            </div>
            <div className="flex-1">
              <p className="text-[14px] font-bold text-text-primary">{o.title}</p>
              <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">{o.desc}</p>
            </div>
            {level === o.id && <span className="material-symbols-outlined text-primary text-[22px]">check_circle</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListEditorStep({ field, fields, entries, onAdd, onRemove }: {
  field: keyof Resume; fields: { key: string; label: string; type: string; placeholder?: string }[];
  entries: any[]; onAdd: (entry: any) => void; onRemove: (i: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Record<string, any>>({});

  const setD = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const reset = () => { setDraft({}); setAdding(false); };

  return (
    <div>
      {entries.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 rounded-xl border border-gray-100">
              <span className="material-symbols-outlined text-[18px] text-gray-400">drag_indicator</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-text-primary truncate">{titleOf(e)}</p>
                <p className="text-[11px] text-text-secondary truncate">{subtitleOf(e)}</p>
              </div>
              <button onClick={() => onRemove(i)} className="p-1.5 hover:bg-red-50 rounded-lg"><span className="material-symbols-outlined text-[17px] text-red-400">delete</span></button>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-200 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <Field label={f.label} value={draft[f.key]} onChange={(v) => setD(f.key, v)} placeholder={f.placeholder} textarea={f.type === 'textarea'} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={() => { onAdd(draft); reset(); }} className="px-5 py-2.5 bg-primary text-white text-[13px] font-bold rounded-xl hover:brightness-110">Add entry</button>
            <button onClick={reset} className="px-4 py-2.5 border border-gray-200 text-[13px] rounded-xl hover:bg-gray-100">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold text-primary bg-primary/5 border border-dashed border-primary/30 rounded-xl hover:bg-primary/10">
          <span className="material-symbols-outlined text-[16px]">add</span> Add {labelOf(field)}
        </button>
      )}
    </div>
  );
}

function titleOf(e: any): string {
  return e?.title || e?.name || e?.position || e?.institution || e?.company || e?.language || e?.full_name || 'Entry';
}
function subtitleOf(e: any): string {
  return [e?.institution, e?.company, e?.organization, e?.issuer, e?.journal, e?.field, e?.proficiency].filter(Boolean).join(' · ');
}
function labelOf(field: string): string {
  const map: Record<string, string> = {
    education: 'education', experience: 'work experience', research_projects: 'project/research',
    publications: 'publication', awards: 'award', certifications: 'certification', languages: 'language', ref_list: 'reference',
  };
  return map[field] || field;
}

