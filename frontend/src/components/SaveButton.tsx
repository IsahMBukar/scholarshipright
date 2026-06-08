'use client';

import { useState } from 'react';
import { useSavedStore } from '@/store';
import { saveScholarship, removeSavedScholarship } from '@/services/api';

interface SaveButtonProps {
  scholarshipId: string;
  size?: 'sm' | 'md';
}

export default function SaveButton({ scholarshipId, size = 'md' }: SaveButtonProps) {
  const { savedIds, addSaved, removeSaved } = useSavedStore();
  const isSaved = savedIds.has(scholarshipId);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLoading) return;

    setIsLoading(true);
    try {
      if (isSaved) {
        // Optimistic remove
        removeSaved(scholarshipId);
        await removeSavedScholarship(scholarshipId);
      } else {
        // Optimistic add
        addSaved(scholarshipId);
        await saveScholarship(scholarshipId);
      }
    } catch (err) {
      // Revert on error
      if (isSaved) {
        addSaved(scholarshipId);
      } else {
        removeSaved(scholarshipId);
      }
      console.error('Save toggle failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`${sizeClasses} rounded-full flex items-center justify-center transition-all ${
        isSaved
          ? 'bg-primary-container text-on-primary-container'
          : 'bg-surface-container text-on-surface-variant hover:bg-primary-light hover:text-primary'
      } ${isLoading ? 'opacity-50' : ''}`}
      title={isSaved ? 'Remove from saved' : 'Save scholarship'}
    >
      <span className="material-symbols-outlined" style={{ fontVariationSettings: isSaved ? "'FILL' 1" : "'FILL' 0" }}>
        bookmark
      </span>
    </button>
  );
}
