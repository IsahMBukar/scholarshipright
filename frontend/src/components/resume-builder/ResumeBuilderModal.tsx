'use client';

import { useEffect, useState } from 'react';
import type { Resume } from '@/services/api';
import ResumeBuilderWizard from './ResumeBuilderWizard';
import { BuilderWizardSkeleton } from '@/components/Skeletons';

interface Props {
  resume: Resume;
  onResumeUpdate: (resume: Resume) => void;
  onClose: () => void;
}

/**
 * Turns the ResumeBuilderWizard into a true modal dialog: backdrop + centered
 * responsive panel (full-screen sheet on mobile, large dialog on desktop).
 * Renders a skeleton while the parent supplies/refreshes the resume.
 */
export default function ResumeBuilderModal({ resume, onResumeUpdate, onClose }: Props) {
  const [ready, setReady] = useState(false);

  // Small delay so the (re)loaded resume settles before rendering the wizard,
  // giving a clean skeleton flash instead of a jarring swap on low networks.
  useEffect(() => {
    setReady(false);
    const t = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(t);
  }, [resume?.id]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-6 animate-backdrop" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full h-full sm:h-[92vh] sm:max-w-5xl bg-white sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl border border-white/20 animate-sheet-up sm:animate-modal-in"
      >
        {ready ? (
          <ResumeBuilderWizard
            resume={resume}
            onResumeUpdate={onResumeUpdate}
            onClose={onClose}
          />
        ) : (
          <BuilderWizardSkeleton />
        )}
      </div>
    </div>
  );
}
