'use client';

/**
 * Unified documents editor — single source of truth for all document
 * requirements on a scholarship.
 *
 * Replaces the old DegreeDocumentsEditor + CustomDocumentsEditor split.
 * Shows one clean "Required Documents" section:
 *   - 1 degree level  → direct config, no tabs
 *   - 2+ degree levels → tabs per level
 * Each view has the 8 standard toggles, cement/flexible fields, and
 * inline custom document management.
 */

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Info, AlertTriangle } from 'lucide-react';
import { FieldLabel, CheckboxRow } from './FormPrimitives';
import {
  PREVIOUS_DEGREE_OPTIONS,
  STANDARDIZED_TEST_OPTIONS,
} from './scholarshipForm';

// ── Types ─────────────────────────────────────────────────────────

export interface UnifiedDegreeDoc {
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
  recommendation_letters_count: number;
  research_proposal_required: boolean;
  writing_sample_required: boolean;
  standardized_test: string;
  custom_documents: UnifiedCustomDoc[];
}

export interface UnifiedCustomDoc {
  id?: string;
  name: string;
  description: string;
  required: boolean;
  degree_level: string | null;
  position: number;
}

export interface UnifiedDocumentsValue {
  degree_documents: Omit<UnifiedDegreeDoc, 'custom_documents'>[];
  custom_documents: UnifiedCustomDoc[];
}

interface Props {
  degreeLevels: string[];
  scholarshipId?: string;
  initialDegreeDocs?: Array<Record<string, unknown>> | null;
  initialCustomDocs?: Array<Record<string, unknown>> | null;
  onChange?: (value: UnifiedDocumentsValue) => void;
}

// ── Defaults per level ────────────────────────────────────────────

// Returns true for degree levels that have well-known document defaults
// (bachelor, master, phd, direct_phd, postdoc). Levels without smart-fill
// (certificate, diploma, associate, other) get a blank slate so the admin
// picks from scratch.
function hasSmartFill(level: string): boolean {
  const l = level.toLowerCase();
  if (l.includes('direct') && l.includes('phd')) return true;
  if (l.includes('postdoc') || l.includes('post-doc') || l.includes('post_doc')) return true;
  if (l.includes('phd') || l.includes('doctoral') || l.includes('doctorate')) return true;
  if (l.includes('master') || l.includes('msc') || l.includes('mba') || l.includes('meng') || l.includes('mfa') || l.includes('mphil')) return true;
  if (l.includes('bachelor') || l.includes('undergrad') || l.includes('bsc') || l.includes('b.sc')) return true;
  return false;
}

function defaultsForLevel(level: string): Omit<UnifiedDegreeDoc, 'custom_documents'> {
  const l = level.toLowerCase();
  const is = (s: string) => l.includes(s);

  // Non-smart-fill levels: blank slate — admin picks everything from scratch.
  if (!hasSmartFill(level)) {
    return {
      degree_level: level,
      req_transcripts: false,
      req_cv_resume: false,
      req_sop_motivation_letter: false,
      req_recommendation_letters: false,
      req_english_test: false,
      req_passport_or_id: false,
      req_financial_proof: false,
      req_photo: false,
      previous_degree_required: 'none',
      recommendation_letters_count: 0,
      research_proposal_required: false,
      writing_sample_required: false,
      standardized_test: 'none',
    };
  }

  // Smart-fill levels: intelligent defaults the admin can tweak.
  let prev = 'high_school_diploma';
  let recCount = 2;
  let research = false;
  let writing = false;
  let test = 'sat_act';

  if (is('direct') && is('phd')) {
    prev = 'bachelor_degree';
    recCount = 3;
    research = true;
    test = 'gre';
  } else if (is('postdoc') || is('post-doc') || is('post_doc')) {
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
  } else if (is('master') || is('msc') || is('mba') || is('meng') || is('mfa') || is('mphil')) {
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
  };
}

// ── Component ─────────────────────────────────────────────────────

