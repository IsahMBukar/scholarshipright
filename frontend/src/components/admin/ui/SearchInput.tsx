'use client';

// Search input with a proper label (screen-reader-accessible).

import { Search } from 'lucide-react';

export interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  widthClass?: string;
  className?: string;
}

export default function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  widthClass = 'w-64',
  className,
}: SearchInputProps) {
  const id = `search-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={`relative ${widthClass} ${className ?? ''}`}>
      <Search
        className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-secondary pointer-events-none"
        aria-hidden="true"
      />
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full pl-7 pr-2 text-sm bg-white border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
      />
    </div>
  );
}
