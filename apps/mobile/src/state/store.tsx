/**
 * Local-first app state, persisted on device.
 *
 * This is the single source of truth until Supabase sync is wired up
 * (see supabase/migrations). Everything here is PRIVATE by default. Nothing
 * leaves the device in this build.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AssessmentResult } from '@repair/scoring';
import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';

const STORAGE_KEY = 'repair/state/v1';

export type Visibility = 'private' | 'shared_summary' | 'shared_full';

export interface StoredResult {
  result: AssessmentResult;
  takenAt: string;
  visibility: Visibility;
}

export interface Progress {
  status: 'started' | 'completed';
  data: Record<string, unknown>;
  updatedAt: string;
  completedAt?: string;
}

export interface JournalEntry {
  id: string;
  activityId: string;
  prompt: string;
  text: string;
  createdAt: string;
  visibility: Visibility;
}

export interface Checkin {
  id: string;
  kind: 'daily' | 'weekly';
  answers: Record<string, string | number>;
  createdAt: string;
}

export interface AppState {
  hydrated: boolean;
  safetyScreenDone: boolean;
  /** Owner-only. Never synced to a partner, never shown in shared views. */
  safetyMode: boolean;
  results: Record<string, StoredResult[]>;
  progress: Record<string, Progress>;
  journal: JournalEntry[];
  checkins: Checkin[];
  /** Modules whose entry confirmations this user accepted. */
  gatesAccepted: Record<string, string>;
  adultConfirmed: boolean;
}

const initialState: AppState = {
  hydrated: false,
  safetyScreenDone: false,
  safetyMode: false,
  results: {},
  progress: {},
  journal: [],
  checkins: [],
  gatesAccepted: {},
  adultConfirmed: false,
};

type Action =
  | { type: 'hydrate'; state: Partial<AppState> }
  | { type: 'safetyScreenCompleted'; positive: boolean }
  | { type: 'setSafetyMode'; on: boolean }
  | { type: 'saveResult'; assessmentId: string; result: AssessmentResult }
  | { type: 'saveProgress'; activityId: string; data: Record<string, unknown>; completed: boolean }
  | { type: 'addJournal'; entry: JournalEntry }
  | { type: 'deleteJournal'; id: string }
  | { type: 'addCheckin'; checkin: Checkin }
  | { type: 'acceptGate'; module: string }
  | { type: 'confirmAdult' }
  | { type: 'reset' };

const now = () => new Date().toISOString();

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.state, hydrated: true };
    case 'safetyScreenCompleted':
      // A positive screen turns safety mode on; a negative one never turns it off.
      return { ...state, safetyScreenDone: true, safetyMode: state.safetyMode || action.positive };
    case 'setSafetyMode':
      return { ...state, safetyMode: action.on };
    case 'saveResult': {
      const prior = state.results[action.assessmentId] ?? [];
      const entry: StoredResult = { result: action.result, takenAt: now(), visibility: 'private' };
      return { ...state, results: { ...state.results, [action.assessmentId]: [...prior, entry] } };
    }
    case 'saveProgress': {
      const t = now();
      const prev = state.progress[action.activityId];
      const progress: Progress = {
        status: action.completed || prev?.status === 'completed' ? 'completed' : 'started',
        data: { ...prev?.data, ...action.data },
        updatedAt: t,
        completedAt: action.completed ? t : prev?.completedAt,
      };
      return { ...state, progress: { ...state.progress, [action.activityId]: progress } };
    }
    case 'addJournal':
      return { ...state, journal: [action.entry, ...state.journal] };
    case 'deleteJournal':
      return { ...state, journal: state.journal.filter((j) => j.id !== action.id) };
    case 'addCheckin':
      return { ...state, checkins: [action.checkin, ...state.checkins] };
    case 'acceptGate':
      return { ...state, gatesAccepted: { ...state.gatesAccepted, [action.module]: now() } };
    case 'confirmAdult':
      return { ...state, adultConfirmed: true };
    case 'reset':
      return { ...initialState, hydrated: true };
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((json) => dispatch({ type: 'hydrate', state: json ? JSON.parse(json) : {} }))
      .catch(() => dispatch({ type: 'hydrate', state: {} }));
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const { hydrated: _ignored, ...persisted } = state;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function latestResult(state: AppState, assessmentId: string): StoredResult | undefined {
  const list = state.results[assessmentId];
  return list?.[list.length - 1];
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
