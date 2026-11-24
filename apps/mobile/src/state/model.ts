import type { AssessmentResult } from '@repair/scoring';
import { getActivity } from '../content';

export type Visibility = 'private' | 'shared_summary' | 'shared_full';
export interface StoredResult { result: AssessmentResult; takenAt: string; visibility: Visibility }
export interface Progress {
  status: 'started' | 'completed';
  data: Record<string, unknown>;
  updatedAt: string;
  completedAt?: string;
}
export interface JournalEntry {
  id: string; activityId: string; prompt: string; text: string; createdAt: string; visibility: Visibility;
}
export interface Checkin {
  id: string; kind: 'daily' | 'weekly'; answers: Record<string, string | number>; createdAt: string;
}
export interface AppState {
  hydrated: boolean;
  safetyScreenDone: boolean;
  safetyMode: boolean;
  results: Record<string, StoredResult[]>;
  progress: Record<string, Progress>;
  journal: JournalEntry[];
  checkins: Checkin[];
  gatesAccepted: Record<string, string>;
  adultConfirmed: boolean;
}

export const initialState: AppState = {
  hydrated: false, safetyScreenDone: false, safetyMode: false,
  results: {}, progress: {}, journal: [], checkins: [], gatesAccepted: {}, adultConfirmed: false,
};

export type Action =
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
  if (action.type === 'hydrate') return { ...initialState, ...action.state, hydrated: true };
  // No edits before a successful read: never replace unread data with defaults.
  if (!state.hydrated) return state;
  switch (action.type) {
    case 'safetyScreenCompleted':
      return { ...state, safetyScreenDone: true, safetyMode: state.safetyMode || action.positive };
    case 'setSafetyMode':
      return { ...state, safetyMode: action.on };
    case 'saveResult': {
      const flagged = action.result.flags.length > 0;
      const isSafetyScreen = [action.assessmentId, action.result.assessmentId].some((id) => {
        const activity = getActivity(id);
        return activity?.type === 'assessment' && activity.kind === 'safety';
      });
      // Defense in depth: retain existing data, but never newly persist safety
      // checks, flagged results, or assessment results while safety mode is on.
      if (isSafetyScreen || flagged || state.safetyMode) {
        return flagged && !state.safetyMode ? { ...state, safetyMode: true } : state;
      }
      const prior = state.results[action.assessmentId] ?? [];
      const entry: StoredResult = { result: action.result, takenAt: now(), visibility: 'private' };
      return {
        ...state,
        results: { ...state.results, [action.assessmentId]: [...prior, entry] },
      };
    }
    case 'saveProgress': {
      const t = now();
      const prev = state.progress[action.activityId];
      const progress: Progress = {
        status: action.completed || prev?.status === 'completed' ? 'completed' : 'started',
        data: { ...prev?.data, ...action.data }, updatedAt: t,
        completedAt: action.completed ? t : prev?.completedAt,
      };
      return { ...state, progress: { ...state.progress, [action.activityId]: progress } };
    }
    case 'addJournal': return { ...state, journal: [action.entry, ...state.journal] };
    case 'deleteJournal': return { ...state, journal: state.journal.filter((j) => j.id !== action.id) };
    case 'addCheckin': return { ...state, checkins: [action.checkin, ...state.checkins] };
    case 'acceptGate': return { ...state, gatesAccepted: { ...state.gatesAccepted, [action.module]: now() } };
    case 'confirmAdult': return { ...state, adultConfirmed: true };
    case 'reset': return { ...initialState, hydrated: true };
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reject unreadable/incompatible data rather than overwriting it with defaults. */
export function parseStoredState(json: string | null): Partial<AppState> {
  if (json === null) return {};
  const value: unknown = JSON.parse(json);
  if (!record(value)) throw new Error('Invalid stored state');
  for (const key of ['safetyScreenDone', 'safetyMode', 'adultConfirmed']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') throw new Error('Invalid stored state');
  }
  for (const key of ['results', 'progress', 'gatesAccepted']) {
    if (value[key] !== undefined && !record(value[key])) throw new Error('Invalid stored state');
  }
  for (const key of ['journal', 'checkins']) {
    if (value[key] !== undefined && !Array.isArray(value[key])) throw new Error('Invalid stored state');
  }
  if (record(value.results) && Object.values(value.results).some((entries) =>
    !Array.isArray(entries) || entries.some((entry) => !record(entry) || !record(entry.result) ||
      !Array.isArray(entry.result.flags) || !Array.isArray(entry.result.subscales) ||
      !Array.isArray(entry.result.recommendations)))) throw new Error('Invalid stored results');
  if (Array.isArray(value.journal) && value.journal.some((entry) =>
    !record(entry) || typeof entry.id !== 'string' || typeof entry.activityId !== 'string' ||
    typeof entry.prompt !== 'string' || typeof entry.text !== 'string' || typeof entry.createdAt !== 'string')) {
    throw new Error('Invalid stored journal');
  }
  if (Array.isArray(value.checkins) && value.checkins.some((entry) =>
    !record(entry) || typeof entry.id !== 'string' || (entry.kind !== 'daily' && entry.kind !== 'weekly') ||
    !record(entry.answers) || typeof entry.createdAt !== 'string')) {
    throw new Error('Invalid stored check-ins');
  }
  if (record(value.progress) && Object.values(value.progress).some((entry) =>
    !record(entry) || !record(entry.data) || (entry.status !== 'started' && entry.status !== 'completed'))) {
    throw new Error('Invalid stored progress');
  }
  if (record(value.gatesAccepted) && Object.values(value.gatesAccepted).some((v) => typeof v !== 'string')) {
    throw new Error('Invalid stored confirmations');
  }
  return value as Partial<AppState>;
}

export function latestResult(state: AppState, assessmentId: string): StoredResult | undefined {
  const list = state.results[assessmentId];
  return list?.[list.length - 1];
}
