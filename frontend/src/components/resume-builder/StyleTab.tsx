'use client';

import { useState } from 'react';

export interface ResumeStyle {
  theme: string;
  primaryColor: string;
  fontHeading: string;
  fontBody: string;
}

interface Props {
  style: ResumeStyle;
  onStyleChange: (style: ResumeStyle) => void;
}

const THEMES = [
  { id: 'classic', label: 'Classic', desc: 'Clean, traditional layout' },
  { id: 'modern', label: 'Modern', desc: 'Minimal with accent bar' },
  { id: 'academic', label: 'Academic', desc: 'Structured for scholars' },
  { id: 'compact', label: 'Compact', desc: 'Maximum content density' },
];

const COLORS = [
  { id: '#f5b942', label: 'Gold', hex: '#f5b942' },
  { id: '#1e40af', label: 'Navy', hex: '#1e40af' },
  { id: '#059669', label: 'Emerald', hex: '#059669' },
  { id: '#7c3aed', label: 'Purple', hex: '#7c3aed' },
  { id: '#dc2626', label: 'Red', hex: '#dc2626' },
  { id: '#0891b2', label: 'Teal', hex: '#0891b2' },
  { id: '#1e1e1e', label: 'Black', hex: '#1e1e1e' },
  { id: '#6b7280', label: 'Gray', hex: '#6b7280' },
];

const FONTS = [
  { id: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { id: 'Georgia, serif', label: 'Georgia' },
  { id: "'Times New Roman', serif", label: 'Times New Roman' },
  { id: 'Verdana, sans-serif', label: 'Verdana' },
  { id: "'Trebuchet MS', sans-serif", label: 'Trebuchet MS' },
];

export default function StyleTab({ style, onStyleChange }: Props) {
  const update = (partial: Partial<ResumeStyle>) => {
    onStyleChange({ ...style, ...partial });
  };

  return (
    <div className="flex flex-col gap-5 overflow-y-auto pr-1">
      {/* Theme */}
      <div>
        <label className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2 block">Layout Theme</label>
        <div className="grid grid-cols-2 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => update({ theme: t.id })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                style.theme === t.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="text-[13px] font-semibold text-gray-800">{t.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Accent Color */}
      <div>
        <label className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2 block">Accent Color</label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => update({ primaryColor: c.hex })}
              className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                style.primaryColor === c.hex
                  ? 'border-gray-800 scale-110'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: c.hex }}
              title={c.label}
            >
              {style.primaryColor === c.hex && (
                <span className="material-symbols-outlined text-white text-[16px]">check</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Heading Font */}
      <div>
        <label className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2 block">Heading Font</label>
        <div className="flex flex-col gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => update({ fontHeading: f.id })}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                style.fontHeading === f.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span
                className="text-[15px] font-bold text-gray-800"
                style={{ fontFamily: f.id }}
              >
                {f.label}
              </span>
              {style.fontHeading === f.id && (
                <span className="material-symbols-outlined text-primary text-[16px] ml-auto">check_circle</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body Font */}
      <div>
        <label className="text-[12px] font-bold text-gray-700 uppercase tracking-wide mb-2 block">Body Font</label>
        <div className="flex flex-col gap-1.5">
          {FONTS.map((f) => (
            <button
              key={f.id}
              onClick={() => update({ fontBody: f.id })}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-all ${
                style.fontBody === f.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span
                className="text-[14px] text-gray-700"
                style={{ fontFamily: f.id }}
              >
                The quick brown fox jumps over the lazy dog
              </span>
              {style.fontBody === f.id && (
                <span className="material-symbols-outlined text-primary text-[16px] ml-auto flex-shrink-0">check_circle</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DEFAULT_STYLE: ResumeStyle = {
  theme: 'classic',
  primaryColor: '#f5b942',
  fontHeading: 'Helvetica, Arial, sans-serif',
  fontBody: 'Helvetica, Arial, sans-serif',
};
