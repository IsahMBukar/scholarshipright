'use client';

import { useState, useEffect } from 'react';
import { exportResumePdf, type Resume } from '@/services/api';
import LivePreview from './LivePreview';

interface Props {
  resume: Resume;
  onClose: () => void;
}

const TEMPLATES = [
  { id: 'compact', label: 'Compact', desc: 'Dense, fits more content' },
  { id: 'centered', label: 'Centered', desc: 'Clean, balanced layout' },
  { id: 'structured', label: 'Structured', desc: 'Clear section dividers' },
];

export default function ResumeExportModal({ resume, onClose }: Props) {
  const [mode, setMode] = useState<'resume' | 'cv'>('resume');
  const [template, setTemplate] = useState('compact');
  const [exporting, setExporting] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportResumePdf(resume.id, mode);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-5xl h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h2 className="text-[18px] font-bold text-text-primary">Export Resume</h2>
            <p className="text-[12px] text-text-secondary">{resume.full_name || resume.title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body: preview + options — stacks on mobile, side-by-side on md+ */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Left: preview */}
          <div className="md:flex-1 md:border-r md:border-gray-200 h-[45vh] md:h-auto flex-shrink-0">
            <LivePreview resume={resume} mode={mode} />
          </div>

          {/* Right: export options */}
          <div className="md:w-72 p-5 flex flex-col gap-5 overflow-y-auto md:flex-shrink-0 flex-shrink-0">
            {/* Mode toggle */}
            <div>
              <label className="text-[13px] font-semibold text-text-primary block mb-2">Format</label>
              <div className="flex gap-2">
                {(['resume', 'cv'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                      mode === m
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                    }`}
                  >
                    {m === 'resume' ? 'Resume (1 page)' : 'CV (Full detail)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Template picker */}
            <div>
              <label className="text-[13px] font-semibold text-text-primary block mb-2">Template</label>
              <div className="space-y-2">
                {TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(t.id)}
                    className={`w-full p-3 rounded-xl border-2 text-left transition-colors ${
                      template === t.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-primary/40'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-text-primary">{t.label}</p>
                    <p className="text-[11px] text-text-secondary">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Download */}
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full py-3.5 bg-primary text-white text-[15px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {exporting ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                  Exporting...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">download</span>
                  Download {mode === 'resume' ? 'Resume' : 'CV'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
