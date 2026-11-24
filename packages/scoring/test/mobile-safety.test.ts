import { describe, expect, it, vi } from 'vitest';
import { content, isHiddenForSafety, outlinePlanned, safetyScreen } from '../../../apps/mobile/src/content';
import { canAccessActivityRoute, canAccessNormalContent, canOpenActivity } from '../../../apps/mobile/src/state/access';
import { initialState, parseStoredState, reducer } from '../../../apps/mobile/src/state/model';
import { createPersistenceQueue } from '../../../apps/mobile/src/state/persistence';
import { scoreAssessment } from '../src';

const hydrated = reducer(initialState, { type: 'hydrate', state: {} });

describe('planned module outline', () => {
  it('retains unmatched planned titles even when some activities are authored', () => {
    const module = content.modules.find((m) => m.slug === 'calming-the-storm')!;
    const lesson = content.activities.find((a) => a.module === module.slug && a.type === 'lesson')!;
    const outline = { ...module.outline, lessons: ['  HOW TO calm  ', 'Another lesson'], assessment: 'Still planned', journal: 'Reflection', ritual: 'Daily' };
    expect(outlinePlanned(outline, 'lesson', [{ ...lesson, title: 'How to Calm' }])).toEqual(['Another lesson']);
    expect(outlinePlanned(outline, 'assessment', [{ ...safetyScreen, title: 'Different assessment' }])).toEqual(['Still planned']);
    expect(outlinePlanned(outline, 'journal', [])).toEqual(['Reflection']);
    expect(outlinePlanned(outline, 'ritual', [])).toEqual(['Daily']);
  });
});

describe('mobile safety access', () => {
  it('fails closed before hydration, before screening, in safety mode, and in release builds', () => {
    expect(canAccessNormalContent(true, initialState)).toBe(false);
    expect(canAccessActivityRoute(true, initialState)).toBe(false);
    expect(canAccessNormalContent(true, hydrated)).toBe(false);
    expect(canAccessActivityRoute(true, hydrated)).toBe(true);
    const screened = { ...hydrated, safetyScreenDone: true };
    expect(canAccessNormalContent(true, screened)).toBe(true);
    expect(canAccessNormalContent(false, screened)).toBe(false);
    expect(canAccessActivityRoute(false, screened)).toBe(false);
    expect(canAccessNormalContent(true, { ...screened, safetyMode: true })).toBe(false);
  });

  it('only permits the safety check before screening and defaults to denying all unreviewed relationship content in safety mode', () => {
    expect(canOpenActivity(hydrated, safetyScreen.id, safetyScreen.id, false)).toBe(true);
    const relationship = content.activities.filter((a) => a.id !== safetyScreen.id);
    expect(relationship.length).toBeGreaterThan(0);
    for (const a of relationship) {
      expect(canOpenActivity(hydrated, a.id, safetyScreen.id, isHiddenForSafety(a))).toBe(false);
      expect(isHiddenForSafety(a)).toBe(true);
      expect(canOpenActivity({ ...hydrated, safetyScreenDone: true, safetyMode: true }, a.id, safetyScreen.id, isHiddenForSafety(a))).toBe(false);
    }
    expect(isHiddenForSafety(safetyScreen)).toBe(false);
    expect(canOpenActivity({ ...hydrated, safetyScreenDone: true, safetyMode: true }, safetyScreen.id, safetyScreen.id, false)).toBe(true);
  });

  it('uses a conservative flag threshold and does not promise privacy in the safety check intro', () => {
    expect(safetyScreen.items.find((i) => i.id === 'q2')?.flagAtOrAbove).toBe(1);
    expect(safetyScreen.intro).toContain('unencrypted');
    expect(safetyScreen.intro).toContain('cannot establish safety');
  });

  it('turns safety mode on for flags without storing them, and a negative retake cannot disable it', () => {
    const assessment = content.activities.find((a) => a.id === 'cts-conflict-temperature');
    if (!assessment || assessment.type !== 'assessment') throw new Error('Missing assessment');
    const result = scoreAssessment(assessment, { e2: 1 });
    expect(result.flags).toContain('e2');
    const state = reducer({ ...hydrated, safetyScreenDone: true }, { type: 'saveResult', assessmentId: assessment.id, result });
    expect(state.safetyMode).toBe(true);
    expect(state.results[assessment.id]).toBeUndefined();
    expect(reducer(state, { type: 'safetyScreenCompleted', positive: false }).safetyMode).toBe(true);
  });

  it('never newly stores safety-screen results and preserves already stored legacy results', () => {
    const result = scoreAssessment(safetyScreen, Object.fromEntries(safetyScreen.items.map((item) => [item.id, 0])));
    const legacy = { result, takenAt: '2020-01-01', visibility: 'private' as const };
    const state = { ...hydrated, results: { [safetyScreen.id]: [legacy] } };
    const updated = reducer(state, { type: 'saveResult', assessmentId: safetyScreen.id, result });
    expect(updated.results[safetyScreen.id]).toEqual([legacy]);
    const positive = scoreAssessment(safetyScreen, { q1: 1 });
    const flagged = reducer(updated, { type: 'saveResult', assessmentId: safetyScreen.id, result: positive });
    expect(flagged.safetyMode).toBe(true);
    expect(flagged.results[safetyScreen.id]).toEqual([legacy]);
  });
});

describe('mobile hydration', () => {
  it('rejects corrupt and incompatible state without creating a default replacement', () => {
    for (const json of ['not json', 'null', '[]', '{"safetyMode":"false"}', '{"results":[]}', '{"journal":[null]}', '{"checkins":[{}]}']) {
      expect(() => parseStoredState(json)).toThrow();
    }
    expect(parseStoredState(null)).toEqual({});
    expect(parseStoredState('{"safetyMode":true,"journal":[],"futureData":{"x":1}}')).toMatchObject({ safetyMode: true, futureData: { x: 1 } });
  });
  it('does not modify state before a successful read', () => {
    expect(reducer(initialState, { type: 'confirmAdult' })).toBe(initialState);
    expect(reducer(initialState, { type: 'reset' })).toBe(initialState);
  });
});

describe('serialized persistence', () => {
  it('coalesces snapshots and never starts a newer write before an older one finishes', async () => {
    const resolvers: (() => void)[] = [];
    const write = vi.fn<(snapshot: string) => Promise<void>>(() => new Promise<void>((resolve) => { resolvers.push(resolve); }));
    const saved = vi.fn();
    const queue = createPersistenceQueue(write, vi.fn(), saved);
    queue.enqueue('first'); queue.enqueue('second'); queue.enqueue('latest');
    expect(write.mock.calls.map(([v]) => v)).toEqual(['first']);
    resolvers.shift()?.();
    await vi.waitFor(() => expect(write.mock.calls.map(([v]) => v)).toEqual(['first', 'latest']));
    resolvers.shift()?.();
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
  });

  it('surfaces failure and retries the latest pending state without losing it', async () => {
    let rejectFirst!: (error: Error) => void;
    const write = vi.fn<(value: string) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }))
      .mockResolvedValue(undefined);
    const failed = vi.fn();
    const saved = vi.fn();
    const queue = createPersistenceQueue(write, failed, saved);
    queue.enqueue('old'); queue.enqueue('new');
    rejectFirst(new Error('storage unavailable'));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(saved).not.toHaveBeenCalled();
    queue.retry();
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(write.mock.calls.map(([v]) => v)).toEqual(['old', 'new']);
  });
});
