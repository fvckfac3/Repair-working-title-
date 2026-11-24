import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { afterEach, describe, expect, it } from 'vitest';
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

describe('content validation rejects unsafe or inconsistent inputs', () => {
  const directories: string[] = [];
  afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

  function fixture(file: string, change: (value: any) => void) {
    const dir = mkdtempSync(join(tmpdir(), 'repair-content-'));
    directories.push(dir);
    cpSync(join(process.cwd(), 'content'), dir, { recursive: true });
    const path = join(dir, file);
    const value = parse(readFileSync(path, 'utf8'));
    change(value);
    writeFileSync(path, stringify(value));
    return buildBundle(dir).errors.join('\n');
  }

  it('requires a safety threshold on every safety question', () => {
    expect(fixture('global/safety-screen.yaml', (screen) => {
      delete screen.items[0].flagAtOrAbove;
    })).toContain('needs a flag threshold');
  });

  it('rejects duplicate subscales and ambiguous scoring bands', () => {
    const errors = fixture('global/onboarding-health-check.yaml', (assessment) => {
      assessment.subscales[1].id = assessment.subscales[0].id;
      assessment.bands[1].min = assessment.bands[0].min;
    });
    expect(errors).toContain('duplicate subscale ids');
    expect(errors).toContain('duplicate band thresholds');
  });

  it('rejects takeaway answers outside the choice list', () => {
    expect(fixture('modules/calming-the-storm/lessons/taking-a-break.yaml', (lesson) => {
      lesson.takeaway.answer = lesson.takeaway.options.length;
    })).toContain('takeaway answer must index an available option');
  });

  it('rejects duplicate help-resource IDs', () => {
    expect(fixture('global/resources.yaml', (resources) => {
      resources[1].id = resources[0].id;
    })).toContain('duplicate resource ids');
  });
});
