import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { canOpenActivity } from '../../../apps/mobile/src/state/access';
import { initialState, reducer, type AppState } from '../../../apps/mobile/src/state/model';

interface Node { type: string | ((props: Record<string, unknown>) => unknown); props: Record<string, unknown> }

/** Execute the actual route component with small UI/content stubs; no native navigator is emulated. */
function routeNodes(route: 'activity/[id]' | 'module/[slug]', state: AppState, development = true, id = 'locked-lesson'): Node[] {
  const activity = { id, type: 'lesson', module: id === 'safety' ? 'global' : 'locked', title: 'Relationship lesson', summary: 'Summary', minutes: 5, mode: 'solo' };
  const mod = { slug: 'locked', title: 'Locked module', description: 'Description', intensity: 'low', status: 'in_review', outline: {}, gating: { adultsOnly: true, confirmations: ['Confirm'], therapistRecommended: false } };
  const jsx = (type: Node['type'], props: Node['props']) => ({ type, props: props ?? {} });
  const ui = { Screen: 'Screen', Card: 'Card', Button: 'Button', ProgressBar: 'ProgressBar', Section: 'Section', Option: 'Option', Pill: 'Pill' };
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: { useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}] },
    'react-native': { StyleSheet: { create: (styles: unknown) => styles }, View: 'View' },
    'expo-router': { router: {}, Stack: { Screen: 'Stack.Screen' }, useLocalSearchParams: () => ({ id, slug: 'locked' }) },
    '@/components/themed-text': { ThemedText: 'ThemedText' },
    '@/components/ui': ui,
    '@/content': {
      getActivity: () => activity,
      getModule: (slug: string) => slug === 'locked' ? mod : undefined,
      isHiddenForSafety: (value: { id: string }) => value.id !== 'safety',
      safetyScreen: { id: 'safety' },
      activitiesFor: () => [activity],
      outlinePlanned: () => [],
      TYPE_LABELS: { lesson: 'Lesson' },
    },
    '@/state/store': { useStore: () => ({ state, dispatch: () => {} }), latestResult: () => undefined },
    '@/state/access': { canOpenActivity },
    '@/features/players/assessment': { AssessmentPlayer: 'AssessmentPlayer' },
    '@/features/players/conversation': { ConversationPlayer: 'ConversationPlayer' },
    '@/features/players/exercise': { ExercisePlayer: 'ExercisePlayer' },
    '@/features/players/journal': { JournalPlayer: 'JournalPlayer' },
    '@/features/players/lesson': { LessonPlayer: 'LessonPlayer' },
    '@/features/players/ritual': { RitualPlayer: 'RitualPlayer' },
  };
  const source = readFileSync(resolve(process.cwd(), `apps/mobile/src/app/${route}.tsx`), 'utf8');
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports: { default?: () => unknown } = {};
  runInNewContext(javascript, { exports, __DEV__: development, require: (name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected route import: ${name}`);
    return modules[name];
  } });
  const visit = (value: unknown): Node[] => {
    if (Array.isArray(value)) return value.flatMap(visit);
    if (!value || typeof value !== 'object' || !('type' in value) || !('props' in value)) return [];
    const node = value as Node;
    if (typeof node.type === 'function') return visit(node.type(node.props));
    return [node, ...visit(node.props.children)];
  };
  if (!exports.default) throw new Error('Missing route');
  return visit(exports.default());
}

const hydrated = reducer(initialState, { type: 'hydrate', state: {} });
const screened = { ...hydrated, safetyScreenDone: true };
const adult = { ...screened, adultConfirmed: true };
const accepted = { ...adult, gatesAccepted: { locked: '2026-01-01' } };
const hasType = (nodes: Node[], type: string) => nodes.some((node) => node.type === type);
const hasLabel = (nodes: Node[], label: string) => nodes.some((node) => node.type === 'Button' && node.props.label === label);

describe('real route gates after hydration', () => {
  it('blocks activity players for missing screening, safety mode, age, confirmations, and release', () => {
    for (const [state, dev] of [
      [initialState, true], [hydrated, true], [{ ...accepted, safetyMode: true }, true],
      [screened, true], [adult, true], [accepted, false],
    ] as const) {
      expect(hasType(routeNodes('activity/[id]', state, dev), 'LessonPlayer')).toBe(false);
    }
    expect(hasType(routeNodes('activity/[id]', accepted), 'LessonPlayer')).toBe(true);
  });

  it('allows the safety check before screening and in safety mode, but not before read or in release', () => {
    expect(hasType(routeNodes('activity/[id]', hydrated, true, 'safety'), 'LessonPlayer')).toBe(true);
    expect(hasType(routeNodes('activity/[id]', { ...hydrated, safetyMode: true }, true, 'safety'), 'LessonPlayer')).toBe(true);
    expect(hasType(routeNodes('activity/[id]', initialState, true, 'safety'), 'LessonPlayer')).toBe(false);
    expect(hasType(routeNodes('activity/[id]', hydrated, false, 'safety'), 'LessonPlayer')).toBe(false);
  });

  it('shows age and module confirmations before exposing their activities', () => {
    const needsAge = routeNodes('module/[slug]', screened);
    expect(hasLabel(needsAge, "I confirm I'm 18 or older")).toBe(true);
    expect(hasType(needsAge, 'Pill')).toBe(true); // only the module metadata, not an activity row
    expect(needsAge.some((node) => node.props.children === 'Relationship lesson')).toBe(false);
    const needsConfirmation = routeNodes('module/[slug]', adult);
    expect(hasType(needsConfirmation, 'Option')).toBe(true);
    expect(needsConfirmation.some((node) => node.props.children === 'Relationship lesson')).toBe(false);
    const unlocked = routeNodes('module/[slug]', accepted);
    expect(unlocked.some((node) => node.props.children === 'Relationship lesson')).toBe(true);
  });
});
