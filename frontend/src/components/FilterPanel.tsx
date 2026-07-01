'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchFilterMetadata, type FilterMetadata } from '@/services/api';

// Single source of truth for what the user has filtered. Kept in
// one place so the page can serialize it once, and the chips/active
// strip can read it back without each filter component holding its
// own state.
export interface FilterState {
  countries: string[];
  fields: string[];
  degrees: string[];
  languageTests: string[];
  funding: '' | 'fully_funded' | 'partial' | 'stipend_only';
  minStipend: number | null;
  noIelts: boolean;
  noFee: boolean;
  verifiedOnly: boolean;
  deadlineSoon: boolean;
}

export const EMPTY_FILTERS: FilterState = {
  countries: [],
  fields: [],
  degrees: [],
  languageTests: [],
  funding: '',
  minStipend: null,
  noIelts: false,
  noFee: false,
  verifiedOnly: false,
  deadlineSoon: false,
};

// Total number of non-empty filter values — used for the count chip
// on the mobile "Filters" button and the Clear-all affordance.
export function activeFilterCount(f: FilterState): number {
  return (
    f.countries.length +
    f.fields.length +
    f.degrees.length +
    f.languageTests.length +
    (f.funding ? 1 : 0) +
    (f.minStipend ? 1 : 0) +
    Number(f.noIelts) +
    Number(f.noFee) +
    Number(f.verifiedOnly) +
    Number(f.deadlineSoon)
  );
}

interface FilterPanelProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  // Result count from the page; surfaced next to the Filter header
  // so the user can see the count change live as they toggle.
  resultCount: number;
  // When true, the desktop variant renders a compact collapsed bar
  // instead of the full filter body. Mobile is unaffected (uses bottom sheet).
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ----- FilterDropdown -------------------------------------------------
// Multi-select popover. Click trigger → list of options with
// checkboxes; click an option toggles it in the parent's array.
// The trigger shows "Label" when nothing is selected, "Label · N
// selected" when some are, and caps the pill row at 2 visible
// options + "+N" so it never grows past the trigger width.

interface FilterDropdownProps {
  label: string;
  icon: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  // Optional per-option display override (e.g. "BSc / Bachelor"
  // for the raw "bachelor" key). Falls back to the raw value.
  labels?: Record<string, string>;
  emptyText?: string;
}

function FilterDropdown({
  label,
  icon,
  options,
  selected,
  onChange,
  labels,
  emptyText = 'All',
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  }

  const display = (v: string) => (labels && labels[v]) || v;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-chip text-[13px] font-medium whitespace-nowrap transition-all border
          ${selected.length > 0
            ? 'bg-primary/10 border-primary/30 text-text-primary'
            : 'bg-white border-gray-200 text-text-primary hover:bg-gray-50'
          }`}
      >
        <span className="material-symbols-outlined text-[16px]">{icon}</span>
        {label}
        {selected.length > 0 && (
          <span className="ml-0.5 px-1.5 py-0.5 bg-primary text-white text-[10px] font-bold rounded-full leading-none">
            {selected.length}
          </span>
        )}
        <span className="material-symbols-outlined text-[14px] text-text-secondary">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1.5 w-64 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1.5">
          {options.length === 0 ? (
            <p className="text-[12px] text-text-secondary px-4 py-3">{emptyText} — no values yet</p>
          ) : (
            options.map((v) => {
              const checked = selected.includes(v);
              return (
                <button
                  key={v}
                  onClick={() => toggle(v)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-gray-50"
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                      ${checked ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}`}
                  >
                    {checked && (
                      <span className="material-symbols-outlined text-white text-[12px]">check</span>
                    )}
                  </span>
                  <span className="truncate">{display(v)}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ----- SingleSelectPills ---------------------------------------------
// Funding — pick one, or "All" to clear. Pill row, no dropdown.

interface SingleSelectPillsProps {
  label: string;
  icon: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}

