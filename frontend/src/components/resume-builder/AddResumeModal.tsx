'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadResume, fetchResume, resumeFileError, type Resume } from '@/services/api';

interface Props {
  onClose: () => void;
  /** Called with a fully-analyzed resume so the parent can open the smart editor. */
  onUploadComplete: (resume: Resume) => void;
  /** Called as soon as the upload POST succeeds — parent adds resume to list.
   *  This ensures the resume is visible even if analysis fails later. */
  onResumeCreated: (resume: Resume) => void;
  /** Called when the user picks the manual-build path. */
  onManualStart: () => void;
}

type Mode = 'choose' | 'upload' | 'manual';
type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string; progress: number }
  | { kind: 'analyzing'; fileName: string; resumeId: string; progress: number }
  | { kind: 'error'; message: string; suggestion?: string; fileName?: string };

/**
 * Entry modal for creating a resume.
 *
 * Upload flow:
 *   choose -> dropzone -> uploading -> analyzing (AI reading CV) -> done
 *   When analysis completes, calls onUploadComplete with the full resume
 *   so the parent can open the smart-edit builder.
 *
 * If the user closes the modal during analysis the background task keeps
 * running. The page-level polling in resume/page.tsx updates the list,
 * but does NOT auto-open the editor.
 */
export default function AddResumeModal({ onClose, onUploadComplete, onResumeCreated, onManualStart }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // Cleanup: mark cancelled so polling loop stops when modal unmounts
  useEffect(() => {
    return () => { cancelledRef.current = true; abortRef.current?.abort(); };
  }, []);

  const handleFile = async (file: File) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    cancelledRef.current = false;

    // Validate file type and size before starting anything
    const validationError = resumeFileError(file);
    if (validationError) {
      setMode('upload');
      setUploadState({
        kind: 'error',
        message: validationError,
        fileName: file.name,
      });
      uploadingRef.current = false;
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setMode('upload');
    setUploadState({ kind: 'uploading', fileName: file.name, progress: 0 });

    // ── Stage 1: Upload file ──
    let resume: Resume;
    try {
      resume = await uploadResume(file, file.name.replace(/\.[^.]+$/, ''), [], '', {
        signal: controller.signal,
        onProgress: (percent) => {
          setUploadState((s) =>
            s.kind === 'uploading' ? { ...s, progress: percent } : s,
          );
        },
      });
    } catch (err) {
      uploadingRef.current = false;
      abortRef.current = null;
      // User cancelled — don't show an error, just return to choose.
      if (cancelledRef.current || (err as { code?: string })?.code === 'ERR_CANCELED') {
        backToChoose();
        return;
      }
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setUploadState({
        kind: 'error',
        message: e?.response?.data?.detail || e?.message || "We couldn't process that file. Please try another one.",
        fileName: file.name,
      });
      return;
    }
    abortRef.current = null;

    if (cancelledRef.current) return;

    // ── Let parent know the resume exists in the DB ──
    // This ensures the resume is in the page list even if analysis
    // fails or the user closes the modal during analysis.
    onResumeCreated(resume);

    // ── Stage 2: AI analyzing ──
    // Transition straight to analyzing — the checkmark flash was too brief
    // and users thought nothing happened.
    setUploadState({ kind: 'analyzing', fileName: file.name, resumeId: resume.id, progress: 0 });

    // Poll for analysis completion
    const maxAttempts = 120; // 6 min at 3s intervals
    for (let i = 0; i < maxAttempts; i++) {
      if (cancelledRef.current) return;

      await new Promise((r) => setTimeout(r, 3000));
      if (cancelledRef.current) return;

      // Update progress bar (cosmetic — maps iterations to ~100%)
      setUploadState((s) =>
        s.kind === 'analyzing'
          ? { ...s, progress: Math.min(Math.round(((i + 1) / maxAttempts) * 100), 95) }
          : s,
      );

      try {
        const updated = await fetchResume(resume.id);
        if (cancelledRef.current) return;

        if (updated.status !== 'analyzing') {
          uploadingRef.current = false;

          if (updated.status === 'completed') {
            // Analysis succeeded — hand off to parent to open smart editor
            onUploadComplete(updated);
          } else {
            // Analysis failed (status: 'error') — show error in modal
            const issue = updated.issues?.[0];
            setUploadState({
              kind: 'error',
              message: issue?.message || 'AI analysis failed. The file may be corrupted or in an unsupported format.',
              suggestion: issue?.suggestion,
              fileName: uploadState.kind === 'analyzing' ? uploadState.fileName : undefined,
            });
          }
          return;
        }
      } catch {
        // Transient network error — keep polling
      }
    }

    // Timed out — show error in modal instead of handing off stale resume
    if (!cancelledRef.current) {
      uploadingRef.current = false;
      setUploadState({
        kind: 'error',
        message: 'AI analysis is taking longer than expected. It may still complete in the background.',
        suggestion: 'You can check back later or build your resume manually.',
        fileName: uploadState.kind === 'analyzing' ? uploadState.fileName : undefined,
      });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const pick = (m: 'upload' | 'manual') => {
    if (m === 'manual') {
      onManualStart();
      return;
    }
    setMode('upload');
  };

  const backToChoose = () => {
    cancelledRef.current = true;
    uploadingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    setMode('choose');
    setUploadState({ kind: 'idle' });
    setDragOver(false);
  };

  // Don't allow closing during upload/analyzing via backdrop click
  const handleBackdropClick = () => {
    if (uploadState.kind === 'uploading' || uploadState.kind === 'analyzing') return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-6 animate-backdrop"
      onClick={handleBackdropClick}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/20 animate-sheet-up sm:animate-modal-in flex flex-col max-h-[92dvh] sm:max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[22px]">description</span>
            </div>
            <div>
              <h3 className="text-[16px] font-bold text-text-primary">
                {uploadState.kind === 'analyzing' ? 'Analyzing Resume' : 'Add a Resume'}
              </h3>
              <p className="text-[12px] text-text-secondary">
                {uploadState.kind === 'analyzing'
                  ? 'AI is reading your CV — this usually takes under a minute'
                  : 'Upload your CV or build one from scratch'}
              </p>
            </div>
          </div>
          {/* During upload / analysis we hide the close button, but keep a
              cancel affordance so a slow upload or long analysis isn't a dead end. */}
          {uploadState.kind === 'uploading' ? (
            <button
              onClick={backToChoose}
              aria-label="Cancel upload"
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Cancel
            </button>
          ) : uploadState.kind === 'analyzing' ? (
            <button
              onClick={backToChoose}
              className="flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-gray-100 rounded-lg transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
              Cancel
            </button>
          ) : (
            <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-[20px] text-text-secondary">close</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {mode === 'choose' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => pick('upload')}
                className="group flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-center"
              >
                <span className="material-symbols-outlined text-primary text-[36px] group-hover:scale-110 transition-transform">cloud_upload</span>
                <div>
                  <p className="text-[15px] font-bold text-text-primary">Upload a CV</p>
                  <p className="text-[12px] text-text-secondary mt-1">PDF, DOC, or image — AI extracts everything</p>
                </div>
              </button>
              <button
                onClick={() => pick('manual')}
                className="group flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition-all text-center"
              >
                <span className="material-symbols-outlined text-primary text-[36px] group-hover:scale-110 transition-transform">edit_note</span>
                <div>
                  <p className="text-[15px] font-bold text-text-primary">Build manually</p>
                  <p className="text-[12px] text-text-secondary mt-1">Answer guided questions — AI writes it for you</p>
                </div>
              </button>
            </div>
          )}

          {mode === 'upload' && uploadState.kind === 'idle' && (
            <div>
              <button onClick={backToChoose} className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-primary mb-4 transition-colors">
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Back
              </button>
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
                  dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-gray-300 bg-gray-50 hover:border-primary hover:bg-primary/5'
                }`}
              >
                <span className="material-symbols-outlined text-primary text-[44px] block mx-auto">cloud_upload</span>
                <p className="text-[15px] font-semibold text-text-primary mt-2">Drop your CV here</p>
                <p className="text-[13px] text-text-secondary mt-1">
                  or <span className="text-primary font-semibold">browse</span> · PDF, DOC, or image
                </p>
                <p className="text-[11px] text-text-tertiary mt-1">Max 10MB per file</p>
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={onFileInput} />
              </div>
              <p className="text-center text-[11px] text-text-secondary mt-4">
                💡 Uploading is fastest — your profile fields are auto-filled.
              </p>
            </div>
          )}

          {mode === 'upload' && uploadState.kind === 'error' && (
            <div className="text-center py-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-red-500 text-[28px]">error</span>
              </div>
              <p className="text-[15px] font-semibold text-text-primary">Analysis failed</p>
              <p className="text-[13px] text-text-secondary mt-1 max-w-md mx-auto">{uploadState.message}</p>
              {uploadState.suggestion && (
                <p className="text-[12px] text-text-secondary mt-1 max-w-md mx-auto italic">{uploadState.suggestion}</p>
              )}
              <div className="flex justify-center gap-3 mt-5">
                <button onClick={backToChoose} className="px-4 py-2.5 border border-gray-200 text-[13px] font-semibold rounded-xl hover:border-gray-300 transition-colors">
                  Try uploading again
                </button>
                <button onClick={onManualStart} className="px-4 py-2.5 bg-primary text-white text-[13px] font-semibold rounded-xl hover:brightness-110 transition-all">
                  Build manually
                </button>
              </div>
            </div>
          )}

          {uploadState.kind === 'uploading' && (
            <UploadingState fileName={uploadState.fileName} progress={uploadState.progress} />
          )}

          {uploadState.kind === 'analyzing' && (
            <AnalyzingState fileName={uploadState.fileName} progress={uploadState.progress} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Uploading: real progress bar ── */
function UploadingState({ fileName, progress }: { fileName: string; progress: number }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <span className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
      <h4 className="text-[16px] font-bold text-text-primary">Uploading your file…</h4>
      <p className="text-[13px] text-text-secondary mt-1">{fileName}</p>
      <div className="w-72 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-5">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(progress, 3)}%` }}
        />
      </div>
      <p className="text-[11px] text-text-secondary mt-2">{Math.max(progress, 0)}%</p>
      <p className="text-[11px] text-text-secondary mt-1">Sending securely…</p>
    </div>
  );
}

/* ── Analyzing: animated AI loader with progress ── */
function AnalyzingState({ fileName, progress }: { fileName: string; progress: number }) {
  return (
    <div className="flex flex-col items-center text-center py-8">
      {/* Animated AI orb */}
      <div className="relative w-20 h-20 mb-6">
        {/* Outer pulse ring */}
        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
        {/* Middle ring */}
        <div className="absolute inset-1 rounded-full bg-primary/20 animate-pulse" />
        {/* Inner icon */}
        <div className="absolute inset-2 rounded-full bg-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-white text-[28px] animate-pulse">auto_awesome</span>
        </div>
      </div>

      <h4 className="text-[17px] font-bold text-text-primary">AI is reading your CV</h4>
      <p className="text-[13px] text-text-secondary mt-1.5 max-w-sm">
        Extracting your education, experience, skills, and achievements…
      </p>

      {/* Progress bar */}
      <div className="w-72 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-5">
        <div
          className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.max(progress, 6)}%` }}
        />
      </div>
      <p className="text-[11px] text-text-secondary mt-2">This usually takes under a minute</p>

      {/* File name */}
      <p className="text-[11px] text-text-tertiary mt-4 flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">description</span>
        {fileName}
      </p>
    </div>
  );
}
