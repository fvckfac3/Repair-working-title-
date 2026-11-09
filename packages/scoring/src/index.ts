/**
 * Pure scoring logic for assessments. No I/O, no React: unit tested in
 * isolation and shared by the app and server (Edge Functions).
 *
 * Convention: every score is a CONCERN score from 0 (no concern) to 100
 * (maximum concern). Items worded positively are marked `reverse: true`.
 */
import type { Assessment, Band } from '@repair/content-schema';

export type Answers = Record<string, number>;

export interface SubscaleScore {
  id: string;
  label: string;
  module?: string;
  sensitive: boolean;
  /** 0-100 concern score, or null if no items in the subscale were answered. */
  score: number | null;
  answered: number;
  total: number;
}

export interface AssessmentResult {
  assessmentId: string;
  complete: boolean;
  overall: number | null;
  band: Band | null;
  subscales: SubscaleScore[];
  /** Item ids whose answer met `flagAtOrAbove` (safety screens). */
  flags: string[];
  /** Recommended activity ids, highest-concern subscale first, de-duplicated. */
  recommendations: string[];
  suggestTherapist: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Convert one raw answer into a 0-100 concern score. */
export function itemConcern(
  value: number,
  scale: { min: number; max: number },
  reverse = false,
): number {
  if (scale.max <= scale.min) throw new Error('scale.max must be greater than scale.min');
  if (value < scale.min || value > scale.max) {
    throw new RangeError(`answer ${value} outside scale ${scale.min}-${scale.max}`);
  }
  const normalized = (value - scale.min) / (scale.max - scale.min);
  return (reverse ? 1 - normalized : normalized) * 100;
}

/** Highest band whose `min` is at or below the score. */
export function bandFor(bands: Band[], score: number): Band | null {
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  let match: Band | null = null;
  for (const band of sorted) if (score >= band.min) match = band;
  return match;
}

export function scoreAssessment(assessment: Assessment, answers: Answers): AssessmentResult {
  const flags: string[] = [];
  const buckets = new Map<string, number[]>();

  for (const item of assessment.items) {
    const value = answers[item.id];
    if (value === undefined) continue;
    const concern = itemConcern(value, assessment.scale, item.reverse);
    const bucket = buckets.get(item.subscale) ?? [];
    bucket.push(concern);
    buckets.set(item.subscale, bucket);
    if (item.flagAtOrAbove !== undefined && value >= item.flagAtOrAbove) flags.push(item.id);
  }

  const subscales: SubscaleScore[] = assessment.subscales.map((s) => {
    const values = buckets.get(s.id) ?? [];
    const total = assessment.items.filter((i) => i.subscale === s.id).length;
    return {
      id: s.id,
      label: s.label,
      module: s.module,
      sensitive: s.sensitive,
      score: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
      answered: values.length,
      total,
    };
  });

  const scored = subscales.filter((s) => s.score !== null) as (SubscaleScore & { score: number })[];
  const overall = scored.length
    ? round1(scored.reduce((a, s) => a + s.score, 0) / scored.length)
    : null;
  const band = overall === null ? null : bandFor(assessment.bands, overall);

  const recommendations: string[] = [];
  const byConcern = [...scored].sort((a, b) => b.score - a.score);
  for (const s of byConcern) {
    const def = assessment.subscales.find((d) => d.id === s.id)!;
    if (s.score >= def.threshold) {
      for (const id of def.recommend) if (!recommendations.includes(id)) recommendations.push(id);
    }
  }

  return {
    assessmentId: assessment.id,
    complete: assessment.items.every((i) => answers[i.id] !== undefined),
    overall,
    band,
    subscales,
    flags,
    recommendations,
    suggestTherapist: band?.suggestTherapist ?? false,
  };
}

/** A safety screen result is positive if any flag item was triggered. */
export function isSafetyPositive(result: AssessmentResult): boolean {
  return result.flags.length > 0;
}

export interface SubscaleGap {
  id: string;
  label: string;
  mine: number;
  partner: number;
  gap: number;
  notable: boolean;
}

/**
 * Side-by-side partner comparison. Only call this when BOTH partners have
 * opted in to sharing; the function itself does not enforce consent.
 * Sensitive subscales are always excluded.
 */
export function compareResults(
  mine: AssessmentResult,
  partner: AssessmentResult,
  gapThreshold: number,
): SubscaleGap[] {
  if (mine.assessmentId !== partner.assessmentId) {
    throw new Error('cannot compare results from different assessments');
  }
  return mine.subscales
    .filter((m) => !m.sensitive)
    .map((m) => {
      const p = partner.subscales.find((s) => s.id === m.id);
      if (m.score === null || !p || p.score === null) return null;
      const gap = round1(Math.abs(m.score - p.score));
      return { id: m.id, label: m.label, mine: m.score, partner: p.score, gap, notable: gap >= gapThreshold };
    })
    .filter((g): g is SubscaleGap => g !== null)
    .sort((a, b) => b.gap - a.gap);
}

export interface ModuleRecommendation {
  module: string;
  score: number;
}

/**
 * Rank modules from an onboarding health-check result. When partner results
 * are available, a module's priority is the higher of the two concern scores,
 * so one partner's pain is never averaged away.
 */
export function rankModules(
  results: AssessmentResult[],
  options: { safetyMode?: boolean; hiddenInSafetyMode?: string[]; pinFirst?: string[] } = {},
): ModuleRecommendation[] {
  const best = new Map<string, number>();
  for (const result of results) {
    for (const s of result.subscales) {
      if (!s.module || s.score === null) continue;
      best.set(s.module, Math.max(best.get(s.module) ?? 0, s.score));
    }
  }
  let ranked = [...best.entries()]
    .map(([module, score]) => ({ module, score }))
    .sort((a, b) => b.score - a.score);

  if (options.safetyMode) {
    const hidden = new Set(options.hiddenInSafetyMode ?? []);
    ranked = ranked.filter((r) => !hidden.has(r.module));
  }
  for (const pinned of [...(options.pinFirst ?? [])].reverse()) {
    const idx = ranked.findIndex((r) => r.module === pinned);
    if (idx > 0) ranked.unshift(...ranked.splice(idx, 1));
  }
  return ranked;
}
