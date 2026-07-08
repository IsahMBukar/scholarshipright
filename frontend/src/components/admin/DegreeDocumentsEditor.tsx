'use client';

/**
 * Per-degree-level required documents editor.
 *
 * When a scholarship targets multiple degree levels (Bachelor + Master + PhD),
 * each level can have different required documents. This component shows tabs
 * per degree level and lets the admin configure documents for each.
 *
 * Usage:
 *   <DegreeDocumentsEditor
 *     degreeLevels={scholarship.degree_levels}
 *     scholarshipId={scholarship.id}
 *     initialDocs={scholarship.degree_documents}
 *     onChange={setDegreeDocs}
 *   />
 */

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { FieldLabel, CheckboxRow } from './FormPrimitives';
import {
  PREVIOUS_DEGREE_OPTIONS,
  STANDARDIZED_TEST_OPTIONS,
  RECOMMENDATION_COUNT_OPTIONS,
} from './scholarshipForm';

// ── Types ─────────────────────────────────────────────────────────

export interface DegreeDoc {
  id?: string;
  degree_level: string;
  req_transcripts: boolean;
  req_cv_resume: boolean;
  req_sop_motivation_letter: boolean;
  req_recommendation_letters: boolean;
  req_english_test: boolean;
  req_passport_or_id: boolean;
  req_financial_proof: boolean;
  req_photo: boolean;
  previous_degree_required: string;
  recommendation_letters_count: number | string;
  research_proposal_required: boolean | string;
  writing_sample_required: boolean;
  standardized_test: string;
  additional_required_documents: string;
}

interface Props {
  degreeLevels: string[];
  scholarshipId?: string; // If set, saves via API
  initialDocs?: DegreeDoc[] | null;
  onChange?: (docs: DegreeDoc[]) => void; // For create flow (no ID yet)
}

// ── Defaults per level ────────────────────────────────────────────

function defaultsForLevel(level: string): DegreeDoc {
  const l = level.toLowerCase();
  const is = (s: string) => l.includes(s);

  let prev = 'high_school_diploma';
  let recCount = 2;
  let research = false;
  let writing = false;
  let test = 'sat_act';

  if (is('direct') && is('phd')) {
    // Direct-entry PhD (BSc → PhD, skipping master's)
    prev = 'bachelor_degree';
    recCount = 3;
    research = true;
    test = 'gre';
  } else if (is('postdoc') || is('post-doc') || is('post_doc')) {
    // Postdoctoral — requires PhD, no standardized test
    prev = 'phd_degree';
    recCount = 3;
    research = true;
    writing = true;
    test = 'none';
  } else if (is('phd') || is('doctoral') || is('doctorate')) {
    prev = 'master_degree';
    recCount = 3;
    research = true;
    test = 'gre';
  } else if (is('master') || is('msc') || is('mba')) {
    prev = 'bachelor_degree';
    recCount = 2;
    research = false;
    test = 'gre_gmat';
  }

  return {
    degree_level: level,
    req_transcripts: true,
    req_cv_resume: true,
    req_sop_motivation_letter: true,
    req_recommendation_letters: true,
    req_english_test: true,
    req_passport_or_id: true,
    req_financial_proof: false,
    req_photo: false,
    previous_degree_required: prev,
    recommendation_letters_count: recCount,
    research_proposal_required: research,
    writing_sample_required: writing,
    standardized_test: test,
    additional_required_documents: '',
  };
}

// ── Component ─────────────────────────────────────────────────────

