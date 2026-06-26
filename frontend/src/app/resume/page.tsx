'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { ResumeListSkeleton } from '@/components/Skeletons';
import OnboardingProgress from '@/components/OnboardingProgress';
import {
  fetchResumes, fetchResume, uploadResume, updateResume, deleteResume,
  setPrimaryResume, rewriteField, reanalyzeResume, exportResumePdf,
} from '@/services/api';
import type { Resume, ResumeIssue } from '@/services/api';

const DEGREE_OPTIONS = ['bachelor', 'master', 'phd', 'diploma', 'short_course', 'certificate'];
const FIELDS = ['computer_science', 'engineering', 'medicine', 'business', 'law', 'natural_sciences', 'social_sciences', 'arts', 'education', 'agriculture', 'public_health', 'economics', 'mathematics', 'physics', 'chemistry', 'biology'];

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  urgent: { color: 'text-red-600', bg: 'bg-red-50', icon: 'error', label: 'Urgent' },
  severe: { color: 'text-amber-700', bg: 'bg-amber-50', icon: 'warning', label: 'Severe' },
  likely: { color: 'text-blue-600', bg: 'bg-blue-50', icon: 'info', label: 'Likely' },
};

export default function ResumePage() {
  // useSearchParams() in App Router requires a Suspense boundary.
  return (
    <Suspense
      fallback={
        <AppLayout showRightPanel={false}>
          <PageHeader title="RESUME" />
          <div className="min-h-[60vh] flex items-center justify-center text-text-secondary text-sm">
            Loading…
          </div>
        </AppLayout>
      }
    >
      <ResumePageInner />
    </Suspense>
  );
}

