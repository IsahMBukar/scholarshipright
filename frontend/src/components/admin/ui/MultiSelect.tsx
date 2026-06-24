'use client';

// Reusable multi-select / single-select combobox used by the admin
// scholarship drawers (degree levels, fields of study, eligible
// nationalities, host country, eligible regions).
//
// Why one component: every drawer field that takes a list of values
// shares the same UX problem — small canonical lists prevent typos
// (degree levels, fields of study) while long lists benefit from
// typeahead filtering (countries, nationalities). One component
// handles both with a `multiple` flag.
//
// Behaviour:
//   - Input field filters the options list (case-insensitive substring).
//   - Dropdown shows up to `maxVisible` matching options (default 5).
//     This is the "show only five like the nation field" rule — long
//     lists stay scannable without forcing the admin to scroll.
//   - Click a suggestion → adds (multi) or sets (single).
//   - Selected values appear as removable chips above the input
//     (multi mode only).
//   - `allowFreeText` (default true): pressing Enter on text that
//     doesn't match an option creates a new chip. Useful for fields
//     like eligible_nationalities where most entries are descriptive
//     ("African countries", "All Chevening-eligible countries") and
//     not in any canonical list.
//   - Keyboard: ↑/↓ navigate, Enter selects, Backspace on empty
//     input removes the last chip, Escape closes.

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export interface MultiSelectOption {
  value: string;
  /** Optional display label. Defaults to `value`. */
  label?: string;
}

interface MultiSelectBaseProps {
  options: ReadonlyArray<string | MultiSelectOption>;
  /** Cap on suggestions shown. Default 5 — matches the "only show
   *  five like the nation field" rule for long lists. */
  maxVisible?: number;
  placeholder?: string;
  emptyMessage?: string;
  /** Pressing Enter on free text creates a new chip / sets the value.
   *  Useful for descriptive entries that aren't in the canonical list. */
  allowFreeText?: boolean;
  disabled?: boolean;
  className?: string;
  /** ARIA label for the combobox input (the visible field label is
   *  rendered separately by FormPrimitives.FieldLabel). */
  ariaLabel?: string;
  id?: string;
}

/** Discriminated union — when `multiple: true` (default), `value` and
 *  `onChange` use string[]. When `multiple: false`, they use
 *  `string | null`. TypeScript narrows correctly at every call site. */
export type MultiSelectProps =
  | (MultiSelectBaseProps & {
      multiple?: false;
      value: string | null;
      onChange: (v: string | null) => void;
    })
  | (MultiSelectBaseProps & {
      multiple: true;
      value: string[];
      onChange: (v: string[]) => void;
    });

function normalise(opt: string | MultiSelectOption): MultiSelectOption {
  return typeof opt === 'string' ? { value: opt } : opt;
}

function displayLabel(opt: MultiSelectOption): string {
  return opt.label ?? opt.value;
}

