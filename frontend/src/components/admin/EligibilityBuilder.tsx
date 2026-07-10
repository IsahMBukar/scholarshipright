'use client';

// Visual composer for scholarship eligibility rules.
//
// Replaces the old separate eligible_nationalities + eligible_regions
// MultiSelects with a single unified builder that supports:
//   - Include: groups (e.g. "Africa", "EU") or individual countries
//   - Exclude: groups or individual countries
//   - Live preview of resolved country count
//
// The backend resolves the final country list at write time:
//   resolved = (included_groups + included_countries) − (excluded_groups + excluded_countries)

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Plus,
  Minus,
  X,
  Globe,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  Users,
  MapPin,
  Search,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/admin/api';
import type { CountryOption, AdminCountryGroup } from '@/lib/admin/types';

// ── Types ─────────────────────────────────────────────────────────

export interface EligibilityRule {
  type: 'group' | 'country';
  code: string;
  label: string;
}

export interface EligibilityValue {
  included: EligibilityRule[];
  excluded: EligibilityRule[];
  basis: 'citizenship' | 'residency' | 'either';
}

interface EligibilityBuilderProps {
  includedGroups: string[];
  includedCountries: string[];
  excludedGroups: string[];
  excludedCountries: string[];
  basis: 'citizenship' | 'residency' | 'either';
  onChange: (val: {
    included_groups: string[];
    included_countries: string[];
    excluded_groups: string[];
    excluded_countries: string[];
    eligibility_basis: 'citizenship' | 'residency' | 'either';
  }) => void;
}

// ── Rule Chip ─────────────────────────────────────────────────────

