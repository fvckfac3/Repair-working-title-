import type { Assessment } from '@repair/content-schema';
import type { AssessmentResult } from '@repair/scoring';

/** Safety answers/results never enter persisted state. Flagged results do not either. */
export function assessmentDisposition(assessment: Assessment, result: AssessmentResult, safetyMode: boolean) {
  const flagged = result.flags.length > 0;
  return {
    activateSafety: flagged,
    completeSafetyScreen: assessment.kind === 'safety' && (result.complete || flagged),
    saveResult: assessment.kind !== 'safety' && !flagged && !safetyMode,
    showSafety: flagged || safetyMode,
    showProfile: assessment.kind !== 'safety' && result.complete && !flagged && !safetyMode,
  };
}

/** Clamp stale or malformed saved cursors to an available step. */
export function savedStep(value: unknown, count: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count ? value : 0;
}

/** Compare actual local calendar days, not UTC date prefixes. */
export function localDay(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function secondsUntil(deadline: number, now: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
