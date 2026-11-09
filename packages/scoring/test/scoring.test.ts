import { describe, expect, it } from 'vitest';
import { Assessment } from '@repair/content-schema';
import {
  bandFor,
  compareResults,
  isSafetyPositive,
  itemConcern,
  rankModules,
  scoreAssessment,
} from '../src';

const assessment = Assessment.parse({
  id: 'test-check',
  module: 'global',
  type: 'assessment',
  title: 'Test',
  summary: 'Test',
  minutes: 2,
  mode: 'solo',
  intro: 'Test',
  scale: { min: 0, max: 4, labels: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'] },
  subscales: [
    { id: 'conflict', label: 'Conflict', module: 'calming-the-storm', threshold: 50, recommend: ['a', 'b'] },
    { id: 'trust', label: 'Trust', module: 'repairing-trust', threshold: 50, recommend: ['b', 'c'] },
  ],
  items: [
    { id: 'c1', text: 'We fight', subscale: 'conflict' },
    { id: 'c2', text: 'We recover quickly', subscale: 'conflict', reverse: true },
    { id: 't1', text: 'I doubt my partner', subscale: 'trust' },
    { id: 's1', text: 'I feel afraid', subscale: 'trust', flagAtOrAbove: 2 },
  ],
  bands: [
    { id: 'low', label: 'Steady', min: 0, narrative: 'ok' },
    { id: 'mid', label: 'Strained', min: 40, narrative: 'hmm' },
    { id: 'high', label: 'In distress', min: 70, narrative: 'help', suggestTherapist: true },
  ],
});

describe('itemConcern', () => {
  it('normalizes to 0-100', () => {
    expect(itemConcern(0, { min: 0, max: 4 })).toBe(0);
    expect(itemConcern(2, { min: 0, max: 4 })).toBe(50);
    expect(itemConcern(4, { min: 0, max: 4 })).toBe(100);
  });
  it('flips reverse-scored items', () => {
    expect(itemConcern(4, { min: 0, max: 4 }, true)).toBe(0);
    expect(itemConcern(1, { min: 1, max: 5 }, true)).toBe(100);
  });
  it('rejects out-of-range answers', () => {
    expect(() => itemConcern(5, { min: 0, max: 4 })).toThrow(RangeError);
  });
});

describe('bandFor', () => {
  it('picks the highest band at or below the score regardless of order', () => {
    const shuffled = [...assessment.bands].reverse();
    expect(bandFor(shuffled, 0)?.id).toBe('low');
    expect(bandFor(shuffled, 40)?.id).toBe('mid');
    expect(bandFor(shuffled, 99)?.id).toBe('high');
  });
});

describe('scoreAssessment', () => {
  it('scores subscales, overall, band and recommendations', () => {
    // conflict: c1=4 (100), c2=0 reversed (100) => 100. trust: t1=0, s1=0 => 0
    const r = scoreAssessment(assessment, { c1: 4, c2: 0, t1: 0, s1: 0 });
    expect(r.complete).toBe(true);
    expect(r.subscales.find((s) => s.id === 'conflict')?.score).toBe(100);
    expect(r.subscales.find((s) => s.id === 'trust')?.score).toBe(0);
    expect(r.overall).toBe(50);
    expect(r.band?.id).toBe('mid');
    expect(r.recommendations).toEqual(['a', 'b']);
    expect(r.suggestTherapist).toBe(false);
    expect(isSafetyPositive(r)).toBe(false);
  });

  it('orders recommendations by concern and de-duplicates', () => {
    const r = scoreAssessment(assessment, { c1: 3, c2: 1, t1: 4, s1: 4 });
    expect(r.recommendations).toEqual(['b', 'c', 'a']);
    expect(r.band?.id).toBe('high');
    expect(r.suggestTherapist).toBe(true);
  });

  it('raises safety flags independent of the overall score', () => {
    const r = scoreAssessment(assessment, { c1: 0, c2: 4, t1: 0, s1: 2 });
    expect(r.flags).toEqual(['s1']);
    expect(isSafetyPositive(r)).toBe(true);
  });

  it('handles partial answers', () => {
    const r = scoreAssessment(assessment, { c1: 2 });
    expect(r.complete).toBe(false);
    expect(r.subscales.find((s) => s.id === 'trust')?.score).toBeNull();
    expect(r.overall).toBe(50);
  });

  it('returns nulls when nothing is answered', () => {
    const r = scoreAssessment(assessment, {});
    expect(r.overall).toBeNull();
    expect(r.band).toBeNull();
    expect(r.recommendations).toEqual([]);
  });
});

describe('compareResults', () => {
  it('reports gaps sorted largest first with notable flags', () => {
    const a = scoreAssessment(assessment, { c1: 4, c2: 0, t1: 1, s1: 0 });
    const b = scoreAssessment(assessment, { c1: 1, c2: 3, t1: 1, s1: 0 });
    const gaps = compareResults(a, b, 25);
    expect(gaps[0]).toMatchObject({ id: 'conflict', gap: 75, notable: true });
    expect(gaps[1]).toMatchObject({ id: 'trust', gap: 0, notable: false });
  });
});

describe('compareResults with sensitive subscales', () => {
  it('never includes sensitive subscales', () => {
    const sensitive = Assessment.parse({
      ...assessment,
      subscales: assessment.subscales.map((s) => (s.id === 'trust' ? { ...s, sensitive: true } : s)),
    });
    const a = scoreAssessment(sensitive, { c1: 4, c2: 0, t1: 4, s1: 0 });
    const b = scoreAssessment(sensitive, { c1: 0, c2: 4, t1: 0, s1: 0 });
    expect(compareResults(a, b, 25).map((g) => g.id)).toEqual(['conflict']);
  });
});

describe('rankModules', () => {
  const a = scoreAssessment(assessment, { c1: 1, c2: 3, t1: 4, s1: 0 });
  const b = scoreAssessment(assessment, { c1: 4, c2: 0, t1: 0, s1: 0 });

  it("uses each module's highest partner score", () => {
    expect(rankModules([a, b])).toEqual([
      { module: 'calming-the-storm', score: 100 },
      { module: 'repairing-trust', score: 50 },
    ]);
  });

  it('removes hidden modules in safety mode', () => {
    expect(
      rankModules([a, b], { safetyMode: true, hiddenInSafetyMode: ['calming-the-storm'] }),
    ).toEqual([{ module: 'repairing-trust', score: 50 }]);
  });

  it('can pin a module to the front', () => {
    expect(rankModules([a, b], { pinFirst: ['repairing-trust'] })[0]?.module).toBe('repairing-trust');
  });
});
