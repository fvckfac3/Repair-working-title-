import type { Activity, ActivityType, Mode, Module } from '@repair/content-schema';

import { activitiesFor, getModule, isHiddenForSafety } from '../content';
import type { AppState } from '../state/model';

/** Order activities are suggested within a module: assess → learn → practice → talk. */
const TYPE_ORDER: Activity['type'][] = ['assessment', 'lesson', 'exercise', 'conversation', 'journal', 'ritual'];

/** Follow the central safety policy even for explicitly solo activities. */
function availableInSafetyMode(activity: Activity) {
  return activity.mode === 'solo' && !isHiddenForSafety(activity);
}

function isCompleted(activity: Activity, state: AppState) {
  return activity.type === 'assessment'
    ? Boolean(state.results[activity.id]?.some(({ result }) => result.complete))
    : state.progress[activity.id]?.status === 'completed';
}

/** The next not-yet-completed activity in a module, respecting safety mode and gates. */
export function nextActivityFor(moduleSlug: string, state: AppState): Activity | undefined {
  const mod = getModule(moduleSlug);
  if (!mod || mod.status === 'draft') return undefined;
  if (state.safetyMode && mod.gating.hiddenInSafetyMode) return undefined;
  if (mod.gating.confirmations.length && !state.gatesAccepted[mod.slug]) return undefined;
  if (mod.gating.adultsOnly && !state.adultConfirmed) return undefined;
  return activitiesFor(moduleSlug)
    .filter((a) => !state.safetyMode || availableInSafetyMode(a))
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
    .find((a) => !isCompleted(a, state));
}

/** Progress counts authored activities, not planned outlines. */
export function moduleProgress(moduleSlug: string, state: AppState) {
  const items = activitiesFor(moduleSlug).filter((a) => !state.safetyMode || availableInSafetyMode(a));
  return { completed: items.filter((a) => isCompleted(a, state)).length, total: items.length };
}

export type LibraryFilters = {
  query: string;
  type: ActivityType | 'all';
  mode: Exclude<Mode, 'either'> | 'all';
  safetyMode: boolean;
};
export type LibraryMatch = { module: Module; activities: Activity[] };

/** Filter modules and their authored activities. Search matches module OR activity text. */
export function filterLibrary(modules: Module[], activities: Activity[], filters: LibraryFilters): LibraryMatch[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const hasActivityFilter = filters.type !== 'all' || filters.mode !== 'all';
  const matchesText = (...parts: string[]) => parts.some((part) => part.toLocaleLowerCase().includes(query));

  return modules.flatMap((module) => {
    if (filters.safetyMode && module.gating.hiddenInSafetyMode) return [];
    const moduleMatches = !query || matchesText(module.title, module.tagline, module.description);
    const matched = activities.filter((activity) => {
      if (activity.module !== module.slug) return false;
      if (module.status === 'draft') return false;
      // Follow the same default-deny safety policy as the activity route.
      if (filters.safetyMode && !availableInSafetyMode(activity)) return false;
      if (filters.type !== 'all' && activity.type !== filters.type) return false;
      if (filters.mode !== 'all' && activity.mode !== filters.mode && activity.mode !== 'either') return false;
      return moduleMatches || matchesText(activity.title, activity.summary);
    });
    if (hasActivityFilter ? matched.length === 0 : !moduleMatches && matched.length === 0) return [];
    return [{ module, activities: matched }];
  });
}
