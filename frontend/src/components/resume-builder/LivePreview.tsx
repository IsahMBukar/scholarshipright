'use client';

import { useState, useCallback } from 'react';
import ResumePreview from './ResumePreview';
import type { Resume } from '@/services/api';
import type { ResumeStyle } from './StyleTab';

interface Props {
  resume: Partial<Resume>;
  mode?: 'resume' | 'cv';
  interactive?: boolean;
  onSectionClick?: (section: string, label: string) => void;
  activeSection?: string | null;
  style?: ResumeStyle;
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const SECTION_LABELS: Record<string, string> = {
  header: 'Personal Info',
  summary: 'Summary',
  education: 'Education',
  experience: 'Work Experience',
  research: 'Research & Projects',
  skills: 'Skills',
  certifications: 'Certifications',
  publications: 'Publications',
  awards: 'Awards',
  languages: 'Languages',
  references: 'References',
};

export default function LivePreview({
  resume,
  mode = 'cv',
  interactive = false,
  onSectionClick,
  activeSection,
  style,
}: Props) {
  const [zoom, setZoom] = useState(1);

  const zoomIn = () => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX));
  const zoomOut = () => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN));
  const resetZoom = () => setZoom(1);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => {
        const next = z + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
        return Math.min(Math.max(next, ZOOM_MIN), ZOOM_MAX);
      });
    }
  }, []);

  const handleSectionClick = interactive
    ? (section: string) => {
        const label = SECTION_LABELS[section] || section;
        onSectionClick?.(section, label);
      }
    : undefined;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Zoom controls */}
      <div className="flex items-center justify-center gap-1 px-3 py-1.5 border-b border-gray-200 bg-white flex-shrink-0">
        <button
          onClick={zoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="Zoom out"
        >
          <span className="material-symbols-outlined text-[18px]">remove</span>
        </button>
        <button
          onClick={resetZoom}
          className="px-2 py-0.5 text-[11px] font-semibold text-text-secondary hover:bg-gray-100 rounded-md transition-colors min-w-[44px] text-center"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={zoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="w-7 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-gray-100 disabled:opacity-30 transition-colors"
          title="Zoom in"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
        </button>
      </div>

      {/* Scrollable preview area */}
      <div
        className="flex-1 overflow-auto flex items-start justify-center p-4"
        onWheel={handleWheel}
      >
        {/* Error state: resume has no usable content */}
        {resume.status === 'error' || resume.overall_score === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 max-w-sm">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-red-400 text-[28px]">error</span>
            </div>
            <p className="text-[15px] font-semibold text-text-primary">
              {resume.status === 'error' ? 'Analysis failed' : 'No content to preview'}
            </p>
            <p className="text-[13px] text-text-secondary mt-1.5">
              {resume.issues?.[0]?.message || 'This resume has no usable content. Try uploading a different file or build manually.'}
            </p>
          </div>
        ) : (
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          >
            <ResumePreview
              resume={resume}
              activeSection={activeSection}
              onSectionClick={handleSectionClick}
              mode={mode}
              style={style}
            />
          </div>
        )}
      </div>
    </div>
  );
}
