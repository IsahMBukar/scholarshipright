'use client';

import { useState } from 'react';
import { aiGenerateSummary, type Resume } from '@/services/api';

interface Props {
  resume: Resume;
  onSave: (summary: string) => void;
  generating: boolean;
  onNext: () => void;
}

export default function SummaryStep({ resume, onSave, generating, onNext }: Props) {
  const [summary, setSummary] = useState(resume.summary || '');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(!!resume.summary);

  const handleGenerate = async () => {
    setGeneratingSummary(true);
    setError(null);
    try {
      const result = await aiGenerateSummary(resume.id);
      setSummary(result.summary);
      setHasGenerated(true);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to generate summary. Please try again.');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSave = () => {
    onSave(summary);
  };

  const hasData =
    (resume.education?.length || 0) > 0 ||
    (resume.experience?.length || 0) > 0 ||
    (resume.skills?.length || 0) > 0;

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[22px]">auto_awesome</span>
        </div>
        <div>
          <h3 className="text-[18px] font-bold text-text-primary">Professional Summary</h3>
          <p className="text-[13px] text-text-secondary">
            A brief overview of who you are and what you bring
          </p>
        </div>
      </div>

      {/* Tip */}
      <div className="mb-5 p-3 bg-blue-50 rounded-xl border border-blue-200">
        <p className="text-[12px] text-blue-700">
          💡 <strong>Tip:</strong> The summary is often the first thing reviewers read. 
          {hasData
            ? ' We\'ll generate one based on your existing resume data. You can also fill in other sections first, then come back to generate a better summary.'
            : ' Fill in your education, work, and skills first — then come back here to generate a compelling summary.'}
        </p>
      </div>

      {/* Summary textarea */}
      <div className="mb-5">
        <label className="text-[13px] font-semibold text-text-primary block mb-1.5">
          Your Summary
        </label>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Write or generate a professional summary. This should be 2-3 sentences highlighting your background, skills, and goals..."
          rows={5}
          className="w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y transition-all"
        />
        <p className="text-[11px] text-text-secondary mt-1">
          {summary.length} characters · Aim for 150-300 words
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
          <p className="text-[13px] text-red-700">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 mb-4">
        <button
          onClick={handleGenerate}
          disabled={generatingSummary || generating}
          className="flex-1 py-3 border-2 border-primary text-primary text-[14px] font-bold rounded-xl hover:bg-primary/5 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generatingSummary ? (
            <>
              <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
              Generating...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
              {hasGenerated ? 'Regenerate with AI' : 'Generate with AI'}
            </>
          )}
        </button>

        {(summary || hasGenerated) && (
          <button
            onClick={handleSave}
            disabled={generating || generatingSummary || !summary.trim()}
            className="flex-1 py-3 bg-primary text-white text-[14px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">check_circle</span>
            Save Summary
          </button>
        )}
      </div>

      {/* Skip / Continue */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <span className="text-[12px] text-text-secondary">
          You can always come back to edit this later
        </span>
        <button
          onClick={onNext}
          className="flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          Start building sections
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
