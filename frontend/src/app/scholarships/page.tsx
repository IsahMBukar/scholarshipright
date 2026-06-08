'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import ScholarshipCard from '@/components/ScholarshipCard';
import FilterBar from '@/components/FilterBar';
import { fetchScholarships, saveScholarship, removeSavedScholarship, fetchSavedScholarships } from '@/services/api';
import type { Scholarship, ScholarshipListResponse } from '@/services/api';

const TABS = ['Recommended', 'Saved', 'Applied', 'External'];

export default function ScholarshipsPage() {
  const [activeTab, setActiveTab] = useState('Recommended');
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [schData, saved] = await Promise.all([
        fetchScholarships({ page: '1', limit: '20' }),
        fetchSavedScholarships().catch(() => []),
      ]);
      setScholarships(schData.items || []);
      setTotal(schData.total || 0);
      setSavedIds(new Set(saved.map((s: any) => s.id)));
    } catch (err) {
      console.error('Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(id: string) {
    if (savedIds.has(id)) {
      await removeSavedScholarship(id).catch(() => {});
      setSavedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } else {
      await saveScholarship(id).catch(() => {});
      setSavedIds((prev) => new Set(prev).add(id));
    }
  }

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    );
  }

  return (
    <AppLayout>
      {/* Sticky header: tabs + filters */}
      <div className="sticky top-0 z-40 bg-gray-100">
      <div className="px-4 md:px-6 py-4">
        {/* Header tabs */}
        <div className="flex items-center gap-6 mb-4 border-b border-gray-200 pb-3">
          <h1 className="text-[20px] font-bold text-text-primary">SCHOLARSHIPS</h1>
          <div className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-[15px] font-semibold pb-3 transition-colors relative
                  ${activeTab === tab
                    ? 'text-text-primary border-b-[3px] border-black'
                    : 'text-text-secondary hover:text-text-primary'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <span className="text-[13px] text-text-secondary ml-auto">{total} scholarships</span>
        </div>

        {/* Filter bar */}
        <FilterBar activeFilters={activeFilters} onToggleFilter={toggleFilter} />
      </div>
      </div>

      <div className="px-4 md:px-6 py-4">
        {/* Scholarship feed */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-[160px] bg-white rounded-card animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {scholarships.map((sch) => (
              <ScholarshipCard
                key={sch.id}
                scholarship={sch}
                onSave={handleSave}
                isSaved={savedIds.has(sch.id)}
              />
            ))}
            {scholarships.length === 0 && (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-text-secondary mb-4 block">search_off</span>
                <p className="text-[16px] text-text-secondary">No scholarships found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
