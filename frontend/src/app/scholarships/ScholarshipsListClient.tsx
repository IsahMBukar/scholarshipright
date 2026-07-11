'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import AppLayout from '@/components/AppLayout';
import ScholarshipCard from '@/components/ScholarshipCard';
import FilterPanel, { EMPTY_FILTERS, activeFilterCount, type FilterState } from '@/components/FilterPanel';
import ActiveFilterChips from '@/components/ActiveFilterChips';
import { ScholarshipListSkeleton } from '@/components/Skeletons';
import NotificationBell from '@/components/NotificationBell';
import { useAuth } from '@/hooks/useAuth';
import { logoutAndRedirect } from '@/hooks/useLogout';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import EligibilityWarningModal from '@/components/EligibilityWarningModal';
import { fetchFilterMetadata } from '@/services/api';
import { fetchScholarships, saveScholarship, removeSavedScholarship, fetchSavedScholarships, updateSavedScholarship } from '@/services/api';
import type { Scholarship, ScholarshipListResponse, FilterMetadata } from '@/services/api';
import { filtersToApiParams } from '@/lib/filterParams';
import { NAV_ITEMS } from '@/lib/nav-items';

const TABS = ['Recommended', 'Saved', 'Applied', 'External'];

export default function ScholarshipsListClient({
  initialScholarships,
}: {
  initialScholarships: ScholarshipListResponse;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabFromUrl = searchParams.get('tab');
  const initialTab = TABS.find(t => t.toLowerCase() === tabFromUrl?.toLowerCase()) || 'Recommended';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [scholarships, setScholarships] = useState<Scholarship[]>(initialScholarships.items);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedStatuses, setSavedStatuses] = useState<Record<string, string>>({});
  // When SSR data is available, skip loading skeleton; otherwise show it while client fetches
  const [loading, setLoading] = useState(initialScholarships.items.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialScholarships.total);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [meta, setMeta] = useState<FilterMetadata | null>(null);
  const showConfirm = useConfirm();
  const pathname = usePathname();
  const { isAuthenticated, setPendingAction } = useAuth();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Desktop filter expand/collapse state. Starts collapsed so the user
  // sees maximum scholarship content; expands on click, auto-collapses on scroll.
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  // Eligibility warning modal state
  const [eligibilityModal, setEligibilityModal] = useState<{
    isOpen: boolean;
    reason: string;
    scholarshipUrl: string;
    scholarshipId: string;
  }>({ isOpen: false, reason: '', scholarshipUrl: '', scholarshipId: '' });

  // Profile status comes from the backend — no client-side async check.
  // "anonymous" | "incomplete" | "complete"
  const [profileStatus, setProfileStatus] = useState(initialScholarships.profile_status || 'anonymous');
  const showMatchScores = profileStatus === 'complete';

  // Filter metadata (countries, fields, etc.) is needed by the chip
  // labels in ActiveFilterChips even when the FilterPanel has been
  // closed, so we load it at the page level too. The FilterPanel
  // loads it independently and shows it inline.
  useEffect(() => {
    fetchFilterMetadata().then(setMeta).catch((e) => console.error('[ScholarshipsList] Filter metadata:', e));
  }, []);

  // Fetch scholarships whenever filters or search changes (resets to page 1)
  const loadScholarships = useCallback(async (nextFilters: FilterState, search: string) => {
    setLoading(true);
    try {
      const params = filtersToApiParams(nextFilters, { search, page: '1' });
      const schData = await fetchScholarships(params);
      setScholarships(schData.items || []);
      setTotal(schData.total || 0);
      setProfileStatus(schData.profile_status || 'anonymous');
      setPage(1);
      setError(null);
    } catch (err) {
      console.error('Failed to load scholarships:', err);
      setError('Failed to load scholarships. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load next page and append
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const params = filtersToApiParams(filters, { search: searchQuery, page: String(nextPage) });
      const schData = await fetchScholarships(params);
      setScholarships(prev => [...prev, ...(schData.items || [])]);
      setPage(nextPage);
    } catch (err) {
      console.error('Failed to load more scholarships:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [page, filters, searchQuery, loadingMore]);

  // Initial load: scholarships + saved IDs
  // Always fetch client-side to get personalised profile_status and match
  // scores (SSR fetch is anonymous — no auth cookie).
  useEffect(() => {
    async function init() {
      try {
        const saved = await fetchSavedScholarships().catch((e) => { console.error('[ScholarshipsList] fetchSaved:', e); return []; });
        const ids = new Set<string>();
        const statuses: Record<string, string> = {};
        for (const s of saved as Array<{ scholarship_id?: string; id: string; status?: string }>) {
          const schId = s.scholarship_id || s.id;  // prefer scholarship_id from API
          ids.add(schId);
          statuses[schId] = s.status || 'saved';
        }
        setSavedIds(ids);
        setSavedStatuses(statuses);
      } catch (e) {
        console.error('[ScholarshipsList] Failed to load saved state:', e);
      }
      await loadScholarships(EMPTY_FILTERS, '');
    }
    init();
  }, [loadScholarships, initialScholarships]);

  // Debounced search + filter changes
  // Skip on mount when server-rendered initial data is available and no filters/search active
  const hasInitialData = initialScholarships.items.length > 0;
  useEffect(() => {
    // If we have SSR data and nothing has changed from defaults, skip the redundant fetch
    if (hasInitialData && searchQuery === '' && activeFilterCount(filters) === 0) return;
    const timer = setTimeout(() => {
      loadScholarships(filters, searchQuery);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, filters, loadScholarships, hasInitialData]);

  // Infinite scroll — observe the sentinel at the bottom of the list
  const hasMore = scholarships.length < total;
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' } // trigger slightly before reaching the bottom
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // Auto-collapse desktop filters when user scrolls the main content area.
  // This prevents the filter panel from blocking scholarship cards.
  useEffect(() => {
    const el = document.getElementById('main-content');
    if (!el) return;

    function handleScroll() {
      if (!filtersExpanded) return;
      // Collapse after any meaningful scroll (>10px from top)
      if (el!.scrollTop > 10) {
        setFiltersExpanded(false);
      }
    }

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [filtersExpanded]);

  async function handleSave(id: string) {
    // Action gating: guests see auth modal, then action replays automatically
    if (!isAuthenticated) {
      const sch = scholarships.find((s) => s.id === id);
      setPendingAction({
        type: 'save',
        label: `Save "${sch?.name || 'this scholarship'}"`,
        onReplay: async () => {
          await saveScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
          setSavedIds((prev) => new Set(prev).add(id));
          setSavedStatuses((prev) => ({ ...prev, [id]: 'saved' }));
        },
      });
      return;
    }
    if (savedIds.has(id)) {
      await removeSavedScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
      setSavedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setSavedStatuses((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else {
      await saveScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
      setSavedIds((prev) => new Set(prev).add(id));
      setSavedStatuses((prev) => ({ ...prev, [id]: 'saved' }));
    }
  }

  async function handleApplyNow(id: string) {
    // Action gating for guests
    if (!isAuthenticated) {
      const sch = scholarships.find((s) => s.id === id);
      setPendingAction({
        type: 'apply',
        label: `Apply to "${sch?.name || 'this scholarship'}"`,
        onReplay: async () => {
          if (!savedIds.has(id)) {
            await saveScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
            setSavedIds((prev) => new Set(prev).add(id));
          }
          await updateSavedScholarship(id, { status: 'applying' }).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
          setSavedStatuses((prev) => ({ ...prev, [id]: 'applying' }));
        },
      });
      return;
    }
    // Auto-save if not saved yet
    if (!savedIds.has(id)) {
      await saveScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
      setSavedIds((prev) => new Set(prev).add(id));
    }
    // Set status to applying
    await updateSavedScholarship(id, { status: 'applying' }).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
    setSavedStatuses((prev) => ({ ...prev, [id]: 'applying' }));
  }

  function handleApplyIneligible(id: string, reason: string) {
    const sch = scholarships.find((s) => s.id === id);
    if (!sch) return;
    // Action gating for guests
    if (!isAuthenticated) {
      setPendingAction({
        type: 'apply',
        label: `Apply to "${sch.name || 'this scholarship'}"`,
        onReplay: async () => {
          setEligibilityModal({
            isOpen: true,
            reason,
            scholarshipUrl: sch.official_url,
            scholarshipId: id,
          });
        },
      });
      return;
    }
    setEligibilityModal({
      isOpen: true,
      reason,
      scholarshipUrl: sch.official_url,
      scholarshipId: id,
    });
  }

  function handleEligibilityConfirm() {
    const id = eligibilityModal.scholarshipId;
    // Auto-save and set status to applying (same as handleApplyNow)
    if (!savedIds.has(id)) {
      saveScholarship(id).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
      setSavedIds((prev) => new Set(prev).add(id));
    }
    updateSavedScholarship(id, { status: 'applying' }).catch((e) => console.error('[ScholarshipsList] save/remove:', e));
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
                onClick={() => {
                  setActiveTab(tab);
                  const params = new URLSearchParams(searchParams.toString());
                  if (tab === 'Recommended') params.delete('tab');
                  else params.set('tab', tab.toLowerCase());
                  router.replace(`/scholarships${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
                }}
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
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg pl-3 pr-2 py-1.5 w-[240px] overflow-hidden">
              <span className="material-symbols-outlined text-[18px] text-text-secondary flex-shrink-0">search</span>
              <input
                type="text"
                placeholder="Search scholarships..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-0 text-[13px] bg-transparent outline-none text-text-primary placeholder-text-secondary"
              />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-text-secondary hover:text-text-primary transition-colors">
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
            </div>
            <span className="xl:hidden"><NotificationBell /></span>
          </div>
        </div>

        {/* Filter panel — desktop: inline; mobile: bottom sheet (inside the component) */}
        <div className="mt-3">
          <FilterPanel
            filters={filters}
            onChange={setFilters}
            resultCount={activeTab === 'Saved' || activeTab === 'Applied' ? displayScholarships.length : total}
            collapsed={!filtersExpanded}
            onToggleCollapse={() => setFiltersExpanded((v) => !v)}
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
              <Image src="/images/logo-light.jpg" alt="ScholarshipRight" width={32} height={32} className="h-8 w-8 rounded-lg object-contain" />
              <button onClick={() => setMenuOpen(false)} className="w-10 h-10 flex items-center justify-center" aria-label="Close menu">
                <span className="material-symbols-outlined text-[24px]">close</span>
              </button>
            </div>
            <nav className="flex flex-col p-4 gap-1">
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors
                      ${active
                        ? 'bg-primary/10 text-primary'
                        : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'}`}
                  >
                    <span className={`material-symbols-outlined text-[22px] ${item.soon ? 'opacity-40' : ''}`}>{item.icon}</span>
                    <span className={item.soon ? 'opacity-50' : ''}>{item.label}</span>
                    {item.soon && <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-text-secondary">Soon</span>}
                  </a>
                );
              })}
            </nav>
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 space-y-1">
              <a href="/profile" className="flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-text-secondary hover:bg-gray-100">
                <span className="material-symbols-outlined text-[22px]">settings</span>
                Settings
              </a>
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  const ok = await showConfirm({
                    title: 'Sign out of ScholarshipRight?',
                    description: 'You will be returned to the login page. Any unsaved changes will be lost.',
                    confirmLabel: 'Sign out',
                    cancelLabel: 'Cancel',
                    tone: 'danger',
                  });
                  if (ok) logoutAndRedirect();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium text-red-600 hover:bg-red-50 text-left"
              >
                <span className="material-symbols-outlined text-[22px]">logout</span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 md:px-6 py-4">
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

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-2xl">
            <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
            <p className="flex-1 text-[14px] text-red-700">{error}</p>
            <button
              onClick={() => loadScholarships(filters, searchQuery)}
              className="px-3 py-1.5 bg-red-600 text-white text-[12px] font-bold rounded-btn hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
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
                onApplyIneligible={handleApplyIneligible}
                showMatchScore={showMatchScores}
                isAuthenticated={isAuthenticated}
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
            {/* Infinite scroll sentinel — observer watches this element */}
            {hasMore && activeTab === 'Recommended' && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                    <div className="w-5 h-5 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
                    Loading more scholarships…
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Onboarding nudge — shown below scholarships so cards are always first */}
        {!loading && profileStatus === 'incomplete' && (
          <div className="flex items-start gap-3 p-4 mt-4 bg-primary/8 border border-primary/20 rounded-2xl">
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
      </div>

      {/* Eligibility warning modal */}
      <EligibilityWarningModal
        isOpen={eligibilityModal.isOpen}
        reason={eligibilityModal.reason}
        scholarshipUrl={eligibilityModal.scholarshipUrl}
        onClose={() => setEligibilityModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleEligibilityConfirm}
      />
    </AppLayout>
  );
}
