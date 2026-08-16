'use client';

import { useState, useEffect, useRef } from 'react';
import {
  updateResume,
  deleteResume,
  exportResumePdf,
  type Resume,
} from '@/services/api';
import LivePreview from './LivePreview';
import CollapsibleEditor from './CollapsibleEditor';
import AIRewriteChat from './AIRewriteChat';
import StyleTab, { DEFAULT_STYLE, type ResumeStyle } from './StyleTab';

type Tab = 'ai-rewrite' | 'editor' | 'style';

interface Props {
  resume: Resume;
  onResumeUpdate: (resume: Resume) => void;
  onClose: () => void;
  onDelete?: () => void;
}

export default function ResumeBuilderWizard({ resume, onResumeUpdate, onClose, onDelete }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('editor');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isError = resume.status === 'error';
  const [resumeStyle, setResumeStyle] = useState<ResumeStyle>(() => {
    // Load persisted style from resume, fallback to defaults
    if (resume.style && typeof resume.style === 'object') {
      return { ...DEFAULT_STYLE, ...resume.style } as ResumeStyle;
    }
    return DEFAULT_STYLE;
  });
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const styleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save style changes to backend (debounced)
  const handleStyleChange = async (newStyle: ResumeStyle) => {
    setResumeStyle(newStyle);
    if (styleTimerRef.current) clearTimeout(styleTimerRef.current);
    styleTimerRef.current = setTimeout(async () => {
      try {
        const updated = await updateResume(resume.id, { style: newStyle as unknown as Record<string, unknown> });
        onResumeUpdate(updated);
      } catch (err) {
        console.error('Failed to save style:', err);
      }
    }, 500);
  };

  // Persist edits from the CollapsibleEditor to the backend
  const handleEditorChange = async (updates: Partial<Resume>) => {
    setSaving(true);
    try {
      const updated = await updateResume(resume.id, updates);
      onResumeUpdate(updated);
    } catch (err) {
      console.error('Failed to save resume:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewSectionClick = (section: string, _label: string) => {
    setActiveSection(section);
  };

  const handleExport = async (mode: 'resume' | 'cv') => {
    setExporting(true);
    try {
      await exportResumePdf(resume.id, mode);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteResume(resume.id);
      onDelete?.();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setDeleting(false);
    }
  };

  const completedSections = [
    resume.education?.length && 'education',
    resume.experience?.length && 'experience',
    resume.research_projects?.length && 'research',
    resume.skills?.length && 'skills',
    resume.certifications?.length && 'certifications',
    resume.publications?.length && 'publications',
    resume.awards?.length && 'awards',
    resume.languages?.length && 'languages',
    resume.ref_list?.length && 'references',
  ].filter(Boolean).length;

  const totalSections = 9;
  const progress = Math.round((completedSections / totalSections) * 100);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px] text-gray-500">close</span>
          </button>
          <div>
            <h2 className="text-[15px] font-bold text-gray-900">Smart Resume Builder</h2>
            <p className="text-[11px] text-gray-400">
              {completedSections} of {totalSections} sections · {progress}% complete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Progress bar */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {saving && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] animate-spin">refresh</span>
              Saving...
            </span>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 px-4 border-b border-gray-200 flex-shrink-0">
        {([
          { key: 'ai-rewrite' as Tab, label: 'AI Rewrite', icon: 'auto_awesome' },
          { key: 'editor' as Tab, label: 'Editor', icon: 'edit' },
          { key: 'style' as Tab, label: 'Style', icon: 'palette' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => !isError && setActiveTab(tab.key)}
            disabled={isError}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium transition-colors border-b-2 ${
              isError
                ? 'border-transparent text-gray-300 cursor-not-allowed'
                : activeTab === tab.key
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
            {tab.label}
            {isError && <span className="material-symbols-outlined text-[12px] ml-0.5">lock</span>}
          </button>
        ))}
      </div>

      {/* ── Content: left panel + preview ───────────────────────── */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0">
        {/* Left panel (editor / AI / style / error) */}
        <div className="w-full lg:w-[40%] flex flex-col lg:border-r border-b lg:border-b-0 border-gray-200 overflow-hidden lg:flex-none flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-3">
            {isError ? (
              /* ── Error state: locked panel ── */
              <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-red-400 text-[32px]">error</span>
                </div>
                <h3 className="text-[16px] font-bold text-text-primary">Analysis failed</h3>
                <p className="text-[13px] text-text-secondary mt-1.5 max-w-xs">
                  {resume.issues?.[0]?.message || 'This resume could not be analyzed. The file may be corrupted or unsupported.'}
                </p>
                {resume.issues?.[0]?.suggestion && (
                  <p className="text-[12px] text-text-secondary mt-1 italic max-w-xs">
                    {resume.issues[0].suggestion}
                  </p>
                )}
                <div className="flex flex-col gap-2 mt-6 w-full max-w-xs">
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full px-4 py-2.5 bg-red-500 text-white text-[13px] font-bold rounded-xl hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    {deleting ? 'Deleting…' : 'Delete this resume'}
                  </button>
                  <button
                    onClick={onClose}
                    className="w-full px-4 py-2.5 border border-gray-200 text-[13px] font-medium rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'ai-rewrite' && (
                  <AIRewriteChat
                    resume={resume}
                    onResumeUpdate={onResumeUpdate}
                    activeSection={activeSection}
                    onSectionTag={(s) => setActiveSection(s)}
                  />
                )}
                {activeTab === 'editor' && (
                  <CollapsibleEditor
                    resume={resume}
                    onResumeChange={handleEditorChange}
                    activeSection={activeSection}
                    onSectionFocus={(s) => setActiveSection(s)}
                  />
                )}
                {activeTab === 'style' && (
                  <StyleTab
                    style={resumeStyle}
                    onStyleChange={handleStyleChange}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: preview (60%) — desktop only */}
        <div className="hidden lg:flex lg:w-[60%] bg-gray-50 flex-shrink-0 flex-1 min-h-0">
          <LivePreview
            resume={resume}
            interactive
            onSectionClick={handlePreviewSectionClick}
            activeSection={activeSection}
            style={resumeStyle}
          />
        </div>
      </div>

      {/* ── Mobile preview toggle button ──────────────────────── */}
      <button
        onClick={() => setMobilePreviewOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-30 flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-full shadow-lg hover:bg-gray-800 transition-colors text-[13px] font-medium"
      >
        <span className="material-symbols-outlined text-[18px]">visibility</span>
        Preview
      </button>

      {/* ── Mobile preview overlay (slides in from left) ──────── */}
      {mobilePreviewOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 animate-fade-in"
            onClick={() => setMobilePreviewOpen(false)}
          />
          {/* Slide-in panel */}
          <div className="relative w-full bg-white shadow-2xl flex flex-col animate-slide-in-left">
            {/* Overlay header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
              <h3 className="text-[15px] font-bold text-gray-900">Preview</h3>
              <button
                onClick={() => setMobilePreviewOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px] text-gray-500">close</span>
              </button>
            </div>
            {/* Preview content */}
            <div className="flex-1 overflow-hidden">
              <LivePreview
                resume={resume}
                interactive
                onSectionClick={(section, label) => {
                  handlePreviewSectionClick(section, label);
                  setMobilePreviewOpen(false);
                }}
                activeSection={activeSection}
                style={resumeStyle}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 text-[13px] text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back
        </button>

        <div className="flex items-center gap-2">
          {/* Export dropdown (click-toggle so it works on touch/mobile) */}
          <div className="relative">
            <button
              disabled={exporting}
              onClick={() => setExportMenuOpen((o) => !o)}
              className="flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:border-gray-400 transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              {exporting ? 'Exporting...' : 'Download Resume'}
            </button>
            {exportMenuOpen && (
              <>
                <div className="fixed inset-0 z-[5]" onClick={() => setExportMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-1 z-20">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    <button
                      onClick={() => { setExportMenuOpen(false); handleExport('resume'); }}
                      className="w-full px-4 py-2 text-[12px] text-left hover:bg-gray-50 whitespace-nowrap"
                    >
                      Resume (1 page)
                    </button>
                    <button
                      onClick={() => { setExportMenuOpen(false); handleExport('cv'); }}
                      className="w-full px-4 py-2 text-[12px] text-left hover:bg-gray-50 whitespace-nowrap"
                    >
                      CV (Full detail)
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
