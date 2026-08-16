'use client';

import { useState } from 'react';
import type { Resume } from '@/services/api';

interface Props {
  resume: Partial<Resume>;
  onResumeChange: (updates: Partial<Resume>) => void;
  activeSection?: string | null;
  onSectionFocus?: (section: string) => void;
}

interface SectionDef {
  key: string;
  label: string;
  icon: string;
  count: (r: Partial<Resume>) => number;
  preview: (r: Partial<Resume>) => string;
}

const SECTIONS: SectionDef[] = [
  {
    key: 'personal',
    label: 'Personal Info',
    icon: 'person',
    count: (r) => [r.full_name, r.email, r.phone].filter(Boolean).length,
    preview: (r) => [r.full_name, r.email].filter(Boolean).join(' · ') || 'Not set',
  },
  {
    key: 'summary',
    label: 'Summary',
    icon: 'description',
    count: (r) => (r.summary ? 1 : 0),
    preview: (r) => r.summary ? r.summary.slice(0, 80) + (r.summary.length > 80 ? '…' : '') : 'Not set',
  },
  {
    key: 'education',
    label: 'Education',
    icon: 'school',
    count: (r) => r.education?.length || 0,
    preview: (r) => r.education?.length
      ? r.education.map(e => `${e.degree || ''} ${e.field || ''}`.trim()).join(', ')
      : 'No entries',
  },
  {
    key: 'experience',
    label: 'Work Experience',
    icon: 'work',
    count: (r) => r.experience?.length || 0,
    preview: (r) => r.experience?.length
      ? r.experience.map(e => e.position || e.title || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'research',
    label: 'Research & Projects',
    icon: 'science',
    count: (r) => r.research_projects?.length || 0,
    preview: (r) => r.research_projects?.length
      ? r.research_projects.map(p => p.title || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'skills',
    label: 'Skills',
    icon: 'psychology',
    count: (r) => r.skills?.length || 0,
    preview: (r) => r.skills?.length ? r.skills.slice(0, 5).join(', ') : 'No skills',
  },
  {
    key: 'certifications',
    label: 'Certifications',
    icon: 'verified',
    count: (r) => r.certifications?.length || 0,
    preview: (r) => r.certifications?.length
      ? r.certifications.map(c => c.name || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'publications',
    label: 'Publications',
    icon: 'article',
    count: (r) => r.publications?.length || 0,
    preview: (r) => r.publications?.length
      ? r.publications.map(p => p.title || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'awards',
    label: 'Awards',
    icon: 'emoji_events',
    count: (r) => r.awards?.length || 0,
    preview: (r) => r.awards?.length
      ? r.awards.map(a => a.name || a.title || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'languages',
    label: 'Languages',
    icon: 'translate',
    count: (r) => r.languages?.length || 0,
    preview: (r) => r.languages?.length
      ? r.languages.map(l => typeof l === 'string' ? l : l.language || '').filter(Boolean).join(', ')
      : 'No entries',
  },
  {
    key: 'references',
    label: 'References',
    icon: 'contacts',
    count: (r) => r.ref_list?.length || 0,
    preview: (r) => r.ref_list?.length
      ? r.ref_list.map(ref => ref.name || '').filter(Boolean).join(', ')
      : 'No entries',
  },
];

export default function CollapsibleEditor({ resume, onResumeChange, activeSection, onSectionFocus }: Props) {
  const [expanded, setExpanded] = useState<string | null>(activeSection || null);

  const toggle = (key: string) => {
    const next = expanded === key ? null : key;
    setExpanded(next);
    if (next) onSectionFocus?.(next);
  };

  return (
    <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
      {SECTIONS.map((sec) => {
        const isOpen = expanded === sec.key;
        const count = sec.count(resume);
        return (
          <div
            key={sec.key}
            className={`rounded-lg border transition-colors ${
              isOpen ? 'border-gray-300 bg-white' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            {/* Header row */}
            <button
              onClick={() => toggle(sec.key)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <span className="material-symbols-outlined text-[18px] text-gray-400">{sec.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-gray-800 uppercase tracking-wide">
                    {sec.label}
                  </span>
                  {count > 0 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary rounded-full">
                      {count}
                    </span>
                  )}
                </div>
                {!isOpen && (
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">{sec.preview(resume)}</p>
                )}
              </div>
              <span className={`material-symbols-outlined text-[18px] text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="px-3 pb-3 border-t border-gray-100">
                <SectionEditor
                  section={sec.key}
                  resume={resume}
                  onResumeChange={onResumeChange}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Inline section editors ────────────────────────────────────────────

function SectionEditor({
  section,
  resume,
  onResumeChange,
}: {
  section: string;
  resume: Partial<Resume>;
  onResumeChange: (updates: Partial<Resume>) => void;
}) {
  switch (section) {
    case 'personal':
      return <PersonalEditor resume={resume} onChange={onResumeChange} />;
    case 'summary':
      return <SummaryEditor resume={resume} onChange={onResumeChange} />;
    case 'skills':
      return <SkillsEditor resume={resume} onChange={onResumeChange} />;
    case 'education':
      return <ListEditor
        items={resume.education || []}
        fields={[
          { key: 'degree', label: 'Degree', placeholder: "e.g. Bachelor's" },
          { key: 'field', label: 'Field', placeholder: 'e.g. Computer Science' },
          { key: 'institution', label: 'Institution', placeholder: 'e.g. MIT' },
          { key: 'start_date', label: 'Start', placeholder: 'e.g. Sep 2020' },
          { key: 'end_date', label: 'End', placeholder: 'e.g. Jun 2024' },
          { key: 'gpa', label: 'GPA', placeholder: 'e.g. 3.8/4.0' },
        ]}
        displayItem={(item) => `${item.degree || ''} ${item.field || ''} — ${item.institution || ''}`}
        onChange={(items) => onResumeChange({ education: items })}
      />;
    case 'experience':
      return <ListEditor
        items={resume.experience || []}
        fields={[
          { key: 'position', label: 'Position', placeholder: 'e.g. Software Engineer' },
          { key: 'company', label: 'Company', placeholder: 'e.g. Google' },
          { key: 'location', label: 'Location', placeholder: 'e.g. Lagos, Nigeria' },
          { key: 'start_date', label: 'Start', placeholder: 'e.g. Jun 2023' },
          { key: 'end_date', label: 'End', placeholder: 'Present' },
          { key: 'description', label: 'Description', placeholder: 'What did you do?', type: 'textarea' },
        ]}
        displayItem={(item) => `${item.position || item.title || ''} at ${item.company || ''}`}
        onChange={(items) => onResumeChange({ experience: items })}
      />;
    case 'research':
      return <ListEditor
        items={resume.research_projects || []}
        fields={[
          { key: 'title', label: 'Title', placeholder: 'Project name' },
          { key: 'type', label: 'Type', placeholder: 'project or research' },
          { key: 'organization', label: 'Organization', placeholder: 'e.g. University lab' },
          { key: 'role', label: 'Role', placeholder: 'e.g. Lead Developer' },
          { key: 'description', label: 'Description', placeholder: 'What does it do?', type: 'textarea' },
        ]}
        displayItem={(item) => `[${item.type || 'project'}] ${item.title || ''}`}
        onChange={(items) => onResumeChange({ research_projects: items })}
      />;
    case 'certifications':
      return <ListEditor
        items={resume.certifications || []}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'e.g. AWS Solutions Architect' },
          { key: 'issuer', label: 'Issuer', placeholder: 'e.g. Amazon' },
          { key: 'date', label: 'Date', placeholder: 'e.g. Mar 2024' },
        ]}
        displayItem={(item) => `${item.name || ''} — ${item.issuer || ''}`}
        onChange={(items) => onResumeChange({ certifications: items })}
      />;
    case 'publications':
      return <ListEditor
        items={resume.publications || []}
        fields={[
          { key: 'title', label: 'Title', placeholder: 'Paper title' },
          { key: 'journal', label: 'Journal', placeholder: 'Journal name' },
          { key: 'date', label: 'Date', placeholder: 'e.g. 2024' },
          { key: 'doi', label: 'DOI', placeholder: '10.1234/abcd' },
        ]}
        displayItem={(item) => `${item.title || ''} (${item.journal || ''})`}
        onChange={(items) => onResumeChange({ publications: items })}
      />;
    case 'awards':
      return <ListEditor
        items={resume.awards || []}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'Award name' },
          { key: 'issuer', label: 'Issuer', placeholder: 'Who gave it' },
          { key: 'date', label: 'Date', placeholder: 'e.g. 2023' },
        ]}
        displayItem={(item) => `${item.name || item.title || ''} — ${item.issuer || ''}`}
        onChange={(items) => onResumeChange({ awards: items })}
      />;
    case 'languages':
      return <ListEditor
        items={resume.languages || []}
        fields={[
          { key: 'language', label: 'Language', placeholder: 'e.g. English' },
          { key: 'proficiency', label: 'Proficiency', placeholder: 'Native / Fluent / etc.' },
        ]}
        displayItem={(item) => typeof item === 'string' ? item : `${item.language || ''} — ${item.proficiency || ''}`}
        onChange={(items) => onResumeChange({ languages: items })}
      />;
    case 'references':
      return <ListEditor
        items={resume.ref_list || []}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'Reference name' },
          { key: 'position', label: 'Position', placeholder: 'Their title' },
          { key: 'contact', label: 'Contact', placeholder: 'Email or phone' },
        ]}
        displayItem={(item) => `${item.name || ''} — ${item.position || ''}`}
        onChange={(items) => onResumeChange({ ref_list: items })}
      />;
    default:
      return <p className="text-[12px] text-gray-400 py-2">Editor not available for this section.</p>;
  }
}

// ── Personal Info editor ──────────────────────────────────────────────

function PersonalEditor({ resume, onChange }: { resume: Partial<Resume>; onChange: (u: Partial<Resume>) => void }) {
  const fields = [
    { key: 'full_name', label: 'Full Name', placeholder: 'Your full name' },
    { key: 'email', label: 'Email', placeholder: 'you@example.com' },
    { key: 'phone', label: 'Phone', placeholder: '+1 234 567 890' },
    { key: 'location', label: 'Location', placeholder: 'City, Country' },
    { key: 'linkedin_url', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/...' },
    { key: 'portfolio_url', label: 'Portfolio', placeholder: 'https://...' },
  ];

  return (
    <div className="flex flex-col gap-2 pt-2">
      {fields.map((f) => (
        <div key={f.key}>
          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{f.label}</label>
          <input
            type="text"
            value={(resume as Record<string, string | undefined>)[f.key] ?? ''}
            onChange={(e) => onChange({ [f.key]: e.target.value })}
            placeholder={f.placeholder}
            className="w-full mt-1 px-2.5 py-1.5 text-[16px] bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
          />
        </div>
      ))}
    </div>
  );
}

// ── Summary editor ────────────────────────────────────────────────────

function SummaryEditor({ resume, onChange }: { resume: Partial<Resume>; onChange: (u: Partial<Resume>) => void }) {
  return (
    <div className="pt-2">
      <textarea
        value={resume.summary || ''}
        onChange={(e) => onChange({ summary: e.target.value })}
        placeholder="Write a brief professional summary..."
        rows={4}
        className="w-full px-2.5 py-2 text-[16px] bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-y transition-all"
      />
    </div>
  );
}

// ── Skills editor ─────────────────────────────────────────────────────

function SkillsEditor({ resume, onChange }: { resume: Partial<Resume>; onChange: (u: Partial<Resume>) => void }) {
  const skills = resume.skills || [];
  const [input, setInput] = useState('');

  const addSkill = () => {
    const trimmed = input.trim();
    if (trimmed && !skills.includes(trimmed)) {
      onChange({ skills: [...skills, trimmed] });
      setInput('');
    }
  };

  const removeSkill = (idx: number) => {
    onChange({ skills: skills.filter((_, i) => i !== idx) });
  };

  return (
    <div className="pt-2">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {skills.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-[12px] font-medium rounded-lg">
            {s}
            <button onClick={() => removeSkill(i)} className="hover:text-red-500 transition-colors">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
          placeholder="Type a skill and press Enter"
          className="flex-1 px-2.5 py-1.5 text-[16px] bg-gray-50 border border-gray-200 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
        />
        <button
          onClick={addSkill}
          className="px-3 py-1.5 text-[12px] font-semibold bg-primary text-white rounded-lg hover:brightness-110 transition-all"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ── Generic list editor (education, experience, etc.) ─────────────────

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'textarea';
}

function ListEditor({
  items,
  fields,
  displayItem,
  onChange,
}: {
  items: any[];
  fields: FieldDef[];
  displayItem: (item: any) => string;
  onChange: (items: any[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setDraft({ ...items[idx] });
  };

  const startNew = () => {
    setEditingIdx(items.length);
    setDraft({});
  };

  const save = () => {
    const next = [...items];
    if (editingIdx! < items.length) {
      next[editingIdx!] = draft;
    } else {
      next.push(draft);
    }
    onChange(next);
    setEditingIdx(null);
    setDraft({});
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      setEditingIdx(null);
      setDraft({});
    }
  };

  const cancel = () => {
    setEditingIdx(null);
    setDraft({});
  };

  return (
    <div className="flex flex-col gap-1.5 pt-2">
      {items.map((item, idx) => (
        <div key={idx}>
          {editingIdx === idx ? (
            <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex flex-col gap-1.5">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase">{f.label}</label>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={draft[f.key] || ''}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        rows={2}
                        className="w-full mt-0.5 px-2 py-1 text-[16px] bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-primary outline-none resize-y"
                      />
                    ) : (
                      <input
                        type="text"
                        value={draft[f.key] || ''}
                        onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                        placeholder={f.placeholder}
                        className="w-full mt-0.5 px-2 py-1 text-[16px] bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-primary outline-none"
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={save} className="px-3 py-1 text-[11px] font-semibold bg-primary text-white rounded-md hover:brightness-110">Save</button>
                <button onClick={cancel} className="px-3 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 rounded-lg border border-gray-100 group">
              <span className="flex-1 text-[12px] text-gray-700 truncate">{displayItem(item)}</span>
              <button
                onClick={() => startEdit(idx)}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 hover:bg-gray-200 rounded transition-all"
              >
                <span className="material-symbols-outlined text-[14px] text-gray-400">edit</span>
              </button>
              <button
                onClick={() => remove(idx)}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 hover:bg-red-50 rounded transition-all"
              >
                <span className="material-symbols-outlined text-[14px] text-red-400">delete</span>
              </button>
            </div>
          )}
        </div>
      ))}

      {editingIdx === items.length ? (
        <div className="p-2.5 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex flex-col gap-1.5">
            {fields.map((f) => (
              <div key={f.key}>
                <label className="text-[10px] font-semibold text-gray-500 uppercase">{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    rows={2}
                    className="w-full mt-0.5 px-2 py-1 text-[16px] bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-primary outline-none resize-y"
                  />
                ) : (
                  <input
                    type="text"
                    value={draft[f.key] || ''}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full mt-0.5 px-2 py-1 text-[16px] bg-white border border-gray-200 rounded-md focus:ring-1 focus:ring-primary outline-none"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={save} className="px-3 py-1 text-[11px] font-semibold bg-primary text-white rounded-md hover:brightness-110">Save</button>
            <button onClick={cancel} className="px-3 py-1 text-[11px] text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          onClick={startNew}
          className="flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-primary bg-primary/5 rounded-lg border border-dashed border-primary/30 hover:bg-primary/10 transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          Add
        </button>
      )}
    </div>
  );
}
