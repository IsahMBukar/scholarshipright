'use client';

import type { FilterState } from '@/components/FilterPanel';

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  labels?: {
    degree_labels?: Record<string, string>;
    funding_labels?: Record<string, string>;
  };
}

// Renders one chip per non-empty filter value. A "×" on each chip
// removes that single value (e.g. unchecks just one country) rather
// than nuking the whole filter set. Empty? Renders nothing.
export default function ActiveFilterChips({ filters, onChange, labels }: ActiveFilterChipsProps) {
  const chips: Chip[] = [];

  const display = (v: string) =>
    (labels?.degree_labels?.[v] || labels?.funding_labels?.[v] || v);

  filters.countries.forEach((v) =>
    chips.push({
      key: `country-${v}`,
      label: `Country: ${v}`,
      onRemove: () => onChange({ ...filters, countries: filters.countries.filter((x) => x !== v) }),
    }),
  );
  filters.fields.forEach((v) =>
    chips.push({
      key: `field-${v}`,
      label: `Field: ${v}`,
      onRemove: () => onChange({ ...filters, fields: filters.fields.filter((x) => x !== v) }),
    }),
  );
  filters.degrees.forEach((v) =>
    chips.push({
      key: `degree-${v}`,
      label: `Degree: ${display(v)}`,
      onRemove: () => onChange({ ...filters, degrees: filters.degrees.filter((x) => x !== v) }),
    }),
  );
  filters.languageTests.forEach((v) =>
    chips.push({
      key: `test-${v}`,
      label: `Test: ${v}`,
      onRemove: () =>
        onChange({ ...filters, languageTests: filters.languageTests.filter((x) => x !== v) }),
    }),
  );

  if (filters.funding) {
    chips.push({
      key: 'funding',
      label: `Funding: ${display(filters.funding)}`,
      onRemove: () => onChange({ ...filters, funding: '' }),
    });
  }
  if (filters.minStipend) {
    chips.push({
      key: 'stipend',
      label: `Stipend $${filters.minStipend}+`,
      onRemove: () => onChange({ ...filters, minStipend: null }),
    });
  }
  if (filters.noIelts) {
    chips.push({
      key: 'noIelts',
      label: 'No IELTS',
      onRemove: () => onChange({ ...filters, noIelts: false }),
    });
  }
  if (filters.noFee) {
    chips.push({
      key: 'noFee',
      label: 'No app fee',
      onRemove: () => onChange({ ...filters, noFee: false }),
    });
  }
  if (filters.verifiedOnly) {
    chips.push({
      key: 'verified',
      label: 'Verified',
      onRemove: () => onChange({ ...filters, verifiedOnly: false }),
    });
  }
  if (filters.deadlineSoon) {
    chips.push({
      key: 'deadline',
      label: 'Deadline soon',
      onRemove: () => onChange({ ...filters, deadlineSoon: false }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 bg-primary/10 text-text-primary text-[11px] font-semibold rounded-full border border-primary/20"
        >
          {c.label}
          <button
            onClick={c.onRemove}
            className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center"
            aria-label={`Remove ${c.label}`}
          >
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        </span>
      ))}
    </div>
  );
}
