import { describe, expect, it } from 'vitest';
import type { Activity, Module } from '../packages/content-schema/src';
import type { AssessmentResult } from '../packages/scoring/src';
import { content } from '../apps/mobile/src/content';
import { filterLibrary, moduleProgress, nextActivityFor, type LibraryFilters } from '../apps/mobile/src/features/recommend';
import type { AppState } from '../apps/mobile/src/state/model';

const module = content.modules.find((m) => m.slug === 'calming-the-storm')!;
const activities = content.activities.filter((a) => a.module === module.slug);
const defaults: LibraryFilters = { query: '', type: 'all', mode: 'all', safetyMode: false };
const find = (filters: Partial<LibraryFilters>) => filterLibrary([module], activities, { ...defaults, ...filters });
const state: AppState = {
  hydrated: true, safetyScreenDone: true, safetyMode: false, results: {}, progress: {}, journal: [],
  checkins: [], gatesAccepted: {}, adultConfirmed: false,
};

function result(complete: boolean): AssessmentResult {
  return { assessmentId: 'cts-conflict-temperature', complete, overall: null, band: null,
    subscales: [], flags: [], recommendations: [], suggestTherapist: false };
}

describe('library discovery', () => {
  it('searches module text and authored activity text without case or surrounding whitespace', () => {
    expect(find({ query: `  ${module.title.toUpperCase()}  ` })[0]?.activities).toHaveLength(activities.length);
    const match = find({ query: 'flooding signals' });
    expect(match[0]?.activities.map((a) => a.id)).toEqual(['cts-ex-flooding-signals']);
    expect(find({ query: 'nothing matches this' })).toEqual([]);
  });

  it('combines search, type, and mode on the same activity, including either mode', () => {
    const solo = find({ query: 'cycle', type: 'exercise', mode: 'solo' });
    const together = find({ query: 'cycle', type: 'exercise', mode: 'together' });
    expect(solo[0]?.activities.map((a) => a.id)).toContain('cts-ex-map-our-cycle');
    expect(together[0]?.activities.map((a) => a.id)).toContain('cts-ex-map-our-cycle');
    expect(find({ query: 'flooding signals', type: 'conversation' })).toEqual([]);
  });

  it('hides safety-restricted modules and does not suggest paused activities', () => {
    const hidden: Module = { ...module, slug: 'hidden-test', gating: { ...module.gating, hiddenInSafetyMode: true } };
    const matches = filterLibrary([module, hidden], activities, { ...defaults, safetyMode: true, type: 'exercise' });
    expect(matches).toEqual([]);
    expect(find({ safetyMode: true, mode: 'together' })).toEqual([]);
  });

  it('keeps draft modules discoverable but never treats their activities as available', () => {
    const draft: Module = { ...module, status: 'draft' };
    const authored: Activity = activities[0]!;
    expect(filterLibrary([draft], [authored], defaults)).toHaveLength(1);
    expect(filterLibrary([draft], [authored], { ...defaults, type: authored.type })).toEqual([]);
  });
});

describe('today recommendations and progress', () => {
  it('does not count incomplete assessment results as complete', () => {
    const incomplete: AppState = { ...state, results: { 'cts-conflict-temperature': [
      { result: result(false), takenAt: '2026-01-01', visibility: 'private' },
    ] } };
    expect(nextActivityFor(module.slug, incomplete)?.id).toBe('cts-conflict-temperature');
    expect(moduleProgress(module.slug, incomplete).completed).toBe(0);
    const complete = { ...incomplete, results: { 'cts-conflict-temperature': [
      { result: result(true), takenAt: '2026-01-01', visibility: 'private' as const },
    ] } };
    expect(moduleProgress(module.slug, complete).completed).toBe(1);
    expect(nextActivityFor(module.slug, complete)?.type).toBe('lesson');
  });

  it('does not count or suggest paused activities in safety mode', () => {
    const safe: AppState = { ...state, safetyMode: true };
    expect(moduleProgress(module.slug, safe).total).toBe(0);
    expect(nextActivityFor(module.slug, safe)).toBeUndefined();
    expect(nextActivityFor('healing-after-infidelity', safe)).toBeUndefined();
  });
});