function RuleChip({
  rule,
  variant,
  onRemove,
}: {
  rule: EligibilityRule;
  variant: 'include' | 'exclude';
  onRemove: () => void;
}) {
  const isGroup = rule.type === 'group';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        variant === 'include'
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-red-50 text-red-700 border border-red-200'
      }`}
    >
      {isGroup ? <Users className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
      <span>{rule.label}</span>
      <span className="text-[10px] opacity-60">
        {isGroup ? 'group' : rule.code}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 hover:opacity-80"
        aria-label={`Remove ${rule.label}`}
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ── Add Rule Popover ──────────────────────────────────────────────

function AddRulePopover({
  groups,
  countries,
  existingCodes,
  onSelect,
  onClose,
}: {
  groups: AdminCountryGroup[];
  countries: CountryOption[];
  existingCodes: Set<string>;
  onSelect: (rule: EligibilityRule) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'groups' | 'countries'>('groups');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    return groups
      .filter(
        (g) =>
          g.status === 'active' &&
          !existingCodes.has(`group:${g.code}`) &&
          (!q || g.name.toLowerCase().includes(q) || g.code.toLowerCase().includes(q))
      )
      .slice(0, 20);
  }, [groups, search, existingCodes]);

  const filteredCountries = useMemo(() => {
    const q = search.toLowerCase();
    return countries
      .filter(
        (c) =>
          !existingCodes.has(`country:${c.code}`) &&
          (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      )
      .slice(0, 30);
  }, [countries, search, existingCodes]);

  const handleSelectGroup = (g: AdminCountryGroup) => {
    onSelect({ type: 'group', code: g.code, label: g.name });
  };

  const handleSelectCountry = (c: CountryOption) => {
    onSelect({ type: 'country', code: c.code, label: c.name });
  };

  return (
    <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups or countries…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:ring-1 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100">
        <button
          type="button"
          onClick={() => setTab('groups')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            tab === 'groups'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-3 h-3 inline mr-1" />
          Groups ({filteredGroups.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('countries')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium ${
            tab === 'countries'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <MapPin className="w-3 h-3 inline mr-1" />
          Countries ({filteredCountries.length})
        </button>
      </div>

      {/* Results */}
      <div className="max-h-52 overflow-y-auto">
        {tab === 'groups' &&
          (filteredGroups.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {search ? 'No matching groups' : 'All groups already added'}
            </div>
          ) : (
            filteredGroups.map((g) => (
              <button
                key={g.code}
                type="button"
                onClick={() => handleSelectGroup(g)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-gray-400 ml-1 text-xs">({g.code})</span>
                </span>
                <span className="text-xs text-gray-400">{g.member_count} countries</span>
              </button>
            ))
          ))}
        {tab === 'countries' &&
          (filteredCountries.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">
              {search ? 'No matching countries' : 'All countries already added'}
            </div>
          ) : (
            filteredCountries.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => handleSelectCountry(c)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center justify-between"
              >
                <span>{c.name}</span>
                <span className="text-xs text-gray-400">{c.code}</span>
              </button>
            ))
          ))}
      </div>

      {/* Close */}
      <div className="p-1.5 border-t border-gray-100">
        <button
          type="button"
          onClick={onClose}
          className="w-full text-center text-xs text-gray-500 hover:text-gray-700 py-1"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Preview Panel ─────────────────────────────────────────────────

function EligibilityPreview({
  includedGroups,
  includedCountries,
  excludedGroups,
  excludedCountries,
}: {
  includedGroups: string[];
  includedCountries: string[];
  excludedGroups: string[];
  excludedCountries: string[];
}) {
  const [expanded, setExpanded] = useState(false);

  const hasRules =
    includedGroups.length > 0 ||
    includedCountries.length > 0 ||
    excludedGroups.length > 0 ||
    excludedCountries.length > 0;

  // Debounced preview query
  const [debouncedBody, setDebouncedBody] = useState({
    included_groups: includedGroups,
    included_countries: includedCountries,
    excluded_groups: excludedGroups,
    excluded_countries: excludedCountries,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedBody({
        included_groups: includedGroups,
        included_countries: includedCountries,
        excluded_groups: excludedGroups,
        excluded_countries: excludedCountries,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [includedGroups, includedCountries, excludedGroups, excludedCountries]);

  const preview = useQuery({
    queryKey: ['admin', 'eligibility-preview', debouncedBody],
    queryFn: () => adminApi.previewEligibility(debouncedBody),
    enabled: hasRules,
    staleTime: 10_000,
  });

  if (!hasRules) {
    return (
      <div className="text-xs text-text-secondary bg-gray-50 rounded-lg p-3">
        <Globe className="w-3.5 h-3.5 inline mr-1 opacity-50" />
        No rules set — scholarship will be open to all countries.
      </div>
    );
  }

  const count = preview.data?.resolved_count;
  const unresolved = preview.data?.unresolved;
  const countries: { code: string; name: string }[] = preview.data?.countries ?? [];

  return (
    <div className="bg-primary/5 border border-primary/10 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {preview.isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          ) : (
            <Globe className="w-3.5 h-3.5 text-primary" />
          )}
          <span className="text-sm font-medium text-text-primary">
            {preview.isLoading
              ? 'Computing…'
              : `${count ?? 0} ${count === 1 ? 'country' : 'countries'} eligible`}
          </span>
          {unresolved && (
            <span className="text-xs text-amber-600 flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" />
              partial
            </span>
          )}
        </div>
        {count !== undefined && count > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            {expanded ? 'Hide' : 'Show'} list
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>
      {expanded && countries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {countries.map((c) => (
            <span
              key={c.code}
              className="text-[10px] px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-600"
            >
              {c.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────

export default function EligibilityBuilder({
  includedGroups,
  includedCountries,
  excludedGroups,
  excludedCountries,
  basis,
  onChange,
}: EligibilityBuilderProps) {
  const [addingTo, setAddingTo] = useState<'include' | 'exclude' | null>(null);

  // Fetch groups and countries for the pickers
  const groupsQuery = useQuery({
    queryKey: ['admin', 'groups', { status: 'active' }],
    queryFn: () => adminApi.listGroups({ status: 'active' }),
    staleTime: 300_000,
  });

  const countriesQuery = useQuery({
    queryKey: ['admin', 'countries'],
    queryFn: () => adminApi.listCountries(),
    staleTime: 300_000,
  });

  const groups = groupsQuery.data?.items ?? [];
  const countries = countriesQuery.data ?? [];

  // Build lookup maps for labels
  const groupMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) m.set(g.code, g.name);
    return m;
  }, [groups]);

  const countryMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of countries) m.set(c.code, c.name);
    return m;
  }, [countries]);

  // Convert code arrays to rule arrays for display
  const includedRules: EligibilityRule[] = useMemo(() => {
    const rules: EligibilityRule[] = [];
    for (const code of includedGroups) {
      rules.push({ type: 'group', code, label: groupMap.get(code) ?? code });
    }
    for (const code of includedCountries) {
      rules.push({ type: 'country', code, label: countryMap.get(code) ?? code });
    }
    return rules;
  }, [includedGroups, includedCountries, groupMap, countryMap]);

  const excludedRules: EligibilityRule[] = useMemo(() => {
    const rules: EligibilityRule[] = [];
    for (const code of excludedGroups) {
      rules.push({ type: 'group', code, label: groupMap.get(code) ?? code });
    }
    for (const code of excludedCountries) {
      rules.push({ type: 'country', code, label: countryMap.get(code) ?? code });
    }
    return rules;
  }, [excludedGroups, excludedCountries, groupMap, countryMap]);

  // Existing codes set (to prevent duplicates in the picker)
  const existingCodes = useMemo(() => {
    const s = new Set<string>();
    for (const code of includedGroups) s.add(`group:${code}`);
    for (const code of includedCountries) s.add(`country:${code}`);
    for (const code of excludedGroups) s.add(`group:${code}`);
    for (const code of excludedCountries) s.add(`country:${code}`);
    return s;
  }, [includedGroups, includedCountries, excludedGroups, excludedCountries]);

  // Handlers
  const handleAddRule = useCallback(
    (target: 'include' | 'exclude', rule: EligibilityRule) => {
      if (rule.type === 'group') {
        if (target === 'include') {
          onChange({
            included_groups: [...includedGroups, rule.code],
            included_countries: includedCountries,
            excluded_groups: excludedGroups,
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        } else {
          onChange({
            included_groups: includedGroups,
            included_countries: includedCountries,
            excluded_groups: [...excludedGroups, rule.code],
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        }
      } else {
        if (target === 'include') {
          onChange({
            included_groups: includedGroups,
            included_countries: [...includedCountries, rule.code],
            excluded_groups: excludedGroups,
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        } else {
          onChange({
            included_groups: includedGroups,
            included_countries: includedCountries,
            excluded_groups: excludedGroups,
            excluded_countries: [...excludedCountries, rule.code],
            eligibility_basis: basis,
          });
        }
      }
      setAddingTo(null);
    },
    [includedGroups, includedCountries, excludedGroups, excludedCountries, basis, onChange]
  );

  const handleRemoveRule = useCallback(
    (target: 'include' | 'exclude', rule: EligibilityRule) => {
      if (target === 'include') {
        if (rule.type === 'group') {
          onChange({
            included_groups: includedGroups.filter((c) => c !== rule.code),
            included_countries: includedCountries,
            excluded_groups: excludedGroups,
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        } else {
          onChange({
            included_groups: includedGroups,
            included_countries: includedCountries.filter((c) => c !== rule.code),
            excluded_groups: excludedGroups,
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        }
      } else {
        if (rule.type === 'group') {
          onChange({
            included_groups: includedGroups,
            included_countries: includedCountries,
            excluded_groups: excludedGroups.filter((c) => c !== rule.code),
            excluded_countries: excludedCountries,
            eligibility_basis: basis,
          });
        } else {
          onChange({
            included_groups: includedGroups,
            included_countries: includedCountries,
            excluded_groups: excludedGroups,
            excluded_countries: excludedCountries.filter((c) => c !== rule.code),
            eligibility_basis: basis,
          });
        }
      }
    },
    [includedGroups, includedCountries, excludedGroups, excludedCountries, basis, onChange]
  );

  const handleBasisChange = useCallback(
    (newBasis: 'citizenship' | 'residency' | 'either') => {
      onChange({
        included_groups: includedGroups,
        included_countries: includedCountries,
        excluded_groups: excludedGroups,
        excluded_countries: excludedCountries,
        eligibility_basis: newBasis,
      });
    },
    [includedGroups, includedCountries, excludedGroups, excludedCountries, onChange]
  );

  return (
    <div className="space-y-3">
      {/* Eligibility basis */}
      <div>
        <label className="text-xs font-medium text-text-secondary block mb-1">
          Eligibility based on
        </label>
        <div className="flex gap-2">
          {(['citizenship', 'residency', 'either'] as const).map((val) => (
            <button
              key={val}
              type="button"
              onClick={() => handleBasisChange(val)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                basis === val
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {val === 'either' ? 'Citizenship or residency' : val}
            </button>
          ))}
        </div>
      </div>

      {/* Include section */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
              Include
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAddingTo(addingTo === 'include' ? null : 'include')}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        <div className="min-h-[36px] p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg">
          {includedRules.length === 0 ? (
            <span className="text-xs text-gray-400">
              No include rules — open to all countries
            </span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {includedRules.map((rule) => (
                <RuleChip
                  key={`${rule.type}:${rule.code}`}
                  rule={rule}
                  variant="include"
                  onRemove={() => handleRemoveRule('include', rule)}
                />
              ))}
            </div>
          )}
        </div>
        {addingTo === 'include' && (
          <AddRulePopover
            groups={groups}
            countries={countries}
            existingCodes={existingCodes}
            onSelect={(rule) => handleAddRule('include', rule)}
            onClose={() => setAddingTo(null)}
          />
        )}
      </div>

      {/* Exclude section */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Minus className="w-3.5 h-3.5 text-red-600" />
            <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
              Exclude
            </span>
          </div>
          <button
            type="button"
            onClick={() => setAddingTo(addingTo === 'exclude' ? null : 'exclude')}
            className="text-xs text-primary hover:underline flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            Add
          </button>
        </div>
        <div className="min-h-[36px] p-2 bg-red-50/50 border border-red-100 rounded-lg">
          {excludedRules.length === 0 ? (
            <span className="text-xs text-gray-400">No exclusions</span>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {excludedRules.map((rule) => (
                <RuleChip
                  key={`${rule.type}:${rule.code}`}
                  rule={rule}
                  variant="exclude"
                  onRemove={() => handleRemoveRule('exclude', rule)}
                />
              ))}
            </div>
          )}
        </div>
        {addingTo === 'exclude' && (
          <AddRulePopover
            groups={groups}
            countries={countries}
            existingCodes={existingCodes}
            onSelect={(rule) => handleAddRule('exclude', rule)}
            onClose={() => setAddingTo(null)}
          />
        )}
      </div>

      {/* Live preview */}
      <EligibilityPreview
        includedGroups={includedGroups}
        includedCountries={includedCountries}
        excludedGroups={excludedGroups}
        excludedCountries={excludedCountries}
      />
    </div>
  );
}
