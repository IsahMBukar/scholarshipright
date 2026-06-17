'use client';

// Shared password input used by /login, /signup, and /admin/accept-invite
// so all three share the exact same look, feel, strength meter, and
// show/hide toggle behavior. Extracted verbatim from the accept-invite
// design so future changes to the design system land in one place.
//
// Visual DNA (matches accept-invite):
//   - 40px tall, white background, rounded-btn, gray-200 border
//   - Focus: ring-2 ring-primary/40 + primary border
//   - Subtle show/hide eye button (lucide Eye / EyeOff)
//   - Optional 4-segment strength meter below the field
//   - Optional inline strength label ("Weak", "Fair", "Good", "Strong")

import { useMemo, useState, type ChangeEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type Strength = 0 | 1 | 2 | 3 | 4;

function evaluateStrength(pw: string): { score: Strength; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const map = [
    { label: 'Too short', color: 'bg-red-400' },
    { label: 'Weak', color: 'bg-red-400' },
    { label: 'Fair', color: 'bg-amber-400' },
    { label: 'Good', color: 'bg-emerald-400' },
    { label: 'Strong', color: 'bg-emerald-500' },
  ] as const;
  const idx = Math.min(Math.max(s, 1), 4) as Strength;
  return { score: idx, label: map[idx].label, color: map[idx].color };
}

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  showStrength?: boolean;
  disabled?: boolean;
  /** Show a red asterisk next to the label */
  requiredMark?: boolean;
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = 'At least 8 characters',
  autoComplete = 'current-password',
  required,
  showStrength = false,
  disabled,
  requiredMark,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const strength = useMemo(() => evaluateStrength(value), [value]);

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-xs font-medium text-text-secondary mb-1"
      >
        {label}
        {requiredMark && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          className="w-full h-10 pl-3 pr-10 rounded-btn border border-gray-200 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-text-secondary hover:text-text-primary"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {showStrength && value && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden flex gap-0.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex-1 rounded-full transition-colors ${
                  i <= strength.score ? strength.color : 'bg-transparent'
                }`}
              />
            ))}
          </div>
          <span className="text-[11px] font-medium text-text-secondary w-12 text-right">
            {strength.label}
          </span>
        </div>
      )}
    </div>
  );
}
