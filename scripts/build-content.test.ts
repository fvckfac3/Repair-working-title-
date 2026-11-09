import { describe, expect, it } from 'vitest';
import { buildBundle } from './build-content';
import { scoreAssessment } from '../packages/scoring/src';

describe('content library', () => {
  const { bundle, errors } = buildBundle();

  it('validates with no errors', () => {
    expect(errors).toEqual([]);
    expect(bundle).not.toBeNull();
  });

  it('has at least 10 modules', () => {
    expect(bundle!.modules.length).toBeGreaterThanOrEqual(10);
  });

  it('every assessment scores cleanly at both extremes', () => {
    for (const a of bundle!.activities) {
      if (a.type !== 'assessment') continue;
      for (const value of [a.scale.min, a.scale.max]) {
        const answers = Object.fromEntries(a.items.map((i) => [i.id, value]));
        const r = scoreAssessment(a, answers);
        expect(r.complete).toBe(true);
        expect(r.band).not.toBeNull();
      }
    }
  });

  it('safety screen flags any single positive answer', () => {
    const screen = bundle!.activities.find((a) => a.type === 'assessment' && a.kind === 'safety');
    if (!screen || screen.type !== 'assessment') throw new Error('missing safety screen');
    for (const item of screen.items) {
      const answers = Object.fromEntries(screen.items.map((i) => [i.id, 0]));
      answers[item.id] = screen.scale.max;
      expect(scoreAssessment(screen, answers).flags).toContain(item.id);
    }
  });
});