function SingleSelectPills({ label, icon, options, value, onChange }: SingleSelectPillsProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider text-text-secondary">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {label}
      </span>
      <div className="flex items-center bg-gray-100 rounded-full p-0.5">
        {[{ value: '', label: 'All' }, ...options].map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value || 'all'}
              onClick={() => onChange(o.value)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-full transition-all
                ${active ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ----- QuickToggle ----------------------------------------------------
// One chip per boolean. Active = filled primary, inactive = outlined.

interface QuickToggleProps {
  label: string;
  icon: string;
  active: boolean;
  onChange: (v: boolean) => void;
}

function QuickToggle({ label, icon, active, onChange }: QuickToggleProps) {
  return (
    <button
      onClick={() => onChange(!active)}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-chip text-[12px] font-medium whitespace-nowrap transition-all border
        ${active
          ? 'bg-primary text-text-inverse border-primary'
          : 'bg-white text-text-primary border-gray-200 hover:bg-gray-50'
        }`}
    >
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
      {label}
    </button>
  );
}

// ----- StipendPopover -------------------------------------------------
// A min-stipend input with a few quick presets so the user doesn't
// have to free-type a number. Caps at 5000 because the largest
// recorded monthly stipend in the current data is $2000.

function StipendPopover({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string>(value?.toString() ?? '');

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const PRESETS = [500, 1000, 1500, 2000];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-chip text-[13px] font-medium whitespace-nowrap transition-all border
          ${value
            ? 'bg-primary/10 border-primary/30 text-text-primary'
            : 'bg-white border-gray-200 text-text-primary hover:bg-gray-50'
          }`}
      >
        <span className="material-symbols-outlined text-[16px]">payments</span>
        {value ? `$${value}+/mo` : 'Min stipend'}
      </button>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary mb-2">
            Min monthly stipend
          </p>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-text-secondary text-[14px]">$</span>
            <input
              type="number"
              min={0}
              max={5000}
              step={100}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0"
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <span className="text-text-secondary text-[12px]">/mo</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setDraft(p.toString());
                  onChange(p);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-full border transition-all
                  ${value === p
                    ? 'bg-primary/10 border-primary/30 text-text-primary'
                    : 'bg-white border-gray-200 text-text-secondary hover:bg-gray-50'
                  }`}
              >
                ${p}+
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const n = parseInt(draft, 10);
                onChange(isNaN(n) || n <= 0 ? null : Math.min(n, 5000));
                setOpen(false);
              }}
              className="flex-1 py-1.5 bg-primary text-text-inverse text-[12px] font-semibold rounded-btn"
            >
              Apply
            </button>
            {value !== null && (
              <button
                onClick={() => {
                  setDraft('');
                  onChange(null);
                  setOpen(false);
                }}
                className="px-3 py-1.5 text-text-secondary text-[12px] font-semibold"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ----- FilterPanel ----------------------------------------------------
// The big one. Desktop = inline row of dropdowns + pills. Mobile =
// a single "Filters" button that opens a bottom sheet with the
// same controls laid out vertically.

export default function FilterPanel({ filters, onChange, resultCount, collapsed, onToggleCollapse }: FilterPanelProps) {
  const [meta, setMeta] = useState<FilterMetadata | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFilterMetadata()
      .then((m) => {
        if (!cancelled) setMeta(m);
      })
      .catch(() => {
        if (!cancelled) setMetaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = activeFilterCount(filters);
  const fundingOptions = useMemo(() => {
    if (!meta) return [] as { value: string; label: string }[];
    // Use the static labels (fully_funded → "Fully funded") so the
    // user sees the friendly text, but fall back to the raw value.
    return meta.funding_types.map((v) => ({ value: v, label: meta.funding_labels[v] || v }));
  }, [meta]);

  // The actual filter body. Both desktop and mobile use this so the
  // UI is identical, just laid out differently.
  const body = (
    <div className="flex flex-col gap-3">
      {/* Multi-select row */}
      <div className="flex flex-wrap gap-2">
        <FilterDropdown
          label={filters.countries.length ? `Country · ${filters.countries.length}` : 'Country'}
          icon="public"
          options={meta?.countries || []}
          selected={filters.countries}
          onChange={(v) => onChange({ ...filters, countries: v })}
        />
        <FilterDropdown
          label={filters.fields.length ? `Field · ${filters.fields.length}` : 'Field'}
          icon="science"
          options={meta?.fields || []}
          selected={filters.fields}
          onChange={(v) => onChange({ ...filters, fields: v })}
        />
        <FilterDropdown
          label={filters.degrees.length ? `Degree · ${filters.degrees.length}` : 'Degree'}
          icon="school"
          options={meta?.degrees || []}
          selected={filters.degrees}
          onChange={(v) => onChange({ ...filters, degrees: v })}
          labels={meta?.degree_labels}
        />
        <FilterDropdown
          label={filters.languageTests.length ? `English · ${filters.languageTests.length}` : 'English test'}
          icon="g_translate"
          options={meta?.english_tests || []}
          selected={filters.languageTests}
          onChange={(v) => onChange({ ...filters, languageTests: v })}
        />
        <StipendPopover
          value={filters.minStipend}
          onChange={(v) => onChange({ ...filters, minStipend: v })}
        />
      </div>

      {/* Funding pills */}
      <div className="flex flex-wrap items-center gap-3">
        <SingleSelectPills
          label="Funding"
          icon="account_balance_wallet"
          options={fundingOptions}
          value={filters.funding}
          onChange={(v) => onChange({ ...filters, funding: v as FilterState['funding'] })}
        />
      </div>

      {/* Quick toggles */}
      <div className="flex flex-wrap gap-1.5">
        <QuickToggle
          label="No IELTS"
          icon="g_translate"
          active={filters.noIelts}
          onChange={(v) => onChange({ ...filters, noIelts: v })}
        />
        <QuickToggle
          label="No app fee"
          icon="local_atm"
          active={filters.noFee}
          onChange={(v) => onChange({ ...filters, noFee: v })}
        />
        <QuickToggle
          label="Verified"
          icon="verified"
          active={filters.verifiedOnly}
          onChange={(v) => onChange({ ...filters, verifiedOnly: v })}
        />
        <QuickToggle
          label="Deadline soon"
          icon="schedule"
          active={filters.deadlineSoon}
          onChange={(v) => onChange({ ...filters, deadlineSoon: v })}
        />
      </div>

      {/* Clear + result count row */}
      <div className="flex items-center justify-between gap-3 pt-1">
        {count > 0 ? (
          <button
            onClick={() => onChange(EMPTY_FILTERS)}
            className="flex items-center gap-1 text-[12px] font-semibold text-red-500 hover:text-red-600"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
            Clear all filters
          </button>
        ) : (
          <span />
        )}
        <p className="text-[12px] text-text-secondary">
          <strong className="text-text-primary">{resultCount}</strong> scholarship{resultCount !== 1 ? 's' : ''} match
        </p>
      </div>

      {metaError && (
        <p className="text-[12px] text-red-500">
          Couldn't load filter options. Using last-known defaults.
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* DESKTOP: collapsible filter panel */}
      <div className="hidden md:block">
        {collapsed ? (
          /* Collapsed bar — shows filter icon, active count, and expand button */
          <button
            onClick={onToggleCollapse}
            className="w-full flex items-center gap-3 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 hover:bg-gray-50 transition-colors group"
          >
            <span className="material-symbols-outlined text-[20px] text-text-secondary group-hover:text-primary transition-colors">tune</span>
            <span className="text-[13px] font-medium text-text-secondary">Filters</span>
            {count > 0 && (
              <span className="px-2 py-0.5 bg-primary text-white text-[11px] font-bold rounded-full">
                {count} active
              </span>
            )}
            <span className="ml-auto flex items-center gap-1.5 text-[12px] text-text-secondary group-hover:text-primary transition-colors">
              <span className="text-[12px] font-medium">{resultCount} results</span>
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </span>
          </button>
        ) : (
          /* Expanded panel — full filter body with collapse toggle */
          <div className="bg-white border border-gray-200 rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-text-secondary">tune</span>
                <span className="text-[13px] font-semibold text-text-primary">Filters</span>
                {count > 0 && (
                  <span className="px-1.5 py-0.5 bg-primary text-white text-[10px] font-bold rounded-full">{count}</span>
                )}
              </div>
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  className="flex items-center gap-1 text-[12px] text-text-secondary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">expand_less</span>
                  <span className="font-medium">Hide</span>
                </button>
              )}
            </div>
            {body}
          </div>
        )}
      </div>

      {/* MOBILE: Filters button + bottom sheet */}
      <div className="md:hidden">
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-chip text-[13px] font-medium bg-white text-text-primary border border-gray-200"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
          Filters
          {count > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
              {count}
            </span>
          )}
        </button>

        {sheetOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50 animate-fade-in"
              onClick={() => setSheetOpen(false)}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[85vh] flex flex-col">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <h3 className="text-[17px] font-bold text-text-primary">Filters</h3>
                <div className="flex items-center gap-3">
                  {count > 0 && (
                    <button
                      onClick={() => onChange(EMPTY_FILTERS)}
                      className="text-[13px] font-medium text-red-500"
                    >
                      Clear all
                    </button>
                  )}
                  <button
                    onClick={() => setSheetOpen(false)}
                    className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">{body}</div>
              <div className="px-5 py-4 border-t border-gray-100">
                <button
                  onClick={() => setSheetOpen(false)}
                  className="w-full py-3 bg-primary text-text-inverse font-semibold rounded-xl text-[15px] hover:brightness-110 transition-all"
                >
                  Show {resultCount} result{resultCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
