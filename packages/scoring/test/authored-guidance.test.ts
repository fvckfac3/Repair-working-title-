import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { parse } from 'yaml';
import type { Exercise, Journal } from '@repair/content-schema';
import { content, getActivity, onboardingAssessment, safetyScreen } from '../../../apps/mobile/src/content';
import raw from '../../../apps/mobile/src/content/content.generated.json';

const root = resolve(__dirname, '../../..');
const authored = (path: string) => parse(readFileSync(resolve(root, path), 'utf8')) as { intro?: string; outro?: string };

// The project has no native component test renderer. Execute the actual TSX player
// with minimal UI/hook stubs so the rendered branches and button flow can be tested.
type Node = { type: string; props: { children?: unknown; label?: string; onPress?: () => void } };
function playerHarness(file: 'journal' | 'exercise') {
  const slots: unknown[] = [];
  let cursor = 0;
  const dispatch = vi.fn();
  const back = vi.fn();
  const useState = (initial: unknown) => {
    const position = cursor++;
    if (!(position in slots)) slots[position] = typeof initial === 'function' ? initial() : initial;
    return [slots[position], (value: unknown) => { slots[position] = value; }];
  };
  const jsx = (type: string, props: Node['props']) => ({ type, props });
  const modules: Record<string, unknown> = {
    'react': { useState },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { StyleSheet: { create: (styles: unknown) => styles }, View: 'View' },
    'expo-router': { router: { back } },
    '@/components/themed-text': { ThemedText: 'ThemedText' },
    '@/components/ui': { Button: 'Button', Card: 'Card', Input: 'Input', Option: 'Option', ProgressBar: 'ProgressBar' },
    '@/state/store': { useStore: () => ({ state: { progress: {} }, dispatch }), newId: () => 'new-id' },
    './player-logic': { savedStep: (value: unknown, length: number) => typeof value === 'number' && value >= 0 && value < length ? value : 0 },
    './timer': { Timer: 'Timer' },
  };
  const source = readFileSync(resolve(root, `apps/mobile/src/features/players/${file}.tsx`), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: Record<string, (props: unknown) => Node> = {};
  runInNewContext(javascript, { exports, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected player import: ${name}`);
    return modules[name];
  } });
  const component = exports[file === 'journal' ? 'JournalPlayer' : 'ExercisePlayer']!;
  return {
    render: (props: unknown) => { cursor = 0; return component(props); },
    dispatch,
    back,
  };
}
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('type' in value) || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function displayedText(tree: Node): string[] {
  return nodes(tree).filter((node) => node.type === 'ThemedText').map((node) => {
    const children = node.props.children;
    return Array.isArray(children) ? children.join('') : String(children ?? '');
  });
}
function press(tree: Node, label: string) {
  const button = nodes(tree).find((node) => node.type === 'Button' && node.props.label === label);
  if (!button?.props.onPress) throw new Error(`Missing button ${label}`);
  button.props.onPress();
}

describe('authored assessment guidance', () => {
  it('keeps every standard intro verbatim and supplies common cautions without repeating its existing cautions', () => {
    const originals = raw.activities.filter((activity) => activity.type === 'assessment' && activity.kind === 'standard');
    expect(originals.length).toBeGreaterThan(1);
    for (const original of originals) {
      const activity = getActivity(original.id);
      if (typeof original.intro !== 'string') throw new Error(`Missing authored intro for ${original.id}`);
      if (!activity || activity.type !== 'assessment') throw new Error(`Missing assessment ${original.id}`);
      expect(activity.intro.startsWith(original.intro)).toBe(true);
      expect(activity.intro).toMatch(/\bnot\b[^.]*\bdiagnos/i);
      expect(activity.intro).toMatch(/unvalidated|\bnot\b[^.]*\bvalidated/i);
      expect(activity.intro).toMatch(/unencrypted|without an app lock or encryption/i);
      expect(activity.intro).toContain('no separate partner accounts or partner sharing');
      if (/unencrypted|without an app lock or encryption/i.test(original.intro)) {
        expect(activity.intro).not.toContain('Results are stored unencrypted.');
      }
      if (/\bnot\b[^.]*\bdiagnos/i.test(original.intro)) {
        expect(activity.intro).not.toContain('This draft is for reflection, not diagnosis.');
      }
    }
  });
  it('retains intimacy, onboarding, and safety-screen guidance', () => {
    const intro = authored('content/modules/exploring-intimacy/assessment.yaml').intro;
    const activity = getActivity('ei-assessment-intimacy-profile');
    if (!activity || activity.type !== 'assessment' || !intro) throw new Error('Missing intimacy assessment');
    expect(activity.intro).toContain(intro);
    expect(activity.intro).toContain('Physical pain deserves attention from a clinician.');
    expect(onboardingAssessment.intro).toContain(authored('content/global/onboarding-health-check.yaml').intro);
    expect(onboardingAssessment.intro).toContain('Skipping any question leaves this check incomplete');
    expect(onboardingAssessment.intro).toContain('not diagnosis');
    expect(onboardingAssessment.intro).toMatch(/unencrypted|without an app lock or encryption/i);
    expect(safetyScreen.intro).toBe(authored('content/global/safety-screen.yaml').intro);
    expect(safetyScreen.intro).toContain('cannot establish safety');
    expect(safetyScreen.items.find((item) => item.id === 'q2')?.flagAtOrAbove).toBe(1);
  });
});

describe('authored player guidance', () => {
  it('shows the money journal intro and the storage notice before the entry field', () => {
    const journal = content.activities.find((activity): activity is Journal => activity.id === 'mat-journal' && activity.type === 'journal');
    if (!journal) throw new Error('Missing money journal');
    expect(journal.intro).toBe(authored('content/modules/money-as-a-team/journal.yaml').intro);
    const tree = playerHarness('journal').render({ journal });
    const text = displayedText(tree);
    expect(text.filter((value) => value === journal.intro)).toHaveLength(1);
    expect(text.join(' ')).toContain('Avoid recording passwords, account numbers');
    expect(text.join(' ')).toContain('unencrypted');
    expect(text.join(' ')).toContain('without an app lock');
    expect(text.join(' ')).toContain('no separate partner accounts or partner sharing');
    const all = nodes(tree);
    expect(all.findIndex((node) => node.type === 'ThemedText' && node.props.children === journal.intro)).toBeLessThan(all.findIndex((node) => node.type === 'Input'));
  });
  it('supplements existing journal privacy disclosures rather than repeating them', () => {
    for (const id of ['cts-journal-after-the-storm', 'dc-journal-closest']) {
      const journal = content.activities.find((activity): activity is Journal => activity.id === id && activity.type === 'journal');
      if (!journal) throw new Error(`Missing journal ${id}`);
      const text = displayedText(playerHarness('journal').render({ journal }));
      expect(text.filter((value) => value === journal.intro)).toHaveLength(1);
      const notice = text.find((value) => value.startsWith('Drafts save automatically'));
      expect(notice).toContain('same storage and access limitations as entries');
      expect(notice).toContain('separate partner accounts');
      expect(notice).not.toContain('stored unencrypted');
      if (id === 'cts-journal-after-the-storm') {
        expect(notice).not.toContain('app lock');
        expect(notice).not.toContain('partner sharing');
      } else {
        expect(notice).toContain('no app lock');
        expect(notice).toContain('partner sharing is not available');
      }
    }
  });
  it('shows the parenting exercise outro once after completion, before Done', () => {
    const exercise = content.activities.find((activity): activity is Exercise => activity.id === 'pah-ex-parenting' && activity.type === 'exercise');
    if (!exercise) throw new Error('Missing parenting exercise');
    expect(exercise.outro).toBe(authored('content/modules/partners-at-home/exercises/parenting.yaml').outro);
    const player = playerHarness('exercise');
    let tree = player.render({ exercise });
    expect(displayedText(tree)).not.toContain(exercise.outro);
    press(tree, 'Start');
    for (let i = 0; i < exercise.steps.length; i++) {
      tree = player.render({ exercise });
      expect(displayedText(tree)).not.toContain(exercise.outro);
      press(tree, i === exercise.steps.length - 1 ? 'Finish' : 'Next / skip');
    }
    tree = player.render({ exercise });
    const text = displayedText(tree);
    expect(text.filter((value) => value === exercise.outro)).toHaveLength(1);
    expect(text.join(' ')).toContain('If a child is in danger, address safety immediately');
    const all = nodes(tree);
    expect(all.findIndex((node) => node.type === 'ThemedText' && node.props.children === exercise.outro)).toBeLessThan(all.findIndex((node) => node.type === 'Button' && node.props.label === 'Done'));
    expect(player.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'saveProgress', completed: true }));
    press(tree, 'Done');
    expect(player.back).toHaveBeenCalledOnce();
  });
  it('completes normally without an optional outro', () => {
    const sample = content.activities.find((activity): activity is Exercise => activity.type === 'exercise');
    if (!sample) throw new Error('Missing exercise');
    const exercise = { ...sample, steps: [sample.steps[0]!], outro: undefined };
    const player = playerHarness('exercise');
    press(player.render({ exercise }), 'Start');
    press(player.render({ exercise }), 'Finish');
    const tree = player.render({ exercise });
    expect(displayedText(tree)).toContain('Exercise complete');
    expect(nodes(tree).some((node) => node.type === 'Button' && node.props.label === 'Done')).toBe(true);
  });
});
