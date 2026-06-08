'use client';

import { useState } from 'react';

interface FilterSidebarProps {
  onFilterChange: (filters: Record<string, string>) => void;
  initialFilters?: Record<string, string>;
}

export default function FilterSidebar({ onFilterChange, initialFilters = {} }: FilterSidebarProps) {
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);

  const updateFilter = (key: string, value: string) => {
    const newFilters = { ...filters };
    if (value) {
      newFilters[key] = value;
    } else {
      delete newFilters[key];
    }
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="bg-surface-white p-6 rounded-xl border border-outline-variant space-y-6 sticky top-20">
      <h3 className="font-headline-md text-headline-md text-on-surface">Filters</h3>

      {/* Degree Level */}
      <div>
        <label className="font-label-md text-on-surface block mb-2">Degree Level</label>
        <select
          className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary-container focus:border-transparent"
          value={filters.degree || ''}
          onChange={(e) => updateFilter('degree', e.target.value)}
        >
          <option value="">All Levels</option>
          <option value="master">Master&apos;s</option>
          <option value="phd">PhD</option>
          <option value="master,phd">Master&apos;s & PhD</option>
        </select>
      </div>

      {/* Country */}
      <div>
        <label className="font-label-md text-on-surface block mb-2">Host Country</label>
        <select
          className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary-container focus:border-transparent"
          value={filters.country || ''}
          onChange={(e) => updateFilter('country', e.target.value)}
        >
          <option value="">All Countries</option>
          <option value="Germany">Germany</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="Japan">Japan</option>
          <option value="United States">United States</option>
          <option value="Canada">Canada</option>
          <option value="Australia">Australia</option>
          <option value="France">France</option>
          <option value="Belgium">Belgium</option>
          <option value="Sweden">Sweden</option>
          <option value="Netherlands">Netherlands</option>
          <option value="Switzerland">Switzerland</option>
          <option value="South Korea">South Korea</option>
          <option value="China">China</option>
          <option value="Turkey">Turkey</option>
        </select>
      </div>

      {/* Funding Type */}
      <div>
        <label className="font-label-md text-on-surface block mb-2">Funding</label>
        <select
          className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary-container focus:border-transparent"
          value={filters.funding || ''}
          onChange={(e) => updateFilter('funding', e.target.value)}
        >
          <option value="">All Types</option>
          <option value="fully_funded">Fully Funded</option>
          <option value="partial">Partial</option>
          <option value="stipend_only">Stipend Only</option>
        </select>
      </div>

      {/* IELTS */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="no_ielts"
          checked={filters.no_ielts === 'true'}
          onChange={(e) => updateFilter('no_ielts', e.target.checked ? 'true' : '')}
          className="w-4 h-4 text-primary border-outline rounded focus:ring-primary-container"
        />
        <label htmlFor="no_ielts" className="font-body-md text-on-surface cursor-pointer">No IELTS Required</label>
      </div>

      {/* Application Fee */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="no_fee"
          checked={filters.no_fee === 'true'}
          onChange={(e) => updateFilter('no_fee', e.target.checked ? 'true' : '')}
          className="w-4 h-4 text-primary border-outline rounded focus:ring-primary-container"
        />
        <label htmlFor="no_fee" className="font-body-md text-on-surface cursor-pointer">No Application Fee</label>
      </div>

      {/* Deadline */}
      <div>
        <label className="font-label-md text-on-surface block mb-2">Deadline Before</label>
        <input
          type="date"
          className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary-container focus:border-transparent"
          value={filters.deadline_before || ''}
          onChange={(e) => updateFilter('deadline_before', e.target.value)}
        />
      </div>

      {/* Sort */}
      <div>
        <label className="font-label-md text-on-surface block mb-2">Sort By</label>
        <select
          className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-2 focus:ring-primary-container focus:border-transparent"
          value={filters.sort || 'deadline_asc'}
          onChange={(e) => updateFilter('sort', e.target.value)}
        >
          <option value="deadline_asc">Deadline (Soonest)</option>
          <option value="newest">Newest First</option>
        </select>
      </div>

      {/* Clear All */}
      <button
        onClick={() => { setFilters({}); onFilterChange({}); }}
        className="w-full py-3 text-primary font-label-md hover:bg-primary-light rounded-lg transition-colors"
      >
        Clear All Filters
      </button>
    </div>
  );
}
