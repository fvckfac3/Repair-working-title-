import { describe, expect, it } from 'vitest';
import { Assessment } from '@repair/content-schema';
import { scoreAssessment } from '../src';
import { assessmentDisposition, localDay, savedStep, secondsUntil } from '../../../apps/mobile/src/features/players/player-logic';

const assessment = Assessment.parse({
  id: 'test', module: 'global', type: 'assessment', kind: 'standard', title: 'Test', summary: 'Test',
  minutes: 2, mode: 'solo', intro: 'Test', scale: { min: 0, max: 1, labels: ['No', 'Yes'] },
  subscales: [{ id: 's', label: 'Test', recommend: ['a'], threshold: 0 }],
  items: [
    { id: 'a', subscale: 's', text: 'A' },
    { id: 'b', subscale: 's', text: 'B', flagAtOrAbove: 1 },
    { id: 'c', subscale: 's', text: 'C' },
  ],
  bands: [{ id: 'high', label: 'High', min: 0, narrative: 'Couples therapy', suggestTherapist: true }],
});
const safety = { ...assessment, kind: 'safety' as const };

describe('assessment presentation and persistence policy', () => {
  it('prioritizes any safety flag, even on a partial assessment, and does not save it', () => {
    const result = scoreAssessment(assessment, { b: 1 });
    expect(result.complete).toBe(false);
    expect(assessmentDisposition(assessment, result, false)).toMatchObject({
      activateSafety: true, showSafety: true, showProfile: false, saveResult: false,
    });
  });
  it('never saves safety-screen results, and does not complete a skipped unflagged screen', () => {
    const partial = scoreAssessment(safety, { a: 0 });
    expect(assessmentDisposition(safety, partial, false)).toMatchObject({
      completeSafetyScreen: false, saveResult: false, showProfile: false,
    });
    const positive = scoreAssessment(safety, { b: 1 });
    expect(assessmentDisposition(safety, positive, false)).toMatchObject({
      completeSafetyScreen: true, activateSafety: true, saveResult: false,
    });
    const complete = scoreAssessment(safety, { a: 0, b: 0, c: 0 });
    expect(assessmentDisposition(safety, complete, false)).toMatchObject({
      completeSafetyScreen: true, activateSafety: false, saveResult: false,
    });
  });
  it('suppresses profile for incomplete results and whenever safety mode is already active', () => {
    const partial = scoreAssessment(assessment, { a: 1 });
    expect(assessmentDisposition(assessment, partial, false).showProfile).toBe(false);
    const complete = scoreAssessment(assessment, { a: 1, b: 0, c: 1 });
    expect(assessmentDisposition(assessment, complete, false).showProfile).toBe(true);
    expect(assessmentDisposition(assessment, complete, true)).toMatchObject({ showSafety: true, showProfile: false, saveResult: false });
  });
});

describe('player utility behavior', () => {
  it('restores valid saved steps and safely falls back for stale state', () => {
    expect(savedStep(2, 4)).toBe(2);
    for (const value of [-1, 4, 1.5, '2', null, undefined]) expect(savedStep(value, 4)).toBe(0);
  });
  it('uses elapsed wall-clock time across delayed callbacks', () => {
    const deadline = 100_000;
    expect(secondsUntil(deadline, 71_501)).toBe(29);
    expect(secondsUntil(deadline, 100_000)).toBe(0);
    expect(secondsUntil(deadline, 130_000)).toBe(0);
  });
  it('groups check-ins by local rather than UTC date', () => {
    const old = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(localDay(new Date('2026-01-01T07:30:00Z'))).toBe('2025-12-31');
      expect(localDay(new Date('2026-01-01T08:30:00Z'))).toBe('2026-01-01');
    } finally {
      if (old === undefined) delete process.env.TZ; else process.env.TZ = old;
    }
  });
});
