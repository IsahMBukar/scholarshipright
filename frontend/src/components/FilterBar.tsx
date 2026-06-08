'use client';

import { useState } from 'react';

const FILTER_CHIPS = [
  { label: 'Country', icon: 'public', group: 'Location' },
  { label: 'Field', icon: 'science', group: 'Study' },
  { label: 'Master', icon: 'school', group: 'Degree' },
  { label: 'PhD', icon: 'psychology', group: 'Degree' },
  { label: 'Fully Funded', icon: 'payments', group: 'Funding' },
  { label: 'No IELTS', icon: 'g_translate', group: 'Requirements' },
  { label: 'Deadline Soon', icon: 'schedule', group: 'Timing' },
];

interface FilterBarProps {
  activeFilters?: string[];
  onToggleFilter?: (filter: string) => void;
}

export default function FilterBar({ activeFilters = [], onToggleFilter }: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      {/* DESKTOP: horizontal chips */}
      <div className="hidden md:flex items-center gap-2 overflow-x-auto py-2 no-scrollbar">
        {FILTER_CHIPS.map((chip) => {
          const isActive = activeFilters.includes(chip.label);
          return (
            <button
              key={chip.label}
              onClick={() => onToggleFilter?.(chip.label)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-chip text-[14px] font-medium whitespace-nowrap transition-all
                ${isActive
                  ? 'bg-primary text-text-inverse'
                  : 'bg-gray-100 text-text-primary hover:bg-gray-200'
                }`}
            >
              <span className="material-symbols-outlined text-[16px]">{chip.icon}</span>
              {chip.label}
            </button>
          );
        })}
        <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-chip text-[14px] font-medium bg-gray-100 text-text-secondary hover:bg-gray-200 whitespace-nowrap">
          <span className="material-symbols-outlined text-[16px]">tune</span>
          All Filters
        </button>
      </div>

      {/* MOBILE: compact filter bar */}
      <div className="flex md:hidden items-center gap-2 py-2">
        <button
          onClick={() => setSheetOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-chip text-[13px] font-medium bg-gray-100 text-text-primary border border-gray-200"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span>
          Filters
          {activeFilters.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center">
              {activeFilters.length}
            </span>
          )}
        </button>
        {/* Quick chips — horizontal scroll */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar flex-1">
          {FILTER_CHIPS.slice(0, 4).map((chip) => {
            const isActive = activeFilters.includes(chip.label);
            return (
              <button
                key={chip.label}
                onClick={() => onToggleFilter?.(chip.label)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-chip text-[12px] font-medium whitespace-nowrap transition-all flex-shrink-0
                  ${isActive
                    ? 'bg-primary text-white'
                    : 'bg-gray-50 text-text-secondary border border-gray-200'
                  }`}
              >
                <span className="material-symbols-outlined text-[14px]">{chip.icon}</span>
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MOBILE: Bottom sheet */}
      {sheetOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setSheetOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl animate-slide-up max-h-[70vh] flex flex-col">
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-[17px] font-bold text-text-primary">Filters</h3>
              <div className="flex items-center gap-3">
                {activeFilters.length > 0 && (
                  <button
                    onClick={() => activeFilters.forEach(f => onToggleFilter?.(f))}
                    className="text-[13px] font-medium text-red-500"
                  >
                    Clear all
                  </button>
                )}
                <button onClick={() => setSheetOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Filter options */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {['Degree', 'Funding', 'Requirements', 'Location', 'Study', 'Timing'].map((group) => {
                const groupChips = FILTER_CHIPS.filter(c => c.group === group);
                if (groupChips.length === 0) return null;
                return (
                  <div key={group}>
                    <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary mb-2.5">{group}</h4>
                    <div className="flex flex-wrap gap-2">
                      {groupChips.map((chip) => {
                        const isActive = activeFilters.includes(chip.label);
                        return (
                          <button
                            key={chip.label}
                            onClick={() => onToggleFilter?.(chip.label)}
                            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[14px] font-medium transition-all
                              ${isActive
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-gray-50 text-text-primary border border-gray-200'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[16px]">{chip.icon}</span>
                            {chip.label}
                            {isActive && <span className="material-symbols-outlined text-[14px]">check</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Apply button */}
            <div className="px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setSheetOpen(false)}
                className="w-full py-3 bg-primary text-white font-semibold rounded-xl text-[15px] hover:brightness-110 transition-all"
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
