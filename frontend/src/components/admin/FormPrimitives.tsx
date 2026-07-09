// Shared form input primitives for admin drawers.
//
// Used by CreateScholarshipWizard and the Edit drawer inside
// /admin/scholarships/page.tsx. Keeping them in one place ensures the
// two drawers look and behave identically — same field label styling,
// same focus rings, same hint placement, same checkbox row layout.
//
// The form *state* and *body building* live in scholarshipForm.ts (which
// has no JSX so it can stay .ts). The visual layer lives here.

import type React from 'react';

// ── Label ──────────────────────────────────────────────────────────
// Field label with optional red asterisk for required fields, plus an
// optional right-aligned hint (e.g. "USD / month" or "months").
export function FieldLabel({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-1">
      <label className="text-xs uppercase tracking-wide text-text-secondary">
        {children}
        {required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {hint && (
        <span className="text-[10px] text-text-secondary opacity-70">{hint}</span>
      )}
    </div>
  );
}

// ── Text input ─────────────────────────────────────────────────────
export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'date' | 'number' | 'url';
  className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={
        'w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-btn ' +
        'focus:outline-none focus:ring-1 focus:ring-primary ' +
        (className ?? '')
      }
    />
  );
}

// ── Textarea ───────────────────────────────────────────────────────
export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-btn focus:outline-none focus:ring-1 focus:ring-primary resize-y"
    />
  );
}

// ── Section header ────────────────────────────────────────────────
// Thin divider + small uppercase heading. Renders a top border on every
// section except the first (use the `first` prop variant or rely on
// CSS — the current usage applies the border-t only to non-first
// sections via the parent grid).
export function SectionHeader({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="pt-4 mt-2 border-t border-gray-200 first:pt-0 first:mt-0 first:border-t-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-3">
        {children}
      </h3>
      {hint && <p className="text-[11px] text-text-secondary -mt-2 mb-3">{hint}</p>}
    </div>
  );
}

// ── Checkbox row ───────────────────────────────────────────────────
export function CheckboxRow({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
      />
      <span>
        {label}
        {description && (
          <span className="block text-[11px] text-text-secondary">{description}</span>
        )}
      </span>
    </label>
  );
}
