'use client';

// Shared form helpers for user-facing pages (profile, resume, settings).
// Admin pages use admin/FormPrimitives.tsx which has a different visual DNA.
//
// These are intentionally minimal — just the label+input wrapper, text input,
// and select that repeat across profile/resume/settings.

import type { ReactNode } from 'react';

// ── Field (label + input wrapper) ────────────────────────────────
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="text-[13px] font-semibold text-text-primary block mb-1">{label}</label>
      {children}
    </div>
  );
}

// ── Text input ───────────────────────────────────────────────────
export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
    />
  );
}

// ── Select ───────────────────────────────────────────────────────
export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-[14px] text-text-primary focus:ring-2 focus:ring-primary outline-none disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Error text ───────────────────────────────────────────────────
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
      <span className="material-symbols-outlined text-[16px] text-red-600 mt-0.5">error</span>
      <p className="text-[13px] text-red-700">{children}</p>
    </div>
  );
}

// ── Success text ─────────────────────────────────────────────────
export function SuccessText({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
      <span className="material-symbols-outlined text-[16px] text-emerald-600 mt-0.5">check_circle</span>
      <p className="text-[13px] text-emerald-700">{children}</p>
    </div>
  );
}
