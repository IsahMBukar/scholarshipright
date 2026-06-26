'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { uploadResume, type Resume } from '@/services/api';

/**
 * ResumeSlide — slide 1 of the onboarding carousel.
 *
 * Three paths:
 *   A. User uploads a resume → /api/resumes → backend analyzes in BG
 *   B. User has no resume → "I don't have a resume" → /resume?onboarding=1&return=/onboarding
 *   C. Upload fails → show inline error + "Try manual entry instead" button
 *
 * The upload must not block forward motion. If it fails, the user can
 * still proceed via the manual path.
 */

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'analyzing'; fileName: string }
  | { kind: 'success'; resume: Resume }
  | { kind: 'error'; message: string };

export default function ResumeSlide({
  initialStatus,
  onComplete,
  onSkip,
  onMarkManual,
}: {
  initialStatus: 'none' | 'pending' | 'uploading' | 'analyzing' | 'completed' | 'error' | 'manual';
  onComplete: () => void;
  onSkip: () => void;
  /**
   * Called when the user picks "I don't have a resume". The parent
   * uses this to write the per-user manual-source flag, instead of
   * the slide doing it directly (so the flag is scoped to the user
   * that's actually signed in, not the previous user on the same
   * browser).
   */
  onMarkManual?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setState({ kind: 'uploading', fileName: file.name });

    try {
      const resume = await uploadResume(
        file,
        file.name.replace(/\.[^.]+$/, ''),
        [],   // target_fields — collected later
        ''    // target_degree — collected later
      );
      setState({ kind: 'analyzing', fileName: file.name });
      // Background analysis is happening on the server. Brief pause so
      // the user sees the "AI analyzing" state before we move on.
      // The slide moves forward immediately so they can keep going.
      setTimeout(() => {
        onComplete();
      }, 1200);
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "We couldn't process that file. It might be too large or in an unsupported format.";
      setState({ kind: 'error', message: String(msg) });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onManualEntry = () => {
    // Tell the parent to mark the manual-source flag in the per-user
    // scoped localStorage slot. The slide must NOT touch the unscoped
    // legacy key directly — that would let the next user on the same
    // browser inherit the previous user's manual-source state.
    // The parent then routes to /resume with a return URL that
    // bounces the user back here when they save.
    if (onMarkManual) {
      void onMarkManual();
    }
    router.push('/resume?onboarding=1&return=/onboarding');
  };

  // ── Already has a resume (came back from /resume?return=)
  if (initialStatus === 'completed' || initialStatus === 'analyzing' || initialStatus === 'pending') {
    return (
      <div className="flex flex-col items-center text-center px-4 py-6">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-green-600 text-[32px]">check_circle</span>
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">Resume uploaded</h2>
        <p className="text-[14px] text-text-secondary mt-2 max-w-sm">
          {initialStatus === 'analyzing' || initialStatus === 'pending'
            ? "Our AI is analyzing it. You can keep going — we'll finish in the background."
            : "Your resume is ready. Let's continue."}
        </p>
        <button
          onClick={onComplete}
          className="mt-6 px-8 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
        >
          Continue
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    );
  }

  // ── Already on manual path
  if (initialStatus === 'manual') {
    return (
      <div className="flex flex-col items-center text-center px-4 py-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-primary text-[32px]">edit_note</span>
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">Manual entry set up</h2>
        <p className="text-[14px] text-text-secondary mt-2 max-w-sm">
          You can fill in your details step-by-step. Let&apos;s continue with your profile.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 px-8 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
        >
          Continue
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    );
  }

  // ── Error state
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center text-center px-4 py-6">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-amber-600 text-[32px]">upload_file</span>
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">Upload didn&apos;t work</h2>
        <p className="text-[13px] text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-2 max-w-sm">
          {state.message}
        </p>
        <p className="text-[14px] text-text-secondary mt-3 max-w-sm">
          No problem — you can fill in your details manually instead.
        </p>
        <button
          onClick={onManualEntry}
          className="mt-5 px-8 py-3 bg-primary text-text-inverse text-[14px] font-bold rounded-btn hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">edit_note</span>
          Fill in manually
        </button>
        <button
          onClick={() => setState({ kind: 'idle' })}
          className="mt-3 text-[13px] text-text-secondary hover:text-primary hover:underline"
        >
          ← Try a different file
        </button>
      </div>
    );
  }

  // ── Uploading / analyzing
  if (state.kind === 'uploading' || state.kind === 'analyzing') {
    return (
      <div className="flex flex-col items-center text-center px-4 py-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <span className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <h2 className="text-[22px] font-extrabold text-text-primary">
          {state.kind === 'uploading' ? 'Uploading…' : 'AI is analyzing your CV…'}
        </h2>
        <p className="text-[14px] text-text-secondary mt-2 max-w-sm">
          {state.fileName}
        </p>
        <p className="text-[12px] text-text-secondary mt-1">
          Hang tight — you can keep going while we work.
        </p>
      </div>
    );
  }

  // ── Default: upload prompt
  return (
    <div className="flex flex-col items-center text-center px-4 py-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
        <span className="material-symbols-outlined text-primary text-[32px]">description</span>
      </div>
      <h2 className="text-[22px] font-extrabold text-text-primary">
        Add your resume
      </h2>
      <p className="text-[14px] text-text-secondary mt-1 max-w-sm">
        Upload a CV and our AI will auto-fill your education, work, and skills in seconds.
      </p>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`mt-5 w-full max-w-sm cursor-pointer rounded-2xl border-2 border-dashed p-7 transition-all ${
          dragOver
            ? 'border-primary bg-primary/5 scale-[1.02]'
            : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-primary/5'
        }`}
      >
        <span className="material-symbols-outlined text-primary text-[44px] block mx-auto">cloud_upload</span>
        <p className="text-[14px] font-semibold text-text-primary mt-2">
          Drop your file here
        </p>
        <p className="text-[12px] text-text-secondary mt-1">
          or <span className="text-primary-readable font-semibold">browse</span> · PDF, DOC, image
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={onFileInput}
        />
      </div>

      {/* Manual entry link */}
      <button
        onClick={onManualEntry}
        className="mt-5 text-[13px] text-text-secondary hover:text-primary transition-colors inline-flex items-center gap-1.5 group"
      >
        <span className="material-symbols-outlined text-[16px]">edit_note</span>
        I don&apos;t have a resume — fill in manually
        <span className="material-symbols-outlined text-[14px] opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
      </button>

      <p className="text-[11px] text-text-secondary mt-4 max-w-xs">
        💡 Uploading a resume is faster — it auto-fills 7+ profile fields.
      </p>

      {/* Skip option for users who want to fill profile first */}
      <button
        onClick={onSkip}
        className="mt-4 text-[12px] text-text-secondary/70 hover:text-text-secondary transition-colors"
      >
        Skip for now →
      </button>
    </div>
  );
}
