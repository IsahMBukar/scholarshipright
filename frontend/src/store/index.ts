'use client';

import { create } from 'zustand';
import type { Scholarship, Profile, ChatSession, ChatMessage } from '@/services/api';

// Auth Store
interface AuthState {
  user: { id: string; email: string; full_name?: string } | null;
  isAuthenticated: boolean;
  setUser: (user: AuthState['user']) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));

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

// Chat Store
interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  setSessions: (sessions: ChatSession[]) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (msgs: ChatMessage[]) => void;
  setIsStreaming: (v: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isStreaming: false,
  setSessions: (sessions) => set({ sessions }),
  setActiveSession: (id) => set({ activeSessionId: id }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  setIsStreaming: (isStreaming) => set({ isStreaming }),
}));
