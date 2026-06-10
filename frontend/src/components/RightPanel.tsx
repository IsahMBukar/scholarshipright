'use client';

import { useState, useEffect } from 'react';
import { fetchProfile, fetchSavedScholarships, fetchScholarships, type Profile, type Scholarship } from '@/services/api';
import { useRouter } from 'next/navigation';

export default function RightPanel() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scholarshipCount, setScholarshipCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [deadlines, setDeadlines] = useState<Array<{ name: string; slug: string; days: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [profileData, scholarships, saved] = await Promise.allSettled([
          fetchProfile(),
          fetchScholarships({ limit: '100' }),
          fetchSavedScholarships(),
        ]);

        if (profileData.status === 'fulfilled') setProfile(profileData.value);
        if (scholarships.status === 'fulfilled') {
          setScholarshipCount(scholarships.value.total);
          // Get upcoming deadlines
          const now = new Date();
          const upcoming = scholarships.value.items
            .filter(s => s.deadline && new Date(s.deadline) > now)
            .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
            .slice(0, 5)
            .map(s => {
              const days = Math.ceil((new Date(s.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              return { name: s.name, slug: s.slug, days };
            });
          setDeadlines(upcoming);
        }
        if (saved.status === 'fulfilled') setSavedCount(saved.value.length);
      } catch (err) {
        console.error('RightPanel load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Calculate profile completion
  const completionFields = [
    profile?.degree_level,
    profile?.field_of_study,
    profile?.university,
    profile?.country_of_origin,
    profile?.target_degree,
    profile?.target_countries?.length,
    profile?.cgpa,
  ];
  const filledCount = completionFields.filter(Boolean).length;
  const completionPct = Math.round((filledCount / completionFields.length) * 100);

  const initial = (profile as any)?.full_name?.[0]?.toUpperCase()
    || profile?.field_of_study?.[0]?.toUpperCase()
    || 'U';

  const displayName = (profile as any)?.full_name
    || profile?.university
    || 'Student';

  return (
    <aside className="hidden xl:flex flex-col w-[240px] h-full border-l border-gray-200 bg-white p-5 overflow-y-auto">
      {/* Profile Summary */}
      <button onClick={() => router.push('/profile')} className="mb-6 text-left group">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-text-inverse font-bold text-[16px]">
            {loading ? '...' : initial}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-text-primary group-hover:text-primary transition-colors">
              {loading ? 'Loading...' : displayName}
            </p>
            <p className="text-[12px] text-text-secondary">
              {loading ? '...' : `Profile ${completionPct}% complete`}
            </p>
          </div>
        </div>
        <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${loading ? 0 : completionPct}%` }}
          />
        </div>
      </button>

      {/* Quick Stats */}
      <div className="space-y-3 mb-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary">Quick Stats</h4>
        {[
          { label: 'Matched', value: scholarshipCount, icon: 'school', href: '/scholarships' },
          { label: 'Saved', value: savedCount, icon: 'bookmark', href: '/saved' },
          { label: 'Applied', value: 0, icon: 'send', href: '/saved' },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => router.push(stat.href)}
            className="flex items-center justify-between py-2 w-full hover:bg-gray-50 rounded px-1 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-text-secondary">{stat.icon}</span>
              <span className="text-[13px] text-text-secondary">{stat.label}</span>
            </div>
            <span className="text-[14px] font-bold text-text-primary">
              {loading ? '...' : stat.value}
            </span>
          </button>
        ))}
      </div>

      {/* Tip — dynamic based on profile */}
      <div className="bg-primary-light rounded-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-primary text-[20px]">lightbulb</span>
          <h4 className="text-[13px] font-bold text-text-primary">Tip</h4>
        </div>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          {completionPct < 50
            ? 'Complete your profile to get better scholarship matches. Add your research interests and target countries.'
            : completionPct < 80
            ? 'Great progress! Add your IELTS score and publications to improve match accuracy.'
            : 'Your profile looks strong! Check your matches and start applying to top scholarships.'}
        </p>
      </div>

      {/* Upcoming Deadlines */}
      <div className="mt-6">
        <h4 className="text-[12px] font-bold uppercase tracking-wider text-text-secondary mb-3">Upcoming Deadlines</h4>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-6 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : deadlines.length > 0 ? (
          <div className="space-y-2">
            {deadlines.map((item) => (
              <button
                key={item.slug}
                onClick={() => router.push(`/scholarships/${item.slug}`)}
                className="flex items-center justify-between py-1.5 w-full hover:bg-gray-50 rounded px-1 transition-colors"
              >
                <span className="text-[13px] text-text-primary truncate max-w-[140px]">{item.name}</span>
                <span className={`text-[12px] font-medium whitespace-nowrap ${
                  item.days <= 14 ? 'text-red-500' : item.days <= 30 ? 'text-amber-600' : 'text-text-secondary'
                }`}>
                  {item.days}d left
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-text-secondary">No upcoming deadlines</p>
        )}
      </div>
    </aside>
  );
}
