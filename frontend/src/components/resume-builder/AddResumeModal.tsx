'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadResume, fetchResume, type Resume } from '@/services/api';

interface Props {
  onClose: () => void;
  /** Called once upload + AI analysis complete, with the prefilled resume. */
  onUploadComplete: (resume: Resume) => void;
  /** Called when the user picks the manual-build path. */
  onManualStart: () => void;
}

type Mode = 'choose' | 'upload' | 'manual';
type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fileName: string }
  | { kind: 'analyzing'; fileName: string; progress: number }
  | { kind: 'error'; message: string };

/**
 * Entry modal for creating a resume. The user picks between two side-by-side
 * options:
 *   - Upload a CV  -> dropzone -> upload -> AI analyzing (progress) -> opens
 *                     the pre-filled builder via onUploadComplete.
 *   - Build manually -> route into the guided ResumeFormWizard.
 */
export default function AddResumeModal({ onClose, onUploadComplete, onManualStart }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [uploadState, setUploadState] = useState<UploadState>({ kind: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  // Cleanup: mark unmounted so polling loop stops
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const handleFile = async (file: File) => {
    setMode('upload');
    setUploadState({ kind: 'uploading', fileName: file.name });

    let resume: Resume;
    try {
      resume = await uploadResume(file, file.name.replace(/\.[^.]+$/, ''), [], '');
    } catch (err) {
      if (!mountedRef.current) return;
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setUploadState({
        kind: 'error',
        message: e?.response?.data?.detail || e?.message || "We couldn't process that file. Please try another one.",
      });
      return;
    }

    if (!mountedRef.current) return;
    setUploadState({ kind: 'analyzing', fileName: file.name, progress: 0 });

    // Poll until the background AI analysis completes and pre-fills the resume.
    const maxAttempts = 150; // ~5 min
    for (let i = 0; i < maxAttempts; i++) {
      if (!mountedRef.current) return; // component unmounted — stop polling
      setUploadState((s) => (s.kind === 'analyzing' ? { ...s, progress: Math.round(((i + 1) / maxAttempts) * 100) } : s));
      await new Promise((r) => setTimeout(r, 2000));
      if (!mountedRef.current) return;
      try {
        const updated = await fetchResume(resume.id);
        if (!mountedRef.current) return;
        if (updated.status !== 'analyzing') {
          onUploadComplete(updated);
          return;
        }
      } catch {
        // transient — keep polling
      }
    }

    // Timed out — still proceed to the builder with whatever we have.
    if (mountedRef.current) {
      onUploadComplete(resume);
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
    setMode('choose');
    setUploadState({ kind: 'idle' });
    setDragOver(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-6 animate-backdrop"
      onClick={onClose}
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
              <h3 className="text-[16px] font-bold text-text-primary">Add a Resume</h3>
              <p className="text-[12px] text-text-secondary">Upload your CV or build one from scratch</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[20px] text-text-secondary">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {mode === 'choose' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => pick('upload')}
                className="group flex flex-col items-center text-center p-6 rounded-2xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition-all hover:shadow-md"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-primary text-[30px]">upload_file</span>
                </div>
                <p className="text-[15px] font-bold text-text-primary">Upload a CV</p>
                <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                  Our AI reads your file and auto-fills your education, work &amp; skills in seconds.
                </p>
                <span className="mt-4 text-[12px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Choose file →
                </span>
              </button>

              <button
                onClick={() => pick('manual')}
                className="group flex flex-col items-center text-center p-6 rounded-2xl border-2 border-gray-200 hover:border-primary hover:bg-primary/5 transition-all hover:shadow-md"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 transition-transform group-hover:scale-110">
                  <span className="material-symbols-outlined text-primary text-[30px]">edit_note</span>
                </div>
                <p className="text-[15px] font-bold text-text-primary">Build Manually</p>
                <p className="text-[12px] text-text-secondary mt-1 leading-relaxed">
                  Fill in your details section by section, guided like onboarding. Skip what you don&apos;t have.
                </p>
                <span className="mt-4 text-[12px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Start building →
                </span>
              </button>
            </div>
          )}

          {mode === 'upload' && uploadState.kind === 'idle' && (
            <div>
              <button onClick={backToChoose} className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-primary mb-4 transition-colors">
                <span className="material-symbols-outlined text-[17px]">arrow_back</span>
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
                  or <span className="text-primary font-semibold">browse</span> · PDF, DOC, image
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
                  className="hidden"
                  onChange={onFileInput}
                />
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
              <p className="text-[15px] font-semibold text-text-primary">Something went wrong</p>
              <p className="text-[13px] text-text-secondary mt-1 max-w-md mx-auto">{uploadState.message}</p>
              <div className="flex justify-center gap-3 mt-5">
                <button onClick={backToChoose} className="px-4 py-2.5 border border-gray-200 text-[13px] font-semibold rounded-xl hover:border-gray-300 transition-colors">
                  Try again
                </button>
                <button onClick={onManualStart} className="px-4 py-2.5 bg-primary text-white text-[13px] font-semibold rounded-xl hover:brightness-110 transition-all">
                  Build manually instead
                </button>
              </div>
            </div>
          )}

          {(uploadState.kind === 'uploading' || uploadState.kind === 'analyzing') && (
            <ResumeProcessing
              fileName={uploadState.fileName}
              analyzing={uploadState.kind === 'analyzing'}
              progress={uploadState.kind === 'analyzing' ? uploadState.progress : 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ResumeProcessing({ fileName, analyzing, progress }: { fileName: string; analyzing: boolean; progress: number }) {
  return (
    <div className="flex flex-col items-center text-center py-6">
      <div className="relative w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <span className="inline-block w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        {analyzing && (
          <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center">
            <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
          </span>
        )}
      </div>
      <h4 className="text-[16px] font-bold text-text-primary">
        {analyzing ? 'AI is reading your CV…' : 'Uploading…'}
      </h4>
      <p className="text-[13px] text-text-secondary mt-1">{fileName}</p>
      {analyzing ? (
        <>
          <div className="w-64 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-4">
            <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${Math.max(progress, 8)}%` }} />
          </div>
          <p className="text-[11px] text-text-secondary mt-2">Extracting your details — this usually takes under a minute.</p>
        </>
      ) : (
        <p className="text-[11px] text-text-secondary mt-2">Sending your file securely…</p>
      )}
    </div>
  );
}

