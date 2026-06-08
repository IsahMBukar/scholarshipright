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
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
        <div className="flex items-center gap-2 md:gap-6 mb-4 border-b border-gray-200 pb-3">
          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden w-10 h-10 flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[24px]">{menuOpen ? 'close' : 'menu'}</span>
          </button>
          <h1 className="hidden md:block text-[20px] font-bold text-text-primary">SCHOLARSHIPS</h1>
          <div className="flex justify-around flex-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`text-[13px] md:text-[15px] font-semibold pb-3 transition-colors relative whitespace-nowrap
                  ${activeTab === tab
                    ? 'text-text-primary border-b-[3px] border-black'
                    : 'text-text-secondary hover:text-text-primary'
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2 ml-auto bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-[220px]">
            <span className="material-symbols-outlined text-[18px] text-text-secondary">search</span>
            <input
              type="text"
              placeholder="Search scholarships..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-[13px] bg-transparent outline-none text-text-primary placeholder-text-secondary"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-text-secondary hover:text-text-primary">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar activeFilters={activeFilters} onToggleFilter={toggleFilter} />
      </div>
      </div>

      {/* Mobile slide-in menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-0 left-0 w-[280px] h-full bg-white shadow-xl animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <span className="text-[18px] font-extrabold text-primary">ScholarshipRight</span>
              <button onClick={() => setMenuOpen(false)} className="w-10 h-10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              {[
                { label: 'Scholarships', icon: 'school', href: '/scholarships' },
                { label: 'Resume', icon: 'description', href: '/resume' },
                { label: 'Profile', icon: 'person', href: '/profile' },
                { label: 'Agent', icon: 'smart_toy', href: '/chat' },
                { label: 'Coaching', icon: 'record_voice_over', href: '/coaching' },
                { label: 'Interview', icon: 'quiz', href: '/interview' },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-text-secondary hover:bg-gray-100 hover:text-text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
              <a href="/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-text-secondary hover:bg-gray-100">
                <span className="material-symbols-outlined text-[22px]">settings</span>
                Settings
              </a>
            </div>
          </div>
        </div>
      )}

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
            {scholarships
              .filter((sch) => {
                if (!searchQuery) return true;
                const q = searchQuery.toLowerCase();
                return (
                  sch.name?.toLowerCase().includes(q) ||
                  sch.provider?.toLowerCase().includes(q) ||
                  sch.host_institution?.toLowerCase().includes(q) ||
                  sch.host_country?.toLowerCase().includes(q) ||
                  sch.fields_of_study?.some(f => f.toLowerCase().includes(q))
                );
              })
              .map((sch) => (
                <ScholarshipCard
                  key={sch.id}
                  scholarship={sch}
                  onSave={handleSave}
                  isSaved={savedIds.has(sch.id)}
                />
              ))
            }
            {scholarships.filter((sch) => {
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return (
                sch.name?.toLowerCase().includes(q) ||
                sch.provider?.toLowerCase().includes(q) ||
                sch.host_institution?.toLowerCase().includes(q) ||
                sch.host_country?.toLowerCase().includes(q) ||
                sch.fields_of_study?.some(f => f.toLowerCase().includes(q))
              );
            }).length === 0 && (
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
