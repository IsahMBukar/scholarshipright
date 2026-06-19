'use client';

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import ScholarshipCard from '@/components/ScholarshipCard';
import FilterPanel, { EMPTY_FILTERS, activeFilterCount, type FilterState } from '@/components/FilterPanel';
import ActiveFilterChips from '@/components/ActiveFilterChips';
import { ScholarshipListSkeleton } from '@/components/Skeletons';
import NotificationBell from '@/components/NotificationBell';
import { useOnboarding } from '@/hooks/useOnboarding';
import { fetchFilterMetadata } from '@/services/api';
import { fetchScholarships, saveScholarship, removeSavedScholarship, fetchSavedScholarships, updateSavedScholarship } from '@/services/api';
import type { Scholarship, ScholarshipListResponse, FilterMetadata } from '@/services/api';
import { filtersToApiParams } from '@/lib/filterParams';

const TABS = ['Recommended', 'Saved', 'Applied', 'External'];

export default function ScholarshipsPage() {
  const [activeTab, setActiveTab] = useState('Recommended');
  const [scholarships, setScholarships] = useState<Scholarship[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedStatuses, setSavedStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [meta, setMeta] = useState<FilterMetadata | null>(null);

  // Match scores are only meaningful once the user has a complete profile.
  // Until then, hide them (and the deterministic placeholder) so we don't
  // mislead the user with fake numbers.
  const ob = useOnboarding();
  const showMatchScores = !ob.loading && ob.hasProfile;

  // Filter metadata (countries, fields, etc.) is needed by the chip
  // labels in ActiveFilterChips even when the FilterPanel has been
  // closed, so we load it at the page level too. The FilterPanel
  // loads it independently and shows it inline.
  useEffect(() => {
    fetchFilterMetadata().then(setMeta).catch(() => {});
  }, []);

  // Fetch scholarships whenever filters or search changes
  const loadScholarships = useCallback(async (nextFilters: FilterState, search: string) => {
    setLoading(true);
    try {
      const params = filtersToApiParams(nextFilters, { search });
      const schData = await fetchScholarships(params);
      setScholarships(schData.items || []);
      setTotal(schData.total || 0);
    } catch (err) {
      console.error('Failed to load scholarships:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: scholarships + saved IDs
  useEffect(() => {
    async function init() {
      try {
        const saved = await fetchSavedScholarships().catch(() => []);
        const ids = new Set<string>();
        const statuses: Record<string, string> = {};
        for (const s of saved as any[]) {
          const schId = s.scholarship_id || s.id;  // prefer scholarship_id from API
          ids.add(schId);
          statuses[schId] = s.status || 'saved';
        }
        setSavedIds(ids);
        setSavedStatuses(statuses);
      } catch {}
      await loadScholarships(EMPTY_FILTERS, '');
    }
    init();
  }, [loadScholarships]);

  // Debounced search + filter changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadScholarships(filters, searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, loadScholarships]);

  async function handleSave(id: string) {
    if (savedIds.has(id)) {
      await removeSavedScholarship(id).catch(() => {});
      setSavedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setSavedStatuses((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      await saveScholarship(id).catch(() => {});
      setSavedIds((prev) => new Set(prev).add(id));
      setSavedStatuses((prev) => ({ ...prev, [id]: 'saved' }));
    }
  }

  async function handleApplyNow(id: string) {
    // Auto-save if not saved yet
    if (!savedIds.has(id)) {
      await saveScholarship(id).catch(() => {});
      setSavedIds((prev) => new Set(prev).add(id));
    }
    // Set status to applying
    await updateSavedScholarship(id, { status: 'applying' }).catch(() => {});
    setSavedStatuses((prev) => ({ ...prev, [id]: 'applying' }));
  }

  // Filter scholarships for Saved/Applied tabs (client-side from savedIds)
  const displayScholarships = activeTab === 'Saved'
    ? scholarships.filter(s => savedIds.has(s.id) && (savedStatuses[s.id] || 'saved') === 'saved')
    : activeTab === 'Applied'
    ? scholarships.filter(s => savedIds.has(s.id) && ['applying', 'applied', 'reviewing', 'accepted', 'rejected'].includes(savedStatuses[s.id] || ''))
    : scholarships;

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
          <div className="flex-shrink-0 md:hidden">
            <NotificationBell />
          </div>
          <div className="hidden md:flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 w-[220px]">
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
            <NotificationBell />
          </div>
        </div>

        {/* Filter panel — desktop: inline; mobile: bottom sheet (inside the component) */}
        <div className="mt-3">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            resultCount={total}
          />
        </div>
      </div>
      </div>

      {/* Mobile slide-in menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-0 left-0 w-[280px] h-full bg-white shadow-xl animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <img src="/images/logo-light.jpg" alt="ScholarshipRight" className="h-8 w-8 rounded-lg object-contain" />
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
        {/* Onboarding nudge for users without a complete profile */}
        {!ob.loading && !ob.hasProfile && ob.authenticated && (
          <div className="flex items-start gap-3 p-4 mb-4 bg-primary/8 border border-primary/20 rounded-2xl">
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-primary text-[18px]">school</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-text-primary">
                Complete your profile to unlock match scores
              </p>
              <p className="text-[12px] text-text-secondary mt-0.5">
                You can browse scholarships now — personalised match scores appear once you
                add your degree, field, country and language scores.
              </p>
            </div>
            <a
              href="/profile"
              className="self-center px-3.5 py-1.5 bg-primary text-text-inverse text-[12px] font-bold rounded-btn hover:brightness-110 transition-all flex-shrink-0"
            >
              Complete →
            </a>
          </div>
        )}

        {/* Active filter chips + result count */}
        {!loading && (
          <div className="flex flex-col gap-2 mb-3">
            <ActiveFilterChips
              filters={filters}
              onChange={setFilters}
              labels={meta ? { degree_labels: meta.degree_labels, funding_labels: meta.funding_labels } : undefined}
            />
            <p className="text-[12px] text-text-secondary">
              <strong className="text-text-primary">{total}</strong> scholarship{total !== 1 ? 's' : ''} found
            </p>
          </div>
        )}

        {/* Scholarship feed */}
        {loading ? (
          <ScholarshipListSkeleton count={4} />
        ) : (
          <div className="flex flex-col gap-4">
            {displayScholarships.map((sch) => (
              <ScholarshipCard
                key={sch.id}
                scholarship={sch}
                onSave={handleSave}
                isSaved={savedIds.has(sch.id)}
                savedStatus={savedStatuses[sch.id]}
                onApplyNow={handleApplyNow}
                showMatchScore={showMatchScores}
              />
            ))}
            {displayScholarships.length === 0 && (
              <div className="text-center py-16">
                <span className="material-symbols-outlined text-5xl text-text-secondary mb-4 block">search_off</span>
                <p className="text-[16px] text-text-secondary">
                  {activeTab === 'Saved' ? 'No saved scholarships yet' : activeTab === 'Applied' ? 'No applications started yet' : 'No scholarships match your filters'}
                </p>
                {activeFilterCount(filters) > 0 && (
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="mt-3 text-[13px] text-primary font-medium hover:underline"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
