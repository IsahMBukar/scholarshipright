'use client';

import { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import ScholarshipCard from '@/components/ScholarshipCard';
import { fetchSavedScholarships, removeSavedScholarship } from '@/services/api';
import type { Scholarship } from '@/services/api';

type SavedItem = Scholarship & { status: string; notes?: string; reminder_enabled: boolean };

export default function SavedPage() {
  const [saved, setSaved] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSavedScholarships()
      .then((data) => setSaved(data as SavedItem[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRemove(id: string) {
    await removeSavedScholarship(id).catch(() => {});
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6">
        <h1 className="text-[24px] font-bold text-text-primary mb-1">Saved Scholarships</h1>
        <p className="text-[15px] text-text-secondary mb-6">{saved.length} saved</p>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => <div key={i} className="h-[160px] bg-white rounded-card animate-pulse" />)}
          </div>
        ) : saved.length > 0 ? (
          <div className="flex flex-col gap-4">
            {saved.map((sch) => (
              <ScholarshipCard key={sch.id} scholarship={sch} onSave={handleRemove} isSaved={true} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-text-secondary mb-4 block">bookmark_border</span>
            <p className="text-[16px] text-text-secondary">No saved scholarships yet</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
