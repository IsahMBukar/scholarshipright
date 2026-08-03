'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { ResumeListSkeleton } from '@/components/Skeletons';
import OnboardingProgress from '@/components/OnboardingProgress';
import AddResumeModal from '@/components/resume-builder/AddResumeModal';
import ResumeFormWizard from '@/components/resume-builder/ResumeFormWizard';
import ResumeBuilderModal from '@/components/resume-builder/ResumeBuilderModal';
import { fetchResumes, deleteResume, setPrimaryResume, createNewResume } from '@/services/api';
import type { Resume, ResumeIssue } from '@/services/api';

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
        <AppLayout>
          <PageHeader title="RESUME" />
          <ResumeListSkeleton />
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
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFormWizard, setShowFormWizard] = useState(false);

  // `?onboarding=1` puts a "Return to onboarding" banner at the top of
  // the page so the user doesn't get lost after leaving the hub.
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromOnboarding = searchParams.get('onboarding') === '1';
  const editId = searchParams.get('edit');

  // Open the resume builder as a modal for the given resume.
  function openBuilder(resume: Resume) {
    setSelectedResume(resume);
    setView('builder');
    const params = new URLSearchParams(searchParams.toString());
    params.set('edit', resume.id);
    router.replace(`/resume?${params.toString()}`, { scroll: false });
  }

  // Manual path: create a FRESH resume (prefilled from the user's primary),
  // then open the section-by-section form.
  async function startManualFlow() {
    setShowAddModal(false);
    try {
      const stub = await createNewResume(true);
      setSelectedResume(stub);
      setResumes((prev) => (prev.some((r) => r.id === stub.id) ? prev : [stub, ...prev]));
      setShowFormWizard(true);
    } catch (err) {
      console.error('Failed to start manual resume:', err);
    }
  }

  // Upload path: AI finished parsing; put it in the list and open the builder.
  function handleUploadComplete(resume: Resume) {
    setShowAddModal(false);
    setResumes((prev) => (prev.some((r) => r.id === resume.id) ? prev.map((r) => (r.id === resume.id ? resume : r)) : [resume, ...prev]));
    openBuilder(resume);
  }

  useEffect(() => {
    loadResumes();
  }, []);

  async function loadResumes() {
    try {
      const data = await fetchResumes();
      setResumes(data);
      if (data.length === 0) {
        setShowAddModal(true);
      } else if (editId) {
        const match = data.find((r: Resume) => r.id === editId);
        if (match) openBuilder(match);
      }
    } catch (err) {
      console.error('Failed to load resumes:', err);
    } finally {
      setLoading(false);
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
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  // ---- RENDER ----
  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="RESUME" />
        <div className="p-4 md:p-6">
          <ResumeListSkeleton count={3} />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader title="RESUME" />
      <OnboardingProgress />
      <div className="px-4 md:px-6 py-6 max-w-[900px]">

        {/* Onboarding breadcrumb banner (only when arriving from the hub) */}
        {fromOnboarding && (
          <div className="mb-5 flex items-center gap-3 p-3 rounded-xl border border-primary/20 bg-primary/5">
            <span className="material-symbols-outlined text-primary text-[18px]">arrow_back</span>
            <p className="text-[12px] text-text-secondary flex-1">
              You&apos;re in onboarding. Upload your resume here, then return to the hub to finish setup.
            </p>
            <Link
              href="/onboarding"
              className="text-[12px] font-bold text-primary hover:underline whitespace-nowrap"
            >
              Return to hub â†’
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
                onClick={() => setShowAddModal(true)}
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
                        {resume.full_name || 'No name'} Â· {resume.target_degree?.toUpperCase() || 'Any degree'} Â· {resume.target_fields?.join(', ') || 'General'}
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
                      <button onClick={() => openBuilder(resume)} className="flex-1 sm:flex-none px-3 py-1.5 bg-gray-100 text-text-primary text-[12px] font-medium rounded-btn hover:bg-gray-200 transition-colors text-center sm:text-left">
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

        {/* ===== BUILDER MODAL ===== */}
        {view === 'builder' && selectedResume && (
          <ResumeBuilderModal
            resume={selectedResume}
            onResumeUpdate={(updated) => {
              setSelectedResume(updated);
              setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
            }}
            onClose={() => {
              setView('list');
              setSelectedResume(null);
              const params = new URLSearchParams(searchParams.toString());
              params.delete('edit');
              params.delete('builder');
              router.replace(`/resume?${params.toString()}`, { scroll: false });
            }}
          />
        )}

        {/* ===== ADD RESUME MODAL ===== */}
        {showAddModal && (
          <AddResumeModal
            onClose={() => setShowAddModal(false)}
            onUploadComplete={handleUploadComplete}
            onManualStart={startManualFlow}
          />
        )}

        {/* ===== MANUAL FORM WIZARD ===== */}
        {showFormWizard && selectedResume && (
          <ResumeFormWizard
            resume={selectedResume}
            onResumeUpdate={(updated) => {
              setSelectedResume(updated);
              setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
            }}
            onFinish={(updated) => {
              setShowFormWizard(false);
              setSelectedResume(updated);
              setResumes(prev => prev.map(r => r.id === updated.id ? updated : r));
              openBuilder(updated);
            }}
            onClose={() => setShowFormWizard(false)}
          />
        )}
      </div>
    </AppLayout>
  );
}
