'use client';

// FieldOfStudyPicker — drop-down picker for the 2,498-entry CIP field list.
//
// The raw list is a wall of options; this control narrows it three ways:
//   1. Category chips (Computer & IT, Health & Medicine, …)
//   2. Live search-as-you-type
//   3. Full-width option list (mobile friendly, max-height scroll)
//
// Modes:
//   - single (default): select exactly one field, panel closes on pick
//   - multiple: toggle any number; selected shown as removable chips
//
// Values not present in the CIP list (e.g. legacy tokens like
// "computer_science") are preserved and rendered from `value` directly,
// so nothing already stored on a profile is ever lost.

import { useMemo, useRef, useState } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import {
  FIELD_CATEGORIES,
  getFieldOptions,
  categoryLabel,
  type CategorizedField,
} from '@/data/fieldCategories';

interface FieldOfStudyPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  multiple?: boolean;
  placeholder?: string;
  maxListHeight?: number;
  compact?: boolean;
}

function prettyLabel(value: string): string {
  return value.includes(' ') || value.includes('/') || value.includes('&')
    ? value
    : value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function FieldOfStudyPicker({
  value,
  onChange,
  multiple = false,
  placeholder = 'Select a field…',
  maxListHeight = 280,
}: FieldOfStudyPickerProps) {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(
    () => getFieldOptions(cat, query),
    [cat, query]
  );

  const selectedSet = useMemo(() => new Set(value), [value]);

  // Close on outside click
  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const openPanel = () => {
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const pick = (field: CategorizedField) => {
    if (multiple) {
      const next = selectedSet.has(field.value)
        ? value.filter((v) => v !== field.value)
        : [...value, field.value];
      onChange(next);
    } else {
      onChange([field.value]);
      close();
    }
  };

  const removeOne = (v: string) => onChange(value.filter((x) => x !== v));

  const displayValue = !multiple && value.length > 0 ? prettyLabel(value[0]) : placeholder;

  return (
    <div ref={rootRef} className="relative w-full">
      {/* Trigger — looks like the app's native selects */}
      <button
        type="button"
        onClick={open ? close : openPanel}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-white border rounded-btn text-[14px] text-left transition-all outline-none ${
          open ? 'border-primary ring-2 ring-primary' : 'border-gray-200 hover:border-primary/40'
        } ${value.length > 0 && !multiple ? 'text-text-primary font-medium' : 'text-text-secondary'}`}
      >
        <span className="truncate">{multiple && value.length > 0 ? `${value.length} field${value.length > 1 ? 's' : ''} selected` : displayValue}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {multiple && value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-primary text-text-inverse border border-primary"
            >
              {prettyLabel(v)}
              <button
                type="button"
                onClick={() => removeOne(v)}
                aria-label={`Remove ${prettyLabel(v)}`}
                className="opacity-70 hover:opacity-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-card shadow-lg overflow-hidden">
          {/* Category chips — horizontal scroll on narrow screens */}
          <div className="flex gap-1.5 overflow-x-auto px-3 pt-3 pb-2 border-b border-gray-100 no-scrollbar">
            <Chip active={cat === 'all'} onClick={() => setCat('all')}>All</Chip>
            {FIELD_CATEGORIES.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>

          {/* Search */}
          <div className="relative px-3 py-2">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields… e.g. nursing"
              className="w-full pl-8 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-[14px] outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              role="combobox"
              aria-expanded
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-5 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <ul
            role="listbox"
            aria-multiselectable={multiple || undefined}
            className="overflow-y-auto px-2 py-2"
            style={{ maxHeight: maxListHeight }}
          >
            {options.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-text-secondary">
                No fields match “{query || 'this category'}”.
              </li>
            ) : (
              options.map((field) => {
                const selected = selectedSet.has(field.value);
                return (
                  <li key={field.value}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => pick(field)}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-left text-[14px] transition-colors ${
                        selected
                          ? 'bg-primary/8 text-primary font-medium'
                          : 'text-text-primary hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate">{field.label}</span>
                      {selected && <Check className="w-4 h-4 flex-shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[11px] text-text-secondary">
            <span>
              {query ? options.length : 'Showing ' + options.length} of {cat === 'all' ? '2,498' : categoryLabel(cat)}
            </span>
            <span>Esc to close</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
        active
          ? 'bg-primary text-text-inverse border-primary'
          : 'bg-white text-text-secondary border-gray-200 hover:border-primary/40 hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}