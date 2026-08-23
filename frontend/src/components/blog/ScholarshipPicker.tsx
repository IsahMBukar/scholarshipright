'use client';

import { useState, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/env';

export interface SchSearchResult {
  id: string;
  slug: string;
  name: string;
  host_country: string;
  provider?: string;
  deadline?: string;
  funding_type?: string;
  degree_levels: string[];
}

export function ScholarshipPicker({
  onSelect,
  selectedSlugs,
}: {
  onSelect: (sch: SchSearchResult) => void;
  selectedSlugs: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SchSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/scholarships?search=${encodeURIComponent(q)}&limit=8`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setResults(data.items || data.scholarships || []);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return (
    <div className="relative">
      <div className="relative flex-1">
        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
        <input
          type="text"
          placeholder="Search scholarships to tag..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            search(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[#f0ebe0] bg-white text-sm text-[#1a1a1a] placeholder:text-gray-400 focus:outline-none focus:border-[#f5b942] focus:ring-2 focus:ring-[#f5b942]/20 transition"
        />
      </div>
      {open && query.trim() && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl border border-[#f0ebe0] shadow-lg max-h-64 overflow-y-auto">
          {loading && <div className="p-4 text-center text-sm text-gray-400">Searching...</div>}
          {!loading && results.length === 0 && <div className="p-4 text-center text-sm text-gray-400">No scholarships found</div>}
          {!loading &&
            results.map((sch) => {
              const isSelected = selectedSlugs.has(sch.slug);
              return (
                <button
                  key={sch.id}
                  onClick={() => {
                    if (!isSelected) onSelect(sch);
                    setQuery('');
                    setResults([]);
                    setOpen(false);
                  }}
                  disabled={isSelected}
                  className={`w-full text-left px-4 py-3 hover:bg-[#fdfbf7] transition border-b border-[#f0ebe0] last:border-0 ${isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1a1a1a] truncate">{sch.name}</p>
                      <p className="text-xs text-gray-500">{sch.provider && <span>{sch.provider} · </span>}{sch.host_country}</p>
                    </div>
                    {isSelected && <span className="text-xs text-emerald-600 font-medium flex-shrink-0">✓ Tagged</span>}
                  </div>
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
