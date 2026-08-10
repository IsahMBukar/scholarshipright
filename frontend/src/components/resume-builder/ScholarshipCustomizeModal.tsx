'use client';

import { useState, useRef, useEffect } from 'react';
import {
  fetchResumes,
  updateResume,
  aiSuggest,
  aiSaveSection,
  exportResumePdf,
  type Resume,
} from '@/services/api';
import LivePreview from './LivePreview';
import { DEFAULT_STYLE, type ResumeStyle } from './StyleTab';

interface Props {
  scholarshipName?: string;
  onClose: () => void;
}

type Tab = 'ai-rewrite' | 'editor' | 'style';

const SECTION_LABELS: Record<string, string> = {
  header: 'Personal Info',
  summary: 'Summary',
  education: 'Education',
  experience: 'Work Experience',
  projects: 'Projects',
  research: 'Research',
  skills: 'Skills',
  certifications: 'Certifications',
  publications: 'Publications',
  awards: 'Awards',
  languages: 'Languages',
  references: 'References',
};

export default function ScholarshipCustomizeModal({ scholarshipName, onClose }: Props) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('ai-rewrite');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>(DEFAULT_STYLE);

  useEffect(() => {
    fetchResumes().then(resumes => {
      const primary = resumes.find(r => r.is_primary) || resumes[0];
      setResume(primary || null);
      if (primary?.style && typeof primary.style === 'object') {
        setResumeStyle({ ...DEFAULT_STYLE, ...primary.style } as ResumeStyle);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSectionClick = (section: string, label: string) => {
    setActiveSection(section);
    setActiveTab('ai-rewrite');
    // Auto-tag the section in the AI chat input
    const tag = `@${label}`;
    if (!aiPrompt.includes(tag)) {
      setAiPrompt(prev => prev ? `${prev} ${tag}` : `${tag}: `);
    }
  };

  const handleAiRewrite = async () => {
    if (!resume || !aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponse('');
    try {
      const section = activeSection || 'summary';
      const result = await aiSuggest(resume.id, section, aiPrompt);
      setAiResponse(result.suggestion);
      // Auto-scroll to response
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      setAiResponse('Failed to generate suggestion. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplySuggestion = async () => {
    if (!resume || !activeSection || !aiResponse) return;
    try {
      // For summary, save directly
      if (activeSection === 'summary') {
        const updated = await aiSaveSection(resume.id, 'summary', undefined, aiResponse);
        setResume(updated);
      }
      // For other sections, user needs to edit manually for now
      setAiResponse('');
      setAiPrompt('');
    } catch (err) {
      console.error('Apply failed:', err);
    }
  };

  const handleExport = async () => {
    if (!resume) return;
    setExporting(true);
    try {
      await exportResumePdf(resume.id, 'resume');
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleStyleChange = async (updates: Partial<ResumeStyle>) => {
    if (!resume) return;
    const newStyle = { ...resumeStyle, ...updates };
    setResumeStyle(newStyle);
    try {
      const updated = await updateResume(resume.id, { style: newStyle } as any);
      setResume(updated);
    } catch (err) {
      console.error('Failed to save style:', err);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
          <span className="material-symbols-outlined text-[24px] text-primary animate-spin">refresh</span>
          <span className="text-[14px] text-text-secondary">Loading your resume...</span>
        </div>
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
        <div className="bg-white rounded-2xl p-8 text-center max-w-sm" onClick={e => e.stopPropagation()}>
          <span className="material-symbols-outlined text-[48px] text-gray-300 block mb-3">description</span>
          <h3 className="text-[18px] font-bold text-text-primary mb-2">No Resume Found</h3>
          <p className="text-[13px] text-text-secondary mb-4">
            Build a resume first before customizing it for a scholarship.
          </p>
          <button onClick={onClose} className="px-6 py-2.5 bg-primary text-white text-[14px] font-semibold rounded-btn">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col lg:flex-row bg-white animate-fade-in">
      {/* Left: Preview with section selection */}
      <div className="flex-1 min-h-0 border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div>
              <h2 className="text-[15px] font-bold text-text-primary">Customize Resume</h2>
              {scholarshipName && (
                <p className="text-[11px] text-text-secondary">For: {scholarshipName}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="px-4 py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            {exporting ? 'Exporting...' : 'Download'}
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 min-h-0">
          <LivePreview
            resume={resume}
            interactive
            onSectionClick={handleSectionClick}
            activeSection={activeSection}
          />
        </div>
      </div>

      {/* Right: AI Rewrite / Editor / Style tabs */}
      <div className="w-full lg:w-[420px] flex-1 lg:flex-none flex flex-col bg-gray-50 min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white">
          {([
            { key: 'ai-rewrite' as Tab, label: 'AI Rewrite', icon: 'auto_awesome' },
            { key: 'editor' as Tab, label: 'Editor', icon: 'edit' },
            { key: 'style' as Tab, label: 'Style', icon: 'palette' },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* AI Rewrite Tab */}
          {activeTab === 'ai-rewrite' && (
            <>
              {/* Selected section indicator */}
              {activeSection && (
                <div className="px-4 py-2 bg-primary/5 border-b border-primary/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">target</span>
                    <span className="text-[12px] font-semibold text-primary">
                      Editing: {SECTION_LABELS[activeSection] || activeSection}
                    </span>
                    <button
                      onClick={() => setActiveSection(null)}
                      className="ml-auto text-[11px] text-text-secondary hover:text-primary"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {/* AI response area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!activeSection && !aiResponse && (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-[48px] text-gray-200 block mb-3">auto_awesome</span>
                    <p className="text-[14px] text-text-secondary mb-1">Click a section on the preview</p>
                    <p className="text-[12px] text-gray-400">
                      Select a section to edit it with AI, or type a prompt below
                    </p>
                  </div>
                )}

                {aiResponse && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-[16px] text-primary">auto_awesome</span>
                      <span className="text-[12px] font-semibold text-primary">AI Suggestion</span>
                    </div>
                    <p className="text-[13px] text-text-primary leading-relaxed whitespace-pre-line">{aiResponse}</p>
                    <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                      <button
                        onClick={handleApplySuggestion}
                        className="px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-btn hover:brightness-110 transition-all"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => setAiResponse('')}
                        className="px-3 py-1.5 border border-gray-200 text-text-secondary text-[12px] font-medium rounded-btn hover:border-primary transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {aiLoading && (
                  <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-xl">
                    <span className="material-symbols-outlined text-[16px] text-primary animate-spin">refresh</span>
                    <span className="text-[13px] text-text-secondary">AI is writing...</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="p-4 border-t border-gray-200 bg-white">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAiRewrite()}
                    placeholder={activeSection ? `Tell AI how to improve ${SECTION_LABELS[activeSection] || activeSection}...` : 'Select a section or type a prompt...'}
                    className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[13px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                  />
                  <button
                    onClick={handleAiRewrite}
                    disabled={!aiPrompt.trim() || aiLoading}
                    className="px-4 py-3 bg-primary text-white text-[13px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">send</span>
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Click a section on the preview to auto-tag it, or type freely
                </p>
              </div>
            </>
          )}

          {/* Editor Tab */}
          {activeTab === 'editor' && (
            <div className="flex-1 overflow-y-auto p-4">
              {activeSection ? (
                <div className="text-center py-8">
                  <span className="material-symbols-outlined text-[40px] text-primary/30 block mb-3">auto_awesome</span>
                  <h3 className="text-[15px] font-bold text-text-primary mb-2">
                    Edit: {SECTION_LABELS[activeSection] || activeSection}
                  </h3>
                  <p className="text-[13px] text-text-secondary mb-4">
                    Use AI Rewrite to improve this section — it understands scholarship applications.
                  </p>
                  <button
                    onClick={() => setActiveTab('ai-rewrite')}
                    className="px-4 py-2.5 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all"
                  >
                    Switch to AI Rewrite
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <span className="material-symbols-outlined text-[48px] text-gray-200 block mb-3">edit</span>
                  <p className="text-[14px] text-text-secondary">
                    Click a section on the preview to edit it
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Style Tab */}
          {activeTab === 'style' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <label className="text-[13px] font-semibold text-text-primary block mb-2">Template</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'classic', label: 'Classic' },
                    { id: 'modern', label: 'Modern' },
                    { id: 'academic', label: 'Academic' },
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleStyleChange({ theme: t.id })}
                      className={`p-3 rounded-xl border-2 transition-colors cursor-pointer text-center ${
                        resumeStyle.theme === t.id
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-primary/40'
                      }`}
                    >
                      <p className="text-[12px] font-semibold text-text-primary">{t.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[13px] font-semibold text-text-primary block mb-2">Accent Color</label>
                <div className="flex gap-2">
                  {['#f5b942', '#1a1a1a', '#2563eb', '#059669', '#dc2626'].map(c => (
                    <button
                      key={c}
                      onClick={() => handleStyleChange({ primaryColor: c })}
                      className={`w-8 h-8 rounded-full border-2 cursor-pointer hover:scale-110 transition-transform ${
                        resumeStyle.primaryColor === c ? 'border-primary ring-2 ring-primary/30' : 'border-gray-200'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
