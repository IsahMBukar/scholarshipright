'use client';

/**
 * Custom/flexible document requirements editor.
 *
 * Lets admins add any document requirement to a scholarship —
 * portfolio, video essay, workshop certificate, event registration, etc.
 * Documents can be global (all levels) or per-degree-level.
 */

import { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface CustomDoc {
  id?: string;
  name: string;
  description: string;
  required: boolean;
  degree_level: string | null;
  position: number;
}

interface Props {
  scholarshipId?: string;
  initialDocs?: CustomDoc[] | null;
  degreeLevels?: string[];
  onChange?: (docs: CustomDoc[]) => void;
}

export default function CustomDocumentsEditor({
  scholarshipId,
  initialDocs,
  degreeLevels = [],
  onChange,
}: Props) {
  const [docs, setDocs] = useState<CustomDoc[]>(() => initialDocs || []);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLevel, setNewLevel] = useState<string>('');

  const updateDocs = useCallback(
    (next: CustomDoc[]) => {
      setDocs(next);
      onChange?.(next);
    },
    [onChange]
  );

  const addDoc = () => {
    if (!newName.trim()) return;
    const doc: CustomDoc = {
      name: newName.trim(),
      description: newDesc.trim() || '',
      required: true,
      degree_level: newLevel || null,
      position: docs.length,
    };
    updateDocs([...docs, doc]);
    setNewName('');
    setNewDesc('');
    setNewLevel('');
  };

  const removeDoc = (index: number) => {
    updateDocs(docs.filter((_, i) => i !== index));
  };

  const updateDoc = (index: number, field: keyof CustomDoc, value: unknown) => {
    const next = [...docs];
    next[index] = { ...next[index], [field]: value };
    updateDocs(next);
  };

  const handleSave = async () => {
    if (!scholarshipId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      // Get existing docs from server to know which to update/delete
      const res = await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs`, {
        credentials: 'include',
      });
      const existing: Array<{ id: string }> = res.ok ? await res.json() : [];
      const existingIds = new Set(existing.map((d) => d.id));

      // Create new docs (no id)
      for (const doc of docs.filter((d) => !d.id)) {
        await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(doc),
        });
      }

      // Update existing docs
      for (const doc of docs.filter((d) => d.id)) {
        await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs/${doc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(doc),
        });
      }

      // Delete removed docs
      const currentIds = new Set(docs.filter((d) => d.id).map((d) => d.id));
      for (const id of existingIds) {
        if (!currentIds.has(id)) {
          await fetch(`/api/admin/scholarships/${scholarshipId}/custom-docs/${id}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }
      }

      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-semibold text-blue-900">
            Custom Document Requirements
          </span>
          <p className="text-[11px] text-blue-700 mt-0.5">
            Add any document — portfolio, video essay, certificate, event registration, etc.
          </p>
        </div>
      </div>

      {/* Existing docs */}
      {docs.length > 0 && (
        <div className="space-y-2 mb-3">
          {docs.map((doc, i) => (
            <div
              key={doc.id || `new-${i}`}
              className="flex items-start gap-2 bg-white rounded border border-blue-100 p-2"
            >
              <GripVertical className="w-4 h-4 text-gray-300 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0 space-y-1">
                <input
                  type="text"
                  value={doc.name}
                  onChange={(e) => updateDoc(i, 'name', e.target.value)}
                  className="w-full text-sm font-medium bg-transparent border-b border-transparent focus:border-blue-300 focus:outline-none"
                  placeholder="Document name"
                />
                <input
                  type="text"
                  value={doc.description}
                  onChange={(e) => updateDoc(i, 'description', e.target.value)}
                  className="w-full text-xs text-gray-500 bg-transparent border-b border-transparent focus:border-blue-200 focus:outline-none"
                  placeholder="Description (optional)"
                />
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={doc.required}
                      onChange={(e) => updateDoc(i, 'required', e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Required
                  </label>
                  {degreeLevels.length > 0 && (
                    <select
                      value={doc.degree_level || ''}
                      onChange={(e) => updateDoc(i, 'degree_level', e.target.value || null)}
                      className="text-xs bg-transparent border border-gray-200 rounded px-1 py-0.5"
                    >
                      <option value="">All levels</option>
                      {degreeLevels.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeDoc(i)}
                className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new doc */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDoc()}
            className="w-full h-8 px-2 text-sm bg-white border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Document name (e.g. Portfolio, Video essay)"
          />
        </div>
        <div className="flex-1">
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDoc()}
            className="w-full h-8 px-2 text-sm bg-white border border-blue-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            placeholder="Description (optional)"
          />
        </div>
        {degreeLevels.length > 0 && (
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            className="h-8 px-2 text-xs bg-white border border-blue-200 rounded"
          >
            <option value="">All levels</option>
            {degreeLevels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={addDoc}
          disabled={!newName.trim()}
          className="h-8 px-3 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Save button */}
      {scholarshipId && docs.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Custom Documents'}
          </button>
          {saveMsg && (
            <span className={`text-xs ${saveMsg.includes('fail') ? 'text-red-600' : 'text-green-600'}`}>
              {saveMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