export default function MultiSelect({
  options,
  multiple = true,
  value,
  onChange,
  maxVisible = 5,
  placeholder,
  emptyMessage = 'No matches',
  allowFreeText = true,
  disabled = false,
  className,
  ariaLabel,
  id,
}: MultiSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Normalise options once so the filter below is cheap.
  const normalised = useMemo(() => options.map(normalise), [options]);

  // Current selection as an array — single-select uses array
  // internally too so chip-removal + filter logic stays in one place.
  const selectedArr: string[] = useMemo(() => {
    if (multiple) return Array.isArray(value) ? value : [];
    if (value == null) return [];
    return [value as string];
  }, [multiple, value]);

  // Filter + dedupe suggestions. Selected values are excluded so the
  // dropdown never shows what's already chosen.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = normalised.filter((o) => {
      if (selectedArr.includes(o.value)) return false;
      if (!q) return true;
      return (
        o.value.toLowerCase().includes(q) ||
        (o.label?.toLowerCase().includes(q) ?? false)
      );
    });
    return matches.slice(0, maxVisible);
  }, [normalised, query, selectedArr, maxVisible]);

  // Show a "Create …" affordance when allowFreeText + query is
  // non-empty + typed value isn't an exact match to any option.
  const freeTextValue = useMemo(() => {
    if (!allowFreeText) return null;
    const q = query.trim();
    if (!q) return null;
    const exactMatch = normalised.some(
      (o) => o.value.toLowerCase() === q.toLowerCase()
    );
    const alreadySelected = selectedArr.some(
      (s) => s.toLowerCase() === q.toLowerCase()
    );
    if (exactMatch || alreadySelected) return null;
    return q;
  }, [allowFreeText, query, normalised, selectedArr]);

  // Each callback closes over its narrowed `onChange`. The
  // discriminated union loses narrowing inside useCallback closures,
  // so we split into four single-variant callbacks and pick at the
  // call site — the cast is safe because `multiple` is the
  // discriminator that picks the right callback.
  const addMulti = useCallback(
    (v: string) => {
      const cleaned = v.trim();
      if (!cleaned || selectedArr.includes(cleaned)) return;
      (onChange as unknown as (v: string[]) => void)([...selectedArr, cleaned]);
      setQuery('');
      setActiveIdx(0);
      inputRef.current?.focus();
    },
    [onChange, selectedArr]
  );
  const addSingle = useCallback(
    (v: string) => {
      const cleaned = v.trim();
      if (!cleaned || selectedArr.includes(cleaned)) return;
      (onChange as unknown as (v: string | null) => void)(cleaned);
      setQuery('');
      setActiveIdx(0);
      inputRef.current?.focus();
    },
    [onChange, selectedArr]
  );

  const removeMulti = useCallback(
    (v: string) => {
      (onChange as unknown as (v: string[]) => void)(selectedArr.filter((x) => x !== v));
      setQuery('');
      inputRef.current?.focus();
    },
    [onChange, selectedArr]
  );
  const removeSingle = useCallback(
    (_v: string) => {
      (onChange as unknown as (v: string | null) => void)(null);
      setQuery('');
      inputRef.current?.focus();
    },
    [onChange]
  );

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const totalItems = suggestions.length + (freeTextValue ? 1 : 0);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, totalItems - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (totalItems === 0) return;
        const valueToAdd =
          activeIdx < suggestions.length
            ? suggestions[activeIdx].value
            : freeTextValue ?? null;
        if (valueToAdd == null) return;
        if (multiple) addMulti(valueToAdd);
        else addSingle(valueToAdd);
      } else if (
        e.key === 'Backspace' &&
        query === '' &&
        selectedArr.length > 0
      ) {
        // Backspace on empty input → remove the last chip. Standard
        // tag-input UX, saves the admin a click on the × button.
        e.preventDefault();
        const last = selectedArr[selectedArr.length - 1];
        if (multiple) removeMulti(last);
        else removeSingle(last);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    },
    [
      activeIdx,
      suggestions,
      freeTextValue,
      multiple,
      addMulti,
      addSingle,
      removeMulti,
      removeSingle,
      query,
      selectedArr,
    ]
  );

  const showDropdown =
    open && (suggestions.length > 0 || freeTextValue !== null);
  const dropdownTotal = suggestions.length + (freeTextValue ? 1 : 0);

  return (
    <div ref={containerRef} className={clsx('relative', className)}>
      <div
        className={clsx(
          'flex flex-wrap items-center gap-1.5 min-h-[40px] w-full px-2 py-1.5',
          'text-sm bg-white border border-gray-200 rounded-btn',
          'focus-within:ring-1 focus-within:ring-primary focus-within:border-primary',
          disabled && 'opacity-60 cursor-not-allowed bg-gray-50'
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Multi-mode chips for selected values */}
        {multiple &&
          selectedArr.map((v) => {
            const opt = normalised.find((o) => o.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium max-w-full"
              >
                <span className="truncate">{displayLabel(opt ?? { value: v })}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Chip removal only renders when `multiple` is
                      // true, so removeMulti is the safe variant here.
                      removeMulti(v);
                    }}
                    className="hover:bg-primary/20 rounded-full p-0.5 shrink-0"
                    aria-label={`Remove ${displayLabel(opt ?? { value: v })}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            );
          })}

        {/* Single-mode value renders as plain text inside the input
            area so the user sees the current value without chips. */}
        {!multiple && selectedArr.length > 0 && query === '' && (
          <span className="text-sm text-text-primary mr-1 truncate max-w-full">
            {displayLabel(
              normalised.find((o) => o.value === selectedArr[0]) ?? {
                value: selectedArr[0],
              }
            )}
          </span>
        )}

        <input
          ref={inputRef}
          id={id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIdx(0);
            if (!multiple && e.target.value) {
              // Single-mode: clear the current value as soon as the
              // user starts typing a replacement.
              (onChange as unknown as (v: string | null) => void)(null);
            }
          }}
          onFocus={() => {
            setOpen(true);
            if (!multiple && query === '' && selectedArr.length > 0) {
              // Show the option list (with the current value marked)
              // so the user can pick a different one without typing.
              setQuery('');
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={selectedArr.length === 0 ? placeholder : undefined}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          role="combobox"
          className="flex-1 min-w-[80px] bg-transparent outline-none text-sm disabled:cursor-not-allowed"
        />

        <ChevronDown
          className={clsx(
            'w-4 h-4 text-text-secondary transition-transform shrink-0',
            open && 'rotate-180'
          )}
        />
      </div>

      {showDropdown && (
        <ul
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          aria-multiselectable={multiple || undefined}
          className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-white border border-gray-200 rounded-btn shadow-lg"
        >
          {suggestions.length === 0 && !freeTextValue && (
            <li className="px-3 py-2 text-sm text-text-secondary">
              {emptyMessage}
            </li>
          )}
          {suggestions.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                // mousedown (not click) so we beat the input's blur
                // handler — otherwise the click would close the
                // dropdown before the add callback runs.
                e.preventDefault();
                if (multiple) addMulti(opt.value);
                else addSingle(opt.value);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer',
                i === activeIdx && 'bg-primary/5 text-primary'
              )}
            >
              <span className="flex-1 truncate">{displayLabel(opt)}</span>
              {multiple && selectedArr.includes(opt.value) && (
                <Check className="w-3 h-3 text-primary" />
              )}
            </li>
          ))}
          {freeTextValue && (
            <li
              role="option"
              aria-selected={activeIdx === suggestions.length}
              onMouseDown={(e) => {
                e.preventDefault();
                if (multiple) addMulti(freeTextValue);
                else addSingle(freeTextValue);
              }}
              onMouseEnter={() => setActiveIdx(suggestions.length)}
              className={clsx(
                'flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer border-t border-gray-100 italic',
                activeIdx === suggestions.length &&
                  'bg-primary/5 text-primary'
              )}
            >
              <span className="truncate">
                Create “{freeTextValue}”
              </span>
            </li>
          )}
        </ul>
      )}

      {/* SR-only live region for assistive tech */}
      <span className="sr-only" aria-live="polite">
        {query && dropdownTotal === 0
          ? 'No matches'
          : `${dropdownTotal} suggestion${dropdownTotal === 1 ? '' : 's'}`}
      </span>
    </div>
  );
}
