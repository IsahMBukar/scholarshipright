'use client';

import { useState } from 'react';
import { aiGenerateSection, type Resume } from '@/services/api';

interface Question {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'tags';
  hint?: string;
  options?: string[];
  required?: boolean;
}

interface Props {
  section: string;
  questions: Question[];
  meta?: { icon: string; label: string; description: string };
  resumeId: string;
  resumeData: Partial<Resume>;
  existingData: any[];
  onComplete: (generated: any) => void;
  onBack: () => void;
  onNext: () => void;
  isFirst: boolean;
  isLast: boolean;
  generating: boolean;
}

export default function SectionStep({
  section,
  questions,
  meta,
  resumeId,
  resumeData,
  existingData,
  onComplete,
  onBack,
  onNext,
  isFirst,
  isLast,
  generating: parentGenerating,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [generated, setGenerated] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedJson, setEditedJson] = useState('');

  const updateAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const hasRequiredAnswers = () => {
    return questions
      .filter(q => q.required)
      .every(q => answers[q.key]?.trim());
  };

  const handleGenerate = async () => {
    if (!hasRequiredAnswers()) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await aiGenerateSection(resumeId, section, answers);
      setGenerated(result.generated);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'AI generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = () => {
    onComplete(generated);
    // Reset for next entry (if user wants to add more)
    setGenerated(null);
    setAnswers({});
    setEditMode(false);
  };

  const handleEdit = () => {
    setEditedJson(JSON.stringify(generated, null, 2));
    setEditMode(true);
  };

  const handleSaveEdit = () => {
    try {
      setGenerated(JSON.parse(editedJson));
      setEditMode(false);
    } catch {
      setError('Invalid JSON. Please fix the format.');
    }
  };

  const handleRegenerate = () => {
    setGenerated(null);
    setEditMode(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <span className="material-symbols-outlined text-primary text-[22px]">
            {meta?.icon || 'edit'}
          </span>
        </div>
        <div>
          <h3 className="text-[18px] font-bold text-text-primary">
            {meta?.label || section}
          </h3>
          <p className="text-[13px] text-text-secondary">
            {meta?.description || `Fill in your ${section} details`}
          </p>
        </div>
      </div>

      {/* Existing entries */}
      {existingData.length > 0 && (
        <div className="mb-5 p-3 bg-green-50 rounded-xl border border-green-200">
          <p className="text-[12px] font-semibold text-green-700 mb-1">
            ✓ {existingData.length} {section} {existingData.length === 1 ? 'entry' : 'entries'} already saved
          </p>
          <p className="text-[11px] text-green-600">
            You can add another, or skip to the next section.
          </p>
        </div>
      )}

      {/* Questions form or Generated result */}
      {!generated ? (
        <>
          {/* Questions */}
          <div className="space-y-4 mb-6">
            {questions.map((q) => (
              <div key={q.key}>
                <label className="text-[13px] font-semibold text-text-primary block mb-1.5">
                  {q.label}
                  {q.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>

                {q.type === 'text' || q.type === 'date' ? (
                  <input
                    type="text"
                    value={answers[q.key] || ''}
                    onChange={(e) => updateAnswer(q.key, e.target.value)}
                    placeholder={q.hint}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                ) : q.type === 'textarea' ? (
                  <textarea
                    value={answers[q.key] || ''}
                    onChange={(e) => updateAnswer(q.key, e.target.value)}
                    placeholder={q.hint}
                    rows={3}
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-[14px] text-text-primary focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y transition-all"
                  />
                ) : q.type === 'select' ? (
                  <div className="flex flex-wrap gap-2">
                    {q.options?.map(opt => (
                      <button
                        key={opt}
                        onClick={() => updateAnswer(q.key, answers[q.key] === opt ? '' : opt)}
                        className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all ${
                          answers[q.key] === opt
                            ? 'bg-primary text-white shadow-sm'
                            : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                ) : null}

                {q.hint && q.type !== 'text' && q.type !== 'textarea' && (
                  <p className="text-[11px] text-text-secondary mt-1">{q.hint}</p>
                )}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!hasRequiredAnswers() || generating || parentGenerating}
            className="w-full py-3.5 bg-primary text-white text-[15px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                AI is writing...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
                Generate with AI
              </>
            )}
          </button>

          <p className="text-[11px] text-text-secondary text-center mt-2">
            AI will write a polished version based on your answers
          </p>
        </>
      ) : (
        <>
          {/* Generated result preview */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[14px] font-bold text-text-primary">AI Generated Content</h4>
              <div className="flex gap-2">
                <button
                  onClick={handleRegenerate}
                  className="px-3 py-1.5 text-[12px] font-medium text-text-secondary border border-gray-200 rounded-btn hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">refresh</span>
                  Redo
                </button>
                <button
                  onClick={handleEdit}
                  className="px-3 py-1.5 text-[12px] font-medium text-text-secondary border border-gray-200 rounded-btn hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[14px] align-middle mr-1">edit</span>
                  Edit
                </button>
              </div>
            </div>

            {editMode ? (
              <div>
                <textarea
                  value={editedJson}
                  onChange={(e) => setEditedJson(e.target.value)}
                  rows={12}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-[13px] font-mono text-text-primary focus:ring-2 focus:ring-primary outline-none resize-y"
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleSaveEdit}
                    className="px-4 py-2 bg-primary text-white text-[13px] font-semibold rounded-btn hover:brightness-110 transition-all"
                  >
                    Apply Changes
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 border border-gray-200 text-text-secondary text-[13px] font-medium rounded-btn hover:border-primary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <GeneratedPreview data={generated} section={section} />
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
              <p className="text-[13px] text-red-700">{error}</p>
            </div>
          )}

          {/* Save button */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={generating || parentGenerating}
              className="flex-1 py-3.5 bg-primary text-white text-[15px] font-bold rounded-xl hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[20px]">check_circle</span>
              Save & Continue
            </button>
            <button
              onClick={onNext}
              className="px-4 py-3.5 border border-gray-200 text-text-secondary text-[13px] font-medium rounded-xl hover:border-primary hover:text-primary transition-colors"
            >
              Skip
            </button>
          </div>
        </>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <button
          onClick={onBack}
          disabled={isFirst}
          className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-primary transition-colors disabled:opacity-30"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back
        </button>
        <button
          onClick={onNext}
          className="flex items-center gap-1 text-[13px] text-text-secondary hover:text-primary transition-colors"
        >
          Skip to next
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}

// ── Inline preview of generated content ──────────────────────────────────

function GeneratedPreview({ data, section }: { data: any; section: string }) {
  if (Array.isArray(data)) {
    return (
      <div className="space-y-2">
        {data.map((item, i) => (
          <span
            key={i}
            className="inline-block px-2.5 py-1 bg-primary/10 text-primary text-[13px] font-medium rounded-lg mr-1.5 mb-1.5"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="space-y-2.5">
        {Object.entries(data).map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return null;
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return (
            <div key={key}>
              <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wide">
                {label}
              </span>
              {Array.isArray(value) ? (
                <ul className="mt-0.5 space-y-1">
                  {value.map((item, i) => (
                    <li key={i} className="text-[13px] text-text-primary flex items-start gap-1.5">
                      <span className="text-primary mt-1">•</span>
                      <span>{typeof item === 'string' ? item : JSON.stringify(item)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[14px] text-text-primary mt-0.5 leading-relaxed">
                  {String(value)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <p className="text-[14px] text-text-primary leading-relaxed">{String(data)}</p>
  );
}
