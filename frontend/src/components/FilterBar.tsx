'use client';

const FILTER_CHIPS = [
  { label: 'Country', icon: 'public' },
  { label: 'Field', icon: 'science' },
  { label: 'Master', icon: 'school' },
  { label: 'PhD', icon: 'psychology' },
  { label: 'Fully Funded', icon: 'payments' },
  { label: 'No IELTS', icon: 'g_translate' },
  { label: 'Deadline Soon', icon: 'schedule' },
];

interface FilterBarProps {
  activeFilters?: string[];
  onToggleFilter?: (filter: string) => void;
}

export default function FilterBar({ activeFilters = [], onToggleFilter }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto py-2 no-scrollbar">
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
  );
}