export default function DegreeDocumentsEditor({
  degreeLevels,
  scholarshipId,
  initialDocs,
  onChange,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // Build initial state: merge initialDocs with defaults for each level
  const [docs, setDocs] = useState<DegreeDoc[]>(() => {
    return degreeLevels.map((level) => {
      const existing = initialDocs?.find(
        (d) => d.degree_level.toLowerCase() === level.toLowerCase()
      );
      if (existing) return existing;
      return defaultsForLevel(level);
    });
  });

  // Notify parent of changes
  useEffect(() => {
    onChange?.(docs);
  }, [docs, onChange]);

  const updateDoc = useCallback(
    (index: number, field: keyof DegreeDoc, value: unknown) => {
      setDocs((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  const handleSave = async () => {
    if (!scholarshipId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // For each level doc, create or update via API
      for (const doc of docs) {
        const body = { ...doc };
        // Clean up auto values
        if (body.research_proposal_required === 'auto')
          body.research_proposal_required = null as any;

        if (doc.id) {
          // Update existing
          const res = await fetch(
            `/api/admin/scholarships/${scholarshipId}/degree-docs/${doc.id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(body),
            }
          );
          if (!res.ok) throw new Error(`Failed to update ${doc.degree_level}`);
        } else {
          // Create new
          const res = await fetch(
            `/api/admin/scholarships/${scholarshipId}/degree-docs`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(body),
            }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (err?.detail?.code === 'degree_level_exists') {
              // Already exists — try PATCH with the doc data
              continue;
            }
            throw new Error(`Failed to create ${doc.degree_level}`);
          }
          // Store the returned ID for future updates
          const created = await res.json();
          doc.id = created.id;
        }
      }
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err: any) {
      setSaveMsg(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (degreeLevels.length <= 1) return null;

  const current = docs[activeTab];

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mt-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <span className="text-sm font-semibold text-amber-900">
            Per-Level Document Overrides
          </span>
          <p className="text-[11px] text-amber-700 mt-0.5">
            Configure different required documents for each degree level (
            {degreeLevels.join(', ')})
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-amber-700" />
        ) : (
          <ChevronDown className="w-4 h-4 text-amber-700" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Tabs */}
          <div className="flex gap-1 border-b border-amber-200 pb-1">
            {degreeLevels.map((level, i) => (
              <button
                key={level}
                type="button"
                onClick={() => setActiveTab(i)}
                className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                  activeTab === i
                    ? 'bg-white text-amber-900 border border-amber-200 border-b-white -mb-[1px]'
                    : 'text-amber-700 hover:bg-amber-100'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          {current && (
            <div className="space-y-3 bg-white rounded-lg p-3 border border-amber-100">
              {/* 8 standard booleans */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <CheckboxRow
                  label="Transcripts"
                  checked={current.req_transcripts}
                  onChange={(v) => updateDoc(activeTab, 'req_transcripts', v)}
                />
                <CheckboxRow
                  label="CV / Resume"
                  checked={current.req_cv_resume}
                  onChange={(v) => updateDoc(activeTab, 'req_cv_resume', v)}
                />
                <CheckboxRow
                  label="Statement of Purpose"
                  checked={current.req_sop_motivation_letter}
                  onChange={(v) =>
                    updateDoc(activeTab, 'req_sop_motivation_letter', v)
                  }
                />
                <CheckboxRow
                  label="Recommendation letters"
                  checked={current.req_recommendation_letters}
                  onChange={(v) =>
                    updateDoc(activeTab, 'req_recommendation_letters', v)
                  }
                />
                <CheckboxRow
                  label="English test"
                  checked={current.req_english_test}
                  onChange={(v) =>
                    updateDoc(activeTab, 'req_english_test', v)
                  }
                />
                <CheckboxRow
                  label="Passport or ID"
                  checked={current.req_passport_or_id}
                  onChange={(v) =>
                    updateDoc(activeTab, 'req_passport_or_id', v)
                  }
                />
                <CheckboxRow
                  label="Financial proof"
                  checked={current.req_financial_proof}
                  onChange={(v) =>
                    updateDoc(activeTab, 'req_financial_proof', v)
                  }
                />
                <CheckboxRow
                  label="Photo"
                  checked={current.req_photo}
                  onChange={(v) => updateDoc(activeTab, 'req_photo', v)}
                />
              </div>

              {/* Cement + flexible */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <FieldLabel>Previous degree required</FieldLabel>
                  <select
                    value={current.previous_degree_required}
                    onChange={(e) =>
                      updateDoc(
                        activeTab,
                        'previous_degree_required',
                        e.target.value
                      )
                    }
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {PREVIOUS_DEGREE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Rec. letters count</FieldLabel>
                  <select
                    value={String(current.recommendation_letters_count)}
                    onChange={(e) =>
                      updateDoc(
                        activeTab,
                        'recommendation_letters_count',
                        Number(e.target.value)
                      )
                    }
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Research proposal</FieldLabel>
                  <select
                    value={String(current.research_proposal_required)}
                    onChange={(e) =>
                      updateDoc(
                        activeTab,
                        'research_proposal_required',
                        e.target.value === 'true'
                      )
                    }
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="false">Not required</option>
                    <option value="true">Required</option>
                  </select>
                </div>
                <div>
                  <FieldLabel>Writing sample</FieldLabel>
                  <select
                    value={String(current.writing_sample_required)}
                    onChange={(e) =>
                      updateDoc(
                        activeTab,
                        'writing_sample_required',
                        e.target.value === 'true'
                      )
                    }
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="false">Not required</option>
                    <option value="true">Required</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <FieldLabel>Standardized test</FieldLabel>
                  <select
                    value={current.standardized_test}
                    onChange={(e) =>
                      updateDoc(
                        activeTab,
                        'standardized_test',
                        e.target.value
                      )
                    }
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {STANDARDIZED_TEST_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Additional docs */}
              <div className="pt-2 border-t border-gray-100">
                <FieldLabel>Additional documents (free text)</FieldLabel>
                <textarea
                  value={current.additional_required_documents}
                  onChange={(e) =>
                    updateDoc(
                      activeTab,
                      'additional_required_documents',
                      e.target.value
                    )
                  }
                  rows={2}
                  className="w-full text-sm bg-white border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="e.g. portfolio, video essay"
                />
              </div>
            </div>
          )}

          {/* Save button (only when scholarshipId exists — edit mode) */}
          {scholarshipId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Level Documents'}
              </button>
              {saveMsg && (
                <span
                  className={`text-xs ${
                    saveMsg.includes('fail') || saveMsg.includes('Failed')
                      ? 'text-red-600'
                      : 'text-green-600'
                  }`}
                >
                  {saveMsg}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
