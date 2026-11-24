import type { AppState } from './model';

export type AccessStorageStatus = 'loading' | 'ready' | 'read-error' | 'write-error';

/** Unreviewed relationship content is disabled outside development builds. */
export function canAccessNormalContent(development: boolean, state: AppState): boolean {
  return development && state.hydrated && state.safetyScreenDone && !state.safetyMode;
}

/** Individual activities perform an additional safety-check and mode gate. */
export function canAccessActivityRoute(development: boolean, state: AppState): boolean {
  return development && state.hydrated;
}

/**
 * A pending read is not a denial: keep the original navigator route and its
 * parameters, but do not render its screen. Once the read is complete the
 * ordinary guards take over. A write error does not invalidate a successful read.
 */
export function rootNavigationAccess(development: boolean, state: AppState, status: AccessStorageStatus) {
  const awaitingRead = !state.hydrated || status === 'loading' || status === 'read-error';
  return {
    awaitingRead,
    normalRouteRegistered: awaitingRead || canAccessNormalContent(development, state),
    activityRouteRegistered: awaitingRead || canAccessActivityRoute(development, state),
  };
}

/** Support may render immediately; every other screen must wait for the read. */
export function deferRootScreen(awaitingRead: boolean, routeName: string): boolean {
  return awaitingRead && routeName !== 'safety';
}

export function canOpenActivity(
  state: AppState,
  activityId: string,
  safetyScreenId: string,
  hiddenInSafetyMode: boolean,
): boolean {
  if (!state.hydrated) return false;
  if (!state.safetyScreenDone && activityId !== safetyScreenId) return false;
  return !state.safetyMode || !hiddenInSafetyMode;
}
