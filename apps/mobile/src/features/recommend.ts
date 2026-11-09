import type { Activity } from '@repair/content-schema';

import { activitiesFor, getModule, isHiddenForSafety } from '@/content';
import type { AppState } from '@/state/store';

/** Order activities are suggested within a module: assess → learn → practice → talk. */
const TYPE_ORDER: Activity['type'][] = ['assessment', 'lesson', 'exercise', 'conversation', 'journal', 'ritual'];

/** The next not-yet-completed activity in a module, respecting safety mode and gates. */
export function nextActivityFor(moduleSlug: string, state: AppState): Activity | undefined {
  const mod = getModule(moduleSlug);
  if (!mod) return undefined;
  if (mod.gating.confirmations.length && !state.gatesAccepted[mod.slug]) return undefined;
  if (mod.gating.adultsOnly && !state.adultConfirmed) return undefined;

  const done = (a: Activity) =>
    a.type === 'assessment' ? (state.results[a.id]?.length ?? 0) > 0 : state.progress[a.id]?.status === 'completed';

  return activitiesFor(moduleSlug)
    .filter((a) => !(state.safetyMode && isHiddenForSafety(a)))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
    .find((a) => !done(a));
}

export function moduleProgress(moduleSlug: string, state: AppState) {
  const items = activitiesFor(moduleSlug);
  const completed = items.filter((a) =>
    a.type === 'assessment' ? (state.results[a.id]?.length ?? 0) > 0 : state.progress[a.id]?.status === 'completed',
  ).length;
  return { completed, total: items.length };
}