export default function UnifiedDocumentsEditor({
  degreeLevels,
  scholarshipId,
  initialDegreeDocs,
  initialCustomDocs,
  onChange,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // New custom doc input state
  const [newDocName, setNewDocName] = useState('');
  const [newDocDesc, setNewDocDesc] = useState('');

  // Build initial state: merge initialDocs with defaults for each level
  const [docs, setDocs] = useState<UnifiedDegreeDoc[]>(() => {
    const customDocs = (initialCustomDocs || []) as Array<{
      id?: string; name: string; description?: string; required: boolean;
      degree_level?: string | null; position?: number;
    }>;

    return degreeLevels.map((level) => {
      const existing = (initialDegreeDocs || []).find(
        (d: Record<string, unknown>) => (d.degree_level as string)?.toLowerCase() === level.toLowerCase()
      );

      const base = existing
        ? {
            id: existing.id as string,
            degree_level: level,
            req_transcripts: (existing.req_transcripts ?? true) as boolean,
            req_cv_resume: (existing.req_cv_resume ?? true) as boolean,
            req_sop_motivation_letter: (existing.req_sop_motivation_letter ?? true) as boolean,
            req_recommendation_letters: (existing.req_recommendation_letters ?? true) as boolean,
            req_english_test: (existing.req_english_test ?? true) as boolean,
            req_passport_or_id: (existing.req_passport_or_id ?? true) as boolean,
            req_financial_proof: (existing.req_financial_proof ?? false) as boolean,
            req_photo: (existing.req_photo ?? false) as boolean,
            previous_degree_required: (existing.previous_degree_required as string) || 'high_school_diploma',
            recommendation_letters_count: (existing.recommendation_letters_count as number) ?? 2,
            research_proposal_required: (existing.research_proposal_required ?? false) as boolean,
            writing_sample_required: (existing.writing_sample_required ?? false) as boolean,
            standardized_test: (existing.standardized_test as string) || 'none',
          }
        : defaultsForLevel(level);

      // Attach custom docs for this level (per-level or global)
      const levelCustomDocs = customDocs
        .filter((cd) => !cd.degree_level || cd.degree_level.toLowerCase() === level.toLowerCase())
        .map((cd, i) => ({
          id: cd.id,
          name: cd.name,
          description: cd.description || '',
          required: cd.required,
          degree_level: cd.degree_level || null,
          position: cd.position ?? i,
        }));

      return { ...base, custom_documents: levelCustomDocs };
    });
  });

  // Notify parent of changes
  useEffect(() => {
    if (!onChange) return;
    // Flatten: degree_documents (without custom_documents) + all custom_documents
    const degreeDocuments = docs.map(({ custom_documents: _, ...rest }) => rest);
    const customDocuments = docs.flatMap((d) =>
      d.custom_documents.map((cd) => ({ ...cd, degree_level: d.degree_level }))
    );
    onChange({ degree_documents: degreeDocuments, custom_documents: customDocuments });
  }, [docs, onChange]);

  const updateDoc = useCallback(
    (index: number, field: keyof Omit<UnifiedDegreeDoc, 'custom_documents'>, value: unknown) => {
      setDocs((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    []
  );

  // Custom doc CRUD
  const addCustomDoc = useCallback(
    (levelIndex: number) => {
      if (!newDocName.trim()) return;
      setDocs((prev) => {
        const next = [...prev];
        const doc = next[levelIndex];
        const newDoc: UnifiedCustomDoc = {
          name: newDocName.trim(),
          description: newDocDesc.trim(),
          required: true,
          degree_level: doc.degree_level,
          position: doc.custom_documents.length,
        };
        next[levelIndex] = {
          ...doc,
          custom_documents: [...doc.custom_documents, newDoc],
        };
        return next;
      });
      setNewDocName('');
      setNewDocDesc('');
    },
    [newDocName, newDocDesc]
  );

  const removeCustomDoc = useCallback((levelIndex: number, docIndex: number) => {
    setDocs((prev) => {
      const next = [...prev];
      next[levelIndex] = {
        ...next[levelIndex],
        custom_documents: next[levelIndex].custom_documents.filter((_, i) => i !== docIndex),
      };
      return next;
    });
  }, []);

  const updateCustomDoc = useCallback(
    (levelIndex: number, docIndex: number, field: keyof UnifiedCustomDoc, value: unknown) => {
      setDocs((prev) => {
        const next = [...prev];
        const customDocs = [...next[levelIndex].custom_documents];
        customDocs[docIndex] = { ...customDocs[docIndex], [field]: value };
        next[levelIndex] = { ...next[levelIndex], custom_documents: customDocs };
        return next;
      });
    },
    []
  );

  // Save to API (edit mode only — needs scholarshipId)
  const handleSave = async () => {
    if (!scholarshipId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // Save degree docs
      for (const doc of docs) {
        const { custom_documents: _, ...body } = doc;
        if (body.research_proposal_required === null) body.research_proposal_required = false as any;

        if (doc.id) {
          const res = await fetch(
            `/api/admin/scholarships/${scholarshipId}/degree-docs/${doc.id}`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }
          );
          if (!res.ok) throw new Error(`Failed to update ${doc.degree_level}`);
        } else {
          const res = await fetch(
            `/api/admin/scholarships/${scholarshipId}/degree-docs`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }
          );
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            if (err?.detail?.code === 'degree_level_exists') continue;
            throw new Error(`Failed to create ${doc.degree_level}`);
          }
          const created = await res.json();
          doc.id = created.id;
        }
      }

      // Save custom docs — fetch existing, diff, create/update/delete
      const existingRes = await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs`, { credentials: 'include' });
      const existing: Array<{ id: string }> = existingRes.ok ? await existingRes.json() : [];
      const existingIds = new Set(existing.map((d) => d.id));

      const allCustomDocs = docs.flatMap((d) => d.custom_documents);
      const currentIds = new Set(allCustomDocs.filter((d) => d.id).map((d) => d.id));

      // Create new
      for (const cd of allCustomDocs.filter((d) => !d.id)) {
        await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(cd),
        });
      }
      // Update existing
      for (const cd of allCustomDocs.filter((d) => d.id)) {
        await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs/${cd.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify(cd),
        });
      }
      // Delete removed
      for (const id of existingIds) {
        if (!currentIds.has(id)) {
          await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs/${id}`, {
            method: 'DELETE', credentials: 'include',
          });
        }
      }

      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err: unknown) {
      setSaveMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // No degree levels selected yet
  if (degreeLevels.length === 0) {
    return (
      <div className="border border-gray-200 bg-gray-50 rounded-lg p-3 mt-3">
        <p className="text-sm text-gray-500">
          Select degree levels above to configure required documents.
        </p>
      </div>
    );
  }

  const multiLevel = degreeLevels.length > 1;
  const current = docs[activeTab];

  return (
    <div className="border border-gray-200 bg-gray-50 rounded-lg p-3 mt-3">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div>
          <span className="text-sm font-semibold text-gray-900">
            Required Documents
          </span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {multiLevel
              ? `Configure documents per degree level (${degreeLevels.join(', ')})`
              : 'Configure what applicants need to submit'}
          </p>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Tabs (only for multi-level) */}
          {multiLevel && (
            <div className="flex gap-1 border-b border-gray-200 pb-1">
              {degreeLevels.map((level, i) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                    activeTab === i
                      ? 'bg-white text-gray-900 border border-gray-200 border-b-white -mb-[px]'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          )}

          {current && (
            <div className="space-y-3 bg-white rounded-lg p-3 border border-gray-100">
              {/* Smart-fill indicator */}
              {hasSmartFill(current.degree_level) ? (
                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-1.5">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>Defaults auto-filled for <strong>{current.degree_level}</strong> — adjust as needed.</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>No smart defaults for <strong>{current.degree_level}</strong> — tick what applies or add custom docs below.</span>
                </div>
              )}

              {/* 8 standard booleans */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <CheckboxRow label="Transcripts" checked={current.req_transcripts} onChange={(v) => updateDoc(activeTab, 'req_transcripts', v)} />
                <CheckboxRow label="CV / Resume" checked={current.req_cv_resume} onChange={(v) => updateDoc(activeTab, 'req_cv_resume', v)} />
                <CheckboxRow label="Statement of Purpose" checked={current.req_sop_motivation_letter} onChange={(v) => updateDoc(activeTab, 'req_sop_motivation_letter', v)} />
                <CheckboxRow label="Recommendation letters" checked={current.req_recommendation_letters} onChange={(v) => updateDoc(activeTab, 'req_recommendation_letters', v)} />
                <CheckboxRow label="English test" checked={current.req_english_test} onChange={(v) => updateDoc(activeTab, 'req_english_test', v)} />
                <CheckboxRow label="Passport or ID" checked={current.req_passport_or_id} onChange={(v) => updateDoc(activeTab, 'req_passport_or_id', v)} />
                <CheckboxRow label="Financial proof" checked={current.req_financial_proof} onChange={(v) => updateDoc(activeTab, 'req_financial_proof', v)} />
                <CheckboxRow label="Photo" checked={current.req_photo} onChange={(v) => updateDoc(activeTab, 'req_photo', v)} />
              </div>

              {/* Cement + flexible fields */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <FieldLabel>Previous degree required</FieldLabel>
                  <select
                    value={current.previous_degree_required}
                    onChange={(e) => updateDoc(activeTab, 'previous_degree_required', e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {PREVIOUS_DEGREE_OPTIONS.filter((o) => o.value !== 'auto').map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Rec. letters count</FieldLabel>
                  <select
                    value={current.recommendation_letters_count}
                    onChange={(e) => updateDoc(activeTab, 'recommendation_letters_count', Number(e.target.value))}
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {[0, 1, 2, 3, 4].map((n) => (
                      <option key={n} value={n}>{n === 0 ? 'None' : n}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Research proposal</FieldLabel>
                  <select
                    value={String(current.research_proposal_required)}
                    onChange={(e) => updateDoc(activeTab, 'research_proposal_required', e.target.value === 'true')}
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
                    onChange={(e) => updateDoc(activeTab, 'writing_sample_required', e.target.value === 'true')}
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
                    onChange={(e) => updateDoc(activeTab, 'standardized_test', e.target.value)}
                    className="w-full h-9 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {STANDARDIZED_TEST_OPTIONS.filter((o) => o.value !== 'auto').map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Custom documents (inline) ─────────────────── */}
              <div className="pt-2 border-t border-gray-100">
                <FieldLabel hint="Portfolio, video essay, certificate, etc.">
                  Custom Documents
                </FieldLabel>

                {current.custom_documents.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {current.custom_documents.map((cd, ci) => (
                      <div
                        key={cd.id || `new-${ci}`}
                        className="flex items-center gap-2 bg-gray-50 rounded border border-gray-100 px-2 py-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate block">
                            {cd.name}
                          </span>
                          {cd.description && (
                            <span className="text-[11px] text-gray-500 truncate block">
                              {cd.description}
                            </span>
                          )}
                        </div>
                        <label className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                          <input
                            type="checkbox"
                            checked={cd.required}
                            onChange={(e) => updateCustomDoc(activeTab, ci, 'required', e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeCustomDoc(activeTab, ci)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add custom doc inline */}
                <div className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={newDocName}
                    onChange={(e) => setNewDocName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomDoc(activeTab)}
                    className="flex-1 h-8 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Document name"
                  />
                  <input
                    type="text"
                    value={newDocDesc}
                    onChange={(e) => setNewDocDesc(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addCustomDoc(activeTab)}
                    className="flex-1 h-8 px-2 text-sm bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Description (optional)"
                  />
                  <button
                    type="button"
                    onClick={() => addCustomDoc(activeTab)}
                    disabled={!newDocName.trim()}
                    className="h-8 px-3 text-sm font-medium text-white bg-gray-800 rounded hover:bg-gray-900 disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Save button (edit mode only) */}
          {scholarshipId && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-sm font-medium text-white bg-gray-800 rounded hover:bg-gray-900 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Documents'}
              </button>
              {saveMsg && (
                <span className={`text-xs ${saveMsg.includes('fail') || saveMsg.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
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