function ResumePageInner() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'upload' | 'editor'>('list');
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pollProgress, setPollProgress] = useState(0); // 0-100 during analysis polling

  // `?onboarding=1` puts a "Return to onboarding" banner at the top of
  // the page so the user doesn't get lost after leaving the hub.
  const searchParams = useSearchParams();
  const fromOnboarding = searchParams.get('onboarding') === '1';

  // Upload form
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [targetFields, setTargetFields] = useState<string[]>([]);
  const [targetDegree, setTargetDegree] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Editor state
  const [editData, setEditData] = useState<Partial<Resume>>({});
  const [saving, setSaving] = useState(false);
  const [rewritingField, setRewritingField] = useState<string | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<'overview' | 'issues' | 'education' | 'experience' | 'research' | 'skills' | 'certifications' | 'publications' | 'references'>('overview');

  useEffect(() => {
    loadResumes();
  }, []);

  async function loadResumes() {
    try {
      const data = await fetchResumes();
      setResumes(data);
      if (data.length === 0) setView('upload');
    } catch (err) {
      console.error('Failed to load resumes:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---- UPLOAD ----
  async function handleUpload() {
    if (!uploadFile) return;
    setUploading(true);
    setAnalyzing(true);
    try {
      const resume = await uploadResume(uploadFile, uploadTitle || uploadFile.name.replace(/\.[^.]+$/, ''), targetFields, targetDegree);
      setResumes(prev => [resume, ...prev]);
      setSelectedResume(resume);
      setEditData(resume);
      setView('editor');
      // Reset form
      setUploadFile(null);
      setUploadTitle('');
      setTargetFields([]);
      setTargetDegree('');
      
      // Poll for AI analysis completion
      if (resume.status === 'analyzing') {
        pollForCompletion(resume.id);
      } else {
        setAnalyzing(false);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setAnalyzing(false);
    } finally {
      setUploading(false);
    }
  }
  async function pollForCompletion(resumeId: string) {
    const maxAttempts = 150; // 5 min max (MiMo reasoning can take 2-3 min)
    for (let i = 0; i < maxAttempts; i++) {
      setPollProgress(Math.round(((i + 1) / maxAttempts) * 100));
      await new Promise(r => setTimeout(r, 2000));
      try {
        const updated = await fetchResume(resumeId);
        if (updated.status !== 'analyzing') {
          setSelectedResume(updated);
          setEditData(updated);
          setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
          setAnalyzing(false);
          setPollProgress(0);
          return;
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }
    // Timed out — analysis is taking unusually long
    setAnalyzing(false);
    setPollProgress(0);
  }

  // ---- EDITOR ----
  function openEditor(resume: Resume) {
    setSelectedResume(resume);
    setEditData(resume);
    setView('editor');
    setActiveEditorTab('overview');
    if (resume.status === 'analyzing') {
      setAnalyzing(true);
      pollForCompletion(resume.id);
    }
  }

  async function handleSave() {
    if (!selectedResume) return;
    setSaving(true);
    try {
      const updated = await updateResume(selectedResume.id, editData);
      setSelectedResume(updated);
      setEditData(updated);
      setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  }

  const [exporting, setExporting] = useState(false);
  async function handleExportPdf(mode: 'resume' | 'cv') {
    if (!selectedResume) return;
    setExporting(true);
    try {
      await exportResumePdf(selectedResume.id, mode);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleAIRewrite(field: string, value: string) {
    if (!selectedResume) return;
    setRewritingField(field);
    try {
      const result = await rewriteField(selectedResume.id, field, value);
      setEditData(prev => ({ ...prev, [field]: result.improved_value }));
    } catch (err) {
      console.error('Rewrite failed:', err);
    } finally {
      setRewritingField(null);
    }
  }

  async function handleSetPrimary(id: string) {
    try {
      await setPrimaryResume(id);
      setResumes(prev => prev.map(r => ({ ...r, is_primary: r.id === id })));
    } catch (err) {
      console.error('Set primary failed:', err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteResume(id);
      setResumes(prev => prev.filter(r => r.id !== id));
      if (selectedResume?.id === id) {
        setSelectedResume(null);
        setView('list');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function handleReanalyze() {
    if (!selectedResume) return;
    setAnalyzing(true);
    try {
      const updated = await reanalyzeResume(selectedResume.id);
      setSelectedResume(updated);
      setEditData(updated);
      setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
    } catch (err) {
      console.error('Reanalyze failed:', err);
    } finally {
      setAnalyzing(false);
    }
  }

  function updateField(field: string, value: any) {
    setEditData(prev => ({ ...prev, [field]: value }));
  }

  function getIssueCount(severity: string): number {
    return (selectedResume?.issues || []).filter((i: ResumeIssue) => i.severity === severity).length;
  }

  // ---- RENDER ----
  if (loading) {
    return (
      <AppLayout showRightPanel={false}>
        <PageHeader title="RESUME" />
        <div className="p-4 md:p-6">
          <ResumeListSkeleton count={3} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout showRightPanel={false}>
      <PageHeader title="RESUME" />
      <OnboardingProgress />
      <div className="px-4 md:px-6 py-6 max-w-[900px]">

        {/* Onboarding breadcrumb banner (only when arriving from the hub) */}
        {fromOnboarding && (
          <div className="mb-5 flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <span className="material-symbols-outlined text-primary text-[18px]">arrow_back</span>
            <p className="text-[12px] text-text-secondary flex-1">
              You're in onboarding. Upload your resume here, then return to the hub to finish setup.
            </p>
            <Link
              href="/onboarding"
              className="text-[12px] font-bold text-primary hover:underline whitespace-nowrap"
            >
              Return to hub →
            </Link>
          </div>
        )}

        {/* ===== LIST VIEW ===== */}
        {view === 'list' && (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <p className="text-[14px] text-text-secondary mt-1">Manage your CVs for scholarship applications</p>
              </div>
              <button
                onClick={() => setView('upload')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white text-[14px] font-semibold rounded-btn hover:brightness-110 transition-all w-full sm:w-auto"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Add Resume
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {resumes.map((resume) => (
                <div key={resume.id} className="bg-white rounded-card border border-gray-200 p-4 md:p-5 hover:shadow-md transition-shadow">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-[16px] font-bold text-text-primary truncate">{resume.title}</h3>
                        {resume.is_primary && (
                          <span className="px-2 py-0.5 rounded-[6px] bg-primary-light text-[11px] font-bold text-primary">PRIMARY</span>
                        )}
                        {resume.status === 'analyzing' && (
                          <span className="px-2 py-0.5 rounded-[6px] bg-blue-50 text-[11px] font-bold text-blue-600">ANALYZING</span>
                        )}
                        {resume.status === 'error' && (
                          <span className="px-2 py-0.5 rounded-[6px] bg-red-50 text-[11px] font-bold text-red-600">ERROR</span>
                        )}
                      </div>
                      <p className="text-[13px] text-text-secondary">
                        {resume.full_name || 'No name'} · {resume.target_degree?.toUpperCase() || 'Any degree'} · {resume.target_fields?.join(', ') || 'General'}
                      </p>
                      {resume.level_aware_completeness?.display_score != null && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${resume.level_aware_completeness.base_score >= 70 ? 'bg-green-500' : resume.level_aware_completeness.base_score >= 50 ? 'bg-primary' : 'bg-red-400'}`} style={{ width: `${Math.min(resume.level_aware_completeness.base_score, 100)}%` }} />
                          </div>
                          <span className="text-[12px] font-semibold text-text-secondary">{Math.round(resume.level_aware_completeness.base_score)}%</span>
                        </div>
                      )}
                      {(resume.issues || []).length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {['urgent', 'severe', 'likely'].map(sev => {
                            const count = (resume.issues || []).filter((i: ResumeIssue) => i.severity === sev).length;
                            if (!count) return null;
                            const cfg = SEVERITY_CONFIG[sev];
                            return (
                              <span key={sev} className={`px-2 py-0.5 rounded-[6px] ${cfg.bg} text-[11px] font-medium ${cfg.color}`}>
                                {count} {cfg.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                      <button onClick={() => openEditor(resume)} className="flex-1 sm:flex-none px-3 py-1.5 bg-gray-100 text-text-primary text-[12px] font-medium rounded-btn hover:bg-gray-200 transition-colors text-center sm:text-left">
                        Edit
                      </button>
                      {!resume.is_primary && (
                        <button onClick={() => handleSetPrimary(resume.id)} className="flex-1 sm:flex-none px-3 py-1.5 border border-gray-200 text-text-secondary text-[12px] font-medium rounded-btn hover:border-primary hover:text-primary transition-colors text-center sm:text-left">
                          Set Primary
                        </button>
                      )}
                      <button onClick={() => handleDelete(resume.id)} className="flex-1 sm:flex-none px-3 py-1.5 text-red-500 text-[12px] font-medium rounded-btn hover:bg-red-50 transition-colors text-center sm:text-left">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== UPLOAD VIEW ===== */}
        {view === 'upload' && (
          <>
            <button onClick={() => setView('list')} className="flex items-center gap-1 text-[14px] text-text-secondary hover:text-text-primary mb-4 transition-colors">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Back to resumes
            </button>

            <p className="text-[14px] text-text-secondary mb-6">Upload your CV and our AI will analyze and structure it for scholarship applications</p>

            {/* File upload area */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
              className={`border-2 border-dashed rounded-card p-8 md:p-12 text-center cursor-pointer transition-colors mb-6
                ${uploadFile ? 'border-primary bg-primary-light/10' : 'border-gray-300 hover:border-primary hover:bg-gray-50'}`}
            >
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFile(f); }} />
              {uploadFile ? (
                <>
                  <span className="material-symbols-outlined text-[40px] text-primary mb-2 block">description</span>
                  <p className="text-[16px] font-semibold text-text-primary">{uploadFile.name}</p>
                  <p className="text-[13px] text-text-secondary mt-1">{(uploadFile.size / 1024).toFixed(0)} KB · Click to change</p>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[48px] text-text-secondary mb-3 block">cloud_upload</span>
                  <p className="text-[16px] font-semibold text-text-primary mb-1">Drop your CV here or click to browse</p>
                  <p className="text-[13px] text-text-secondary">Supports PDF, Word (.docx), and images (JPG, PNG)</p>
                </>
              )}
            </div>

            {/* Resume title */}
            <div className="mb-4">
              <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Resume Title</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g. CS Masters Resume, PhD Research CV..."
                className="w-full p-3 bg-gray-100 border border-gray-200 rounded-chip text-text-primary focus:ring-2 focus:ring-primary outline-none"
              />
            </div>

            {/* Target degree */}
            <div className="mb-4">
              <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Target Degree / Program</label>
              <div className="flex flex-wrap gap-2">
                {DEGREE_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setTargetDegree(d === targetDegree ? '' : d)}
                    className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${
                      targetDegree === d ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                    }`}
                  >
                    {d.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
              </div>
            </div>

            {/* Target fields */}
            <div className="mb-6">
              <label className="text-[14px] font-semibold text-text-primary block mb-1.5">Target Fields of Study</label>
              <div className="flex flex-wrap gap-2">
                {FIELDS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setTargetFields(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])}
                    className={`px-3 py-1.5 rounded-chip text-[13px] font-medium transition-colors ${
                      targetFields.includes(f) ? 'bg-primary text-text-inverse' : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                    }`}
                  >
                    {f.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              className="w-full py-4 bg-primary text-white text-[16px] font-bold rounded-btn hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                  {analyzing ? 'AI is analyzing your CV...' : 'Uploading...'}
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                  Upload & Analyze with AI
                </>
              )}
            </button>
          </>
        )}

        {/* ===== EDITOR VIEW ===== */}
        {view === 'editor' && selectedResume && (
          <>
            <button onClick={() => { setView('list'); setSelectedResume(null); }} className="flex items-center gap-1 text-[14px] text-text-secondary hover:text-text-primary mb-4 transition-colors">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              Back to resumes
            </button>

            {/* Editor header */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[20px] sm:text-[22px] font-bold text-text-primary">{selectedResume.title}</h1>
                  {selectedResume.is_primary && (
                    <span className="px-2 py-0.5 rounded-[6px] bg-primary-light text-[11px] font-bold text-primary">PRIMARY</span>
                  )}
                </div>
                {selectedResume.level_aware_completeness?.display_score != null && (
                  <div className="flex items-center gap-2 sm:gap-3 mt-1 flex-wrap">
                    <span className="text-[14px] font-bold text-primary">{Math.round(selectedResume.level_aware_completeness.display_score)}%</span>
                    <span className="text-[12px] text-text-secondary">
                      {selectedResume.level_aware_completeness.base_score}% base
                      {selectedResume.level_aware_completeness.bonus_score > 0 && (
                        <span className="text-primary-readable font-semibold"> + {selectedResume.level_aware_completeness.bonus_score}% bonus</span>
                      )}
                    </span>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                      selectedResume.level_aware_completeness.grade === 'Excellent' ? 'bg-green-50 text-green-700' :
                      selectedResume.level_aware_completeness.grade === 'Strong' ? 'bg-blue-50 text-blue-700' :
                      selectedResume.level_aware_completeness.grade === 'Fair' ? 'bg-amber-50 text-amber-700' :
                      'bg-red-50 text-red-700'
                    }`}>{selectedResume.level_aware_completeness.grade}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                <div className="relative">
                  <button
                    disabled={exporting}
                    onClick={() => setDownloadOpen((p) => !p)}
                    onBlur={() => setTimeout(() => setDownloadOpen(false), 200)}
                    className="px-3 py-2 border border-gray-200 text-text-secondary text-[12px] font-medium rounded-btn hover:border-primary hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">download</span>
                    {exporting ? 'Exporting...' : 'Download'}
                    <span className="material-symbols-outlined text-[14px]">arrow_drop_down</span>
                  </button>
                  {downloadOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] animate-fade-in">
                      <button onClick={() => { handleExportPdf('resume'); setDownloadOpen(false); }} className="w-full text-left px-4 py-2.5 text-[13px] text-text-primary hover:bg-gray-50 rounded-t-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-text-secondary">description</span>
                        Resume (1 page)
                      </button>
                      <button onClick={() => { handleExportPdf('cv'); setDownloadOpen(false); }} className="w-full text-left px-4 py-2.5 text-[13px] text-text-primary hover:bg-gray-50 rounded-b-lg flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-text-secondary">folder_open</span>
                        CV (Full detail)
                      </button>
                    </div>
                  )}
                </div>
                <button onClick={handleReanalyze} disabled={analyzing} className="px-3 py-2 border border-gray-200 text-text-secondary text-[12px] font-medium rounded-btn hover:border-primary hover:text-primary transition-colors disabled:opacity-50">
                  {analyzing ? 'Analyzing...' : 'Re-analyze'}
                </button>
                <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>

            {/* Analyzing banner with progress */}
            {analyzing && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-card border border-blue-200 mb-4">
                <span className="material-symbols-outlined text-[24px] text-blue-600 animate-spin">refresh</span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-blue-800">AI is analyzing your CV...</p>
                  <p className="text-[12px] text-blue-600">
                    {pollProgress < 30
                      ? 'This usually takes 30-120 seconds. Fields will populate automatically.'
                      : pollProgress < 80
                      ? `Still working... (${pollProgress}% elapsed) — complex CVs take longer.`
                      : `Taking longer than usual (${pollProgress}%). The AI may be processing a detailed CV.`}
                  </p>
                  <div className="w-full h-1.5 bg-blue-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                      style={{ width: `${pollProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Issue summary bar */}
            {(selectedResume.issues || []).length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-card border border-gray-200 mb-4">
                <span className="material-symbols-outlined text-[20px] text-amber-600">report_problem</span>
                <span className="text-[13px] font-medium text-text-primary">
                  {getIssueCount('urgent') > 0 && <span className="text-red-600">{getIssueCount('urgent')} urgent</span>}
                  {getIssueCount('urgent') > 0 && getIssueCount('severe') > 0 && ' · '}
                  {getIssueCount('severe') > 0 && <span className="text-amber-700">{getIssueCount('severe')} severe</span>}
                  {getIssueCount('severe') > 0 && getIssueCount('likely') > 0 && ' · '}
                  {getIssueCount('likely') > 0 && <span className="text-blue-600">{getIssueCount('likely')} likely</span>}
                  {' '}issues found
                </span>
                <button onClick={() => setActiveEditorTab('issues')} className="ml-auto text-[12px] font-semibold text-primary hover:underline">
                  View All →
                </button>
              </div>
            )}

            {/* Editor tabs */}
            <div className="flex gap-1 mb-4 border-b border-gray-200 pb-0 overflow-x-auto">
              {[
                { key: 'overview', label: 'Overview', icon: 'person' },
                { key: 'issues', label: `Issues (${(selectedResume.issues || []).length})`, icon: 'report_problem' },
                { key: 'education', label: 'Education', icon: 'school' },
                { key: 'experience', label: 'Work', icon: 'work' },
                { key: 'research', label: 'Research/Projects', icon: 'science' },
                { key: 'skills', label: 'Skills', icon: 'psychology' },
                { key: 'certifications', label: 'Certs', icon: 'verified' },
                { key: 'publications', label: 'Pubs', icon: 'article' },
                { key: 'references', label: 'Refs', icon: 'contacts' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveEditorTab(tab.key as any)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeEditorTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* OVERVIEW TAB */}
            {activeEditorTab === 'overview' && (
              <div className="space-y-4">
                {/* Personal info */}
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { key: 'full_name', label: 'Full Name', icon: 'person' },
                      { key: 'email', label: 'Email', icon: 'email' },
                      { key: 'phone', label: 'Phone', icon: 'phone' },
                      { key: 'location', label: 'Location', icon: 'location_on' },
                      { key: 'linkedin_url', label: 'LinkedIn', icon: 'link' },
                      { key: 'portfolio_url', label: 'Portfolio', icon: 'language' },
                    ].map(field => (
                      <div key={field.key}>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">{field.label}</label>
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={(editData as any)[field.key] || ''}
                            onChange={(e) => updateField(field.key, e.target.value)}
                            className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          />
                          <button
                            onClick={() => handleAIRewrite(field.key, (editData as any)[field.key] || '')}
                            disabled={rewritingField === field.key}
                            className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
                            title="AI Improve"
                          >
                            {rewritingField === field.key ? (
                              <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
                            ) : (
                              <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[16px] font-bold text-text-primary">Professional Summary</h3>
                    <button
                      onClick={() => handleAIRewrite('summary', editData.summary || '')}
                      disabled={rewritingField === 'summary'}
                      className="flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium text-primary border border-primary/30 rounded-btn hover:bg-primary-light/10 transition-colors disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[14px]">{rewritingField === 'summary' ? 'refresh' : 'auto_awesome'}</span>
                      AI Improve
                    </button>
                  </div>
                  <textarea
                    value={editData.summary || ''}
                    onChange={(e) => updateField('summary', e.target.value)}
                    rows={4}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none resize-y"
                  />
                </div>

                {/* AI Suggestions */}
                {selectedResume.ai_suggestions && (
                  <div className="bg-primary-light/20 rounded-card border border-primary-light p-4 md:p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">lightbulb</span>
                      <h3 className="text-[15px] font-bold text-text-primary">AI Suggestions</h3>
                    </div>
                    <p className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line">{selectedResume.ai_suggestions}</p>
                  </div>
                )}
              </div>
            )}

            {/* ISSUES TAB */}
            {activeEditorTab === 'issues' && (
              <div className="space-y-3">
                {(selectedResume.issues || []).length === 0 ? (
                  <div className="text-center py-12">
                    <span className="material-symbols-outlined text-[48px] text-green-500 mb-3 block">check_circle</span>
                    <p className="text-[16px] font-semibold text-text-primary">No issues found!</p>
                    <p className="text-[13px] text-text-secondary mt-1">Your resume looks good for scholarship applications.</p>
                  </div>
                ) : (
                  (selectedResume.issues || []).map((issue: ResumeIssue, idx: number) => {
                    const cfg = SEVERITY_CONFIG[issue.severity] || SEVERITY_CONFIG.likely;
                    return (
                      <div key={idx} className={`${cfg.bg} rounded-card border border-gray-200 p-4`}>
                        <div className="flex items-start gap-3">
                          <span className={`material-symbols-outlined text-[20px] ${cfg.color} mt-0.5`}>{cfg.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-[12px] font-bold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                              <span className="text-[12px] text-text-secondary">· {issue.field}</span>
                            </div>
                            <p className="text-[14px] text-text-primary font-medium">{issue.message}</p>
                            {issue.suggestion && (
                              <p className="text-[13px] text-text-secondary mt-1">💡 {issue.suggestion}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* EDUCATION TAB */}
            {activeEditorTab === 'education' && (
              <div className="space-y-3">
                {(editData.education || []).map((edu: any, idx: number) => (
                  <div key={idx} className="bg-white rounded-card border border-gray-200 p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {['institution', 'degree', 'field', 'gpa', 'start_date', 'end_date'].map(key => (
                        <div key={key}>
                          <label className="text-[12px] font-semibold text-text-secondary block mb-1">{key.replace('_', ' ')}</label>
                          <input
                            type="text"
                            value={edu[key] || ''}
                            onChange={(e) => {
                              const updated = [...(editData.education || [])];
                              updated[idx] = { ...updated[idx], [key]: e.target.value };
                              updateField('education', updated);
                            }}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <button onClick={() => updateField('education', (editData.education || []).filter((_: any, i: number) => i !== idx))} className="mt-2 text-[12px] text-red-500 font-medium hover:underline">
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateField('education', [...(editData.education || []), { institution: '', degree: '', field: '', gpa: '', start_date: '', end_date: '' }])}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-card text-[14px] font-medium text-text-secondary hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Education
                </button>
              </div>
            )}

            {/* WORK EXPERIENCE TAB */}
            {activeEditorTab === 'experience' && (
              <div className="space-y-3">
                {(editData.experience || []).map((exp: any, idx: number) => (
                  <div key={idx} className="bg-white rounded-card border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[13px] font-semibold text-primary">💼 Work Experience</span>
                      <button onClick={() => updateField('experience', (editData.experience || []).filter((_: any, i: number) => i !== idx))} className="text-[12px] text-red-500 font-medium hover:underline">
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {['company', 'position', 'location', 'start_date', 'end_date'].map(key => (
                        <div key={key}>
                          <label className="text-[12px] font-semibold text-text-secondary block mb-1">{key.replace('_', ' ')}</label>
                          <input
                            type="text"
                            value={exp[key] || ''}
                            onChange={(e) => {
                              const updated = [...(editData.experience || [])];
                              updated[idx] = { ...updated[idx], [key]: e.target.value };
                              updateField('experience', updated);
                            }}
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className="text-[12px] font-semibold text-text-secondary block mb-1">Job Description</label>
                      <div className="flex gap-1">
                        <textarea
                          value={exp.description || ''}
                          onChange={(e) => {
                            const updated = [...(editData.experience || [])];
                            updated[idx] = { ...updated[idx], description: e.target.value };
                            updateField('experience', updated);
                          }}
                          rows={3}
                          className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none resize-y"
                        />
                        <button
                          onClick={async () => {
                            setRewritingField(`exp-${idx}`);
                            try {
                              const result = await rewriteField(selectedResume.id, 'experience_description', exp.description || '');
                              const updated = [...(editData.experience || [])];
                              updated[idx] = { ...updated[idx], description: result.improved_value };
                              updateField('experience', updated);
                            } finally {
                              setRewritingField(null);
                            }
                          }}
                          disabled={rewritingField === `exp-${idx}`}
                          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 hover:border-primary hover:text-primary transition-colors self-end disabled:opacity-50"
                          title="AI Improve"
                        >
                          <span className="material-symbols-outlined text-[16px]">{rewritingField === `exp-${idx}` ? 'refresh' : 'auto_awesome'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => updateField('experience', [...(editData.experience || []), { company: '', position: '', location: '', start_date: '', end_date: '', description: '' }])}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-card text-[14px] font-medium text-text-secondary hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Work Experience
                </button>
              </div>
            )}

            {/* RESEARCH / PROJECTS TAB */}
            {activeEditorTab === 'research' && (
              <div className="space-y-3">
                {(editData.research_projects || []).map((rp: any, idx: number) => (
                  <div key={idx} className="bg-white rounded-card border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex gap-2">
                        {['research', 'project'].map(type => (
                          <button
                            key={type}
                            onClick={() => {
                              const updated = [...(editData.research_projects || [])];
                              updated[idx] = { ...updated[idx], type };
                              updateField('research_projects', updated);
                            }}
                            className={`px-3 py-1 rounded-chip text-[12px] font-semibold transition-colors ${
                              (rp.type || 'research') === type
                                ? 'bg-primary text-white'
                                : 'bg-gray-100 text-text-secondary hover:bg-gray-200'
                            }`}
                          >
                            {type === 'research' ? '🔬 Research' : '🚀 Project'}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => updateField('research_projects', (editData.research_projects || []).filter((_: any, i: number) => i !== idx))} className="text-[12px] text-red-500 font-medium hover:underline">
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">Title</label>
                        <input type="text" value={rp.title || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], title: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder={rp.type === 'project' ? 'Project title' : 'Research title'} />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">{rp.type === 'project' ? 'Organization / Sponsor' : 'Institution / Lab'}</label>
                        <input type="text" value={rp.organization || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], organization: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder={rp.type === 'project' ? 'e.g. Google, UNDP' : 'e.g. MIT CSAIL, Personal'} />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">Role</label>
                        <input type="text" value={rp.role || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], role: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. Lead Researcher, Developer" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">Location</label>
                        <input type="text" value={rp.location || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], location: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">Start Date</label>
                        <input type="text" value={rp.start_date || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], start_date: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. Jan 2024" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-text-secondary block mb-1">End Date</label>
                        <input type="text" value={rp.end_date || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], end_date: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. Present" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-[12px] font-semibold text-text-secondary block mb-1">Technologies / Methods</label>
                      <input type="text" value={rp.technologies || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], technologies: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. Python, NLP, Qualitative Analysis, FEA" />
                    </div>
                    <div className="mt-3">
                      <label className="text-[12px] font-semibold text-text-secondary block mb-1">{rp.type === 'project' ? 'Project Description' : 'Research Description'}</label>
                      <div className="flex gap-1">
                        <textarea
                          value={rp.description || ''}
                          onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], description: e.target.value }; updateField('research_projects', u); }}
                          rows={3}
                          className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none resize-y"
                        />
                        <button
                          onClick={async () => {
                            setRewritingField(`rp-${idx}`);
                            try {
                              const result = await rewriteField(selectedResume.id, 'research_description', rp.description || '');
                              const u = [...(editData.research_projects || [])];
                              u[idx] = { ...u[idx], description: result.improved_value };
                              updateField('research_projects', u);
                            } finally { setRewritingField(null); }
                          }}
                          disabled={rewritingField === `rp-${idx}`}
                          className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-lg border border-gray-200 hover:border-primary hover:text-primary transition-colors self-end disabled:opacity-50"
                          title="AI Improve"
                        >
                          <span className="material-symbols-outlined text-[16px]">{rewritingField === `rp-${idx}` ? 'refresh' : 'auto_awesome'}</span>
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="text-[12px] font-semibold text-text-secondary block mb-1">Key Outcomes / Results</label>
                      <input type="text" value={rp.outcomes || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], outcomes: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. Published in IEEE, 95% accuracy, Patent filed" />
                    </div>
                    <div className="mt-3">
                      <label className="text-[12px] font-semibold text-text-secondary block mb-1">URL / Link</label>
                      <input type="text" value={rp.url || ''} onChange={(e) => { const u = [...(editData.research_projects || [])]; u[idx] = { ...u[idx], url: e.target.value }; updateField('research_projects', u); }} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none" placeholder="e.g. https://github.com/... or DOI link" />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => updateField('research_projects', [...(editData.research_projects || []), { type: 'research', title: '', organization: '', role: '', location: '', start_date: '', end_date: '', technologies: '', description: '', outcomes: '', url: '' }])}
                  className="w-full py-3 border-2 border-dashed border-gray-300 rounded-card text-[14px] font-medium text-text-secondary hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Research / Project
                </button>
              </div>
            )}

            {/* SKILLS TAB */}
            {activeEditorTab === 'skills' && (
              <div className="space-y-4">
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Skills</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {(editData.skills || []).map((skill: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary-light/30 rounded-chip text-[13px] font-medium text-text-primary">
                        {skill}
                        <button onClick={() => updateField('skills', (editData.skills || []).filter((_: string, i: number) => i !== idx))} className="text-text-secondary hover:text-red-500 ml-1">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a skill and press Enter"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          updateField('skills', [...(editData.skills || []), e.currentTarget.value.trim()]);
                          e.currentTarget.value = '';
                        }
                      }}
                      className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                    />
                  </div>
                </div>

                {/* Languages */}
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Languages</h3>
                  {(editData.languages || []).map((lang: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 mb-2">
                      <input
                        type="text"
                        value={lang.language || lang}
                        onChange={(e) => {
                          const updated = [...(editData.languages || [])];
                          updated[idx] = typeof updated[idx] === 'string' ? e.target.value : { ...updated[idx], language: e.target.value };
                          updateField('languages', updated);
                        }}
                        className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                        placeholder="Language"
                      />
                      <input
                        type="text"
                        value={lang.proficiency || ''}
                        onChange={(e) => {
                          const updated = [...(editData.languages || [])];
                          updated[idx] = { ...updated[idx], proficiency: e.target.value };
                          updateField('languages', updated);
                        }}
                        className="w-32 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                        placeholder="Level"
                      />
                      <button onClick={() => updateField('languages', (editData.languages || []).filter((_: any, i: number) => i !== idx))} className="text-red-500">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => updateField('languages', [...(editData.languages || []), { language: '', proficiency: '' }])}
                    className="text-[13px] font-medium text-primary hover:underline mt-1"
                  >
                    + Add Language
                  </button>
                </div>
              </div>
            )}

            {/* CERTIFICATIONS TAB */}
            {activeEditorTab === 'certifications' && (
              <div className="space-y-4">
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Certifications</h3>
                  {(editData.certifications || []).map((cert: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <input
                        type="text"
                        value={cert.name || ''}
                        onChange={(e) => {
                          const updated = [...(editData.certifications || [])];
                          updated[idx] = { ...updated[idx], name: e.target.value };
                          updateField('certifications', updated);
                        }}
                        className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                        placeholder="Certification name"
                      />
                      <input
                        type="text"
                        value={cert.issuer || ''}
                        onChange={(e) => {
                          const updated = [...(editData.certifications || [])];
                          updated[idx] = { ...updated[idx], issuer: e.target.value };
                          updateField('certifications', updated);
                        }}
                        className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                        placeholder="Issuer"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cert.date || ''}
                          onChange={(e) => {
                            const updated = [...(editData.certifications || [])];
                            updated[idx] = { ...updated[idx], date: e.target.value };
                            updateField('certifications', updated);
                          }}
                          className="flex-1 p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Date"
                        />
                        <button onClick={() => updateField('certifications', (editData.certifications || []).filter((_: any, i: number) => i !== idx))} className="text-red-500">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => updateField('certifications', [...(editData.certifications || []), { name: '', issuer: '', date: '' }])}
                    className="text-[13px] font-medium text-primary hover:underline mt-1"
                  >
                    + Add Certification
                  </button>
                </div>
              </div>
            )}

            {/* PUBLICATIONS TAB */}
            {activeEditorTab === 'publications' && (
              <div className="space-y-4">
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">Publications</h3>
                  {(editData.publications || []).map((pub: any, idx: number) => (
                    <div key={idx} className="p-3 mb-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={pub.title || ''}
                          onChange={(e) => {
                            const updated = [...(editData.publications || [])];
                            updated[idx] = { ...updated[idx], title: e.target.value };
                            updateField('publications', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Paper title"
                        />
                        <input
                          type="text"
                          value={pub.journal || ''}
                          onChange={(e) => {
                            const updated = [...(editData.publications || [])];
                            updated[idx] = { ...updated[idx], journal: e.target.value };
                            updateField('publications', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Journal / Conference"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={pub.date || ''}
                          onChange={(e) => {
                            const updated = [...(editData.publications || [])];
                            updated[idx] = { ...updated[idx], date: e.target.value };
                            updateField('publications', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Date"
                        />
                        <input
                          type="text"
                          value={pub.doi || ''}
                          onChange={(e) => {
                            const updated = [...(editData.publications || [])];
                            updated[idx] = { ...updated[idx], doi: e.target.value };
                            updateField('publications', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="DOI (optional)"
                        />
                        <button onClick={() => updateField('publications', (editData.publications || []).filter((_: any, i: number) => i !== idx))} className="text-red-500 self-center">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => updateField('publications', [...(editData.publications || []), { title: '', journal: '', date: '', doi: '' }])}
                    className="text-[13px] font-medium text-primary hover:underline mt-1"
                  >
                    + Add Publication
                  </button>
                </div>
              </div>
            )}

            {activeEditorTab === 'references' && (
              <div className="space-y-4">
                <div className="bg-white rounded-card border border-gray-200 p-4 md:p-5">
                  <h3 className="text-[16px] font-bold text-text-primary mb-3">References</h3>
                  {(editData.ref_list || []).length === 0 && (
                    <p className="text-[13px] text-text-secondary mb-3">No references added yet. Add professional references below.</p>
                  )}
                  {(editData.ref_list || []).map((ref: any, idx: number) => (
                    <div key={idx} className="p-3 mb-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={ref.name || ''}
                          onChange={(e) => {
                            const updated = [...(editData.ref_list || [])];
                            updated[idx] = { ...updated[idx], name: e.target.value };
                            updateField('ref_list', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Full name"
                        />
                        <input
                          type="text"
                          value={ref.position || ''}
                          onChange={(e) => {
                            const updated = [...(editData.ref_list || [])];
                            updated[idx] = { ...updated[idx], position: e.target.value };
                            updateField('ref_list', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Position / Title"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={ref.contact || ''}
                          onChange={(e) => {
                            const updated = [...(editData.ref_list || [])];
                            updated[idx] = { ...updated[idx], contact: e.target.value };
                            updateField('ref_list', updated);
                          }}
                          className="p-2.5 bg-white border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none"
                          placeholder="Email or phone"
                        />
                        <button onClick={() => updateField('ref_list', (editData.ref_list || []).filter((_: any, i: number) => i !== idx))} className="text-red-500 self-center">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => updateField('ref_list', [...(editData.ref_list || []), { name: '', position: '', contact: '' }])}
                    className="text-[13px] font-medium text-primary hover:underline mt-1"
                  >
                    + Add Reference
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
