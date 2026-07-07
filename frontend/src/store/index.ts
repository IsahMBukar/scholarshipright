'use client';

import { create } from 'zustand';
import type { Profile } from '@/services/api';

// Auth is handled by useAuth context (src/hooks/useAuth.tsx).
// No Zustand auth store — avoids duplicate state.

// Profile Store
interface ProfileState {
  profile: Profile | null;
  hasProfile: boolean;
  setProfile: (profile: Profile | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  hasProfile: false,
  setProfile: (profile) => set({ profile, hasProfile: !!profile }),
}));

// Saved Scholarships Store
interface SavedState {
  savedIds: Set<string>;
  savedMap: Map<string, { status: string; notes?: string; reminder_enabled: boolean }>;
  addSaved: (id: string, data?: { status?: string; notes?: string; reminder_enabled?: boolean }) => void;
  removeSaved: (id: string) => void;
  setSavedList: (list: Array<{ scholarship_id: string; status: string; notes?: string; reminder_enabled: boolean }>) => void;
}

export const useSavedStore = create<SavedState>((set, get) => ({
  savedIds: new Set(),
  savedMap: new Map(),
  addSaved: (id, data) => set((state) => {
    const newIds = new Set(state.savedIds);
    newIds.add(id);
    const newMap = new Map(state.savedMap);
    newMap.set(id, { status: data?.status || 'saved', notes: data?.notes, reminder_enabled: data?.reminder_enabled ?? true });
    return { savedIds: newIds, savedMap: newMap };
  }),
  removeSaved: (id) => set((state) => {
    const newIds = new Set(state.savedIds);
    newIds.delete(id);
    const newMap = new Map(state.savedMap);
    newMap.delete(id);
    return { savedIds: newIds, savedMap: newMap };
  }),
  setSavedList: (list) => set({
    savedIds: new Set(list.map((s) => s.scholarship_id)),
    savedMap: new Map(list.map((s) => [s.scholarship_id, { status: s.status, notes: s.notes, reminder_enabled: s.reminder_enabled }])),
  }),
}));
