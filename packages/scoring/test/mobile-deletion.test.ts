import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { createLocalSnapshotStore } from '../../../apps/mobile/src/state/persistence';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fakeStorage(initial: string | null) {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (next: string) => { value = next; }),
    remove: vi.fn(async () => { value = null; }),
    value: () => value,
    set: (next: string | null) => { value = next; },
  };
}

async function start(store: ReturnType<typeof createLocalSnapshotStore>) {
  store.start();
  await vi.waitFor(() => expect(store.getSnapshot().storageStatus).not.toBe('loading'));
}

describe('confirmed local snapshot deletion', () => {
  it('fails closed on unreadable data until an explicit deletion succeeds', async () => {
    const storage = fakeStorage('{broken');
    const removal = deferred<void>();
    storage.remove.mockImplementationOnce(() => removal.promise.then(() => { storage.set(null); }));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    expect(store.getSnapshot().storageStatus).toBe('read-error');
    store.dispatch({ type: 'confirmAdult' });
    store.retryStorage();
    await vi.waitFor(() => expect(store.getSnapshot().storageStatus).toBe('read-error'));
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(storage.value()).toBe('{broken');

    const deleting = store.deleteLocalSnapshot();
    await vi.waitFor(() => expect(storage.remove).toHaveBeenCalledOnce());
    expect(store.getSnapshot().deleting).toBe(true);
    expect(store.getSnapshot().state.hydrated).toBe(false);
    removal.resolve();
    await deleting;
    expect(store.getSnapshot()).toMatchObject({ deleting: false, storageStatus: 'ready', state: { hydrated: true, safetyScreenDone: false, safetyMode: false, journal: [] } });
    expect(storage.value()).toBeNull();
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('ignores an old read that completes after confirmed removal', async () => {
    const read = deferred<string | null>();
    const storage = { read: vi.fn(() => read.promise), write: vi.fn(async (_: string) => {}), remove: vi.fn(async () => {}) };
    const store = createLocalSnapshotStore(storage);
    store.start();
    await Promise.resolve();
    await store.deleteLocalSnapshot();
    read.resolve('{"safetyMode":true,"safetyScreenDone":true}');
    await Promise.resolve(); await Promise.resolve();
    expect(store.getSnapshot().state).toMatchObject({ hydrated: true, safetyMode: false, safetyScreenDone: false });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('does not write after a storage read rejection and can retry reading existing data', async () => {
    const storage = fakeStorage('{"safetyMode":true}');
    storage.read.mockRejectedValueOnce(new Error('read failed'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    expect(store.getSnapshot().storageStatus).toBe('read-error');
    expect(storage.write).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    store.retryStorage();
    await vi.waitFor(() => expect(store.getSnapshot().storageStatus).toBe('ready'));
    expect(store.getSnapshot().state).toMatchObject({ hydrated: true, safetyMode: true, adultConfirmed: false });
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('waits for an in-flight write, discards queued snapshots and blocks edits during removal', async () => {
    const firstWrite = deferred<void>();
    let stored: string | null = '{"safetyScreenDone":true,"safetyMode":true}';
    const events: string[] = [];
    const storage = {
      read: vi.fn(async () => stored),
      write: vi.fn(async (value: string) => { events.push('write-start'); await firstWrite.promise; stored = value; events.push('write-end'); }),
      remove: vi.fn(async () => { events.push('remove'); stored = null; }),
    };
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    store.dispatch({ type: 'setSafetyMode', on: false });
    const deleting = store.deleteLocalSnapshot();
    store.dispatch({ type: 'setSafetyMode', on: true });
    await Promise.resolve();
    expect(events).toEqual(['write-start']);
    expect(store.getSnapshot().state.safetyMode).toBe(false);
    firstWrite.resolve();
    await deleting;
    expect(events).toEqual(['write-start', 'write-end', 'remove']);
    expect(storage.write).toHaveBeenCalledOnce();
    expect(stored).toBeNull();
    expect(store.getSnapshot().state).toMatchObject({ hydrated: true, adultConfirmed: false, safetyMode: false });
  });

  it('does not claim success or reset memory on removal failure and allows a confirmed retry', async () => {
    const storage = fakeStorage('{"safetyScreenDone":true,"safetyMode":true}');
    storage.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    await expect(store.deleteLocalSnapshot()).rejects.toThrow();
    expect(storage.value()).not.toBeNull();
    expect(store.getSnapshot()).toMatchObject({ deleting: false, state: { hydrated: true, safetyMode: true } });
    await store.deleteLocalSnapshot();
    expect(storage.value()).toBeNull();
    expect(store.getSnapshot().state.safetyMode).toBe(false);
  });

  it('keeps unreadable data fail-closed when removal itself fails', async () => {
    const storage = fakeStorage('bad data');
    storage.remove.mockRejectedValueOnce(new Error('remove failed'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    await expect(store.deleteLocalSnapshot()).rejects.toThrow();
    store.dispatch({ type: 'confirmAdult' });
    expect(store.getSnapshot()).toMatchObject({ storageStatus: 'read-error', state: { hydrated: false } });
    expect(storage.value()).toBe('bad data');
    expect(storage.write).not.toHaveBeenCalled();
  });

  it('retains failed pending writes if deletion fails and lets the user retry saving', async () => {
    const storage = fakeStorage('{}');
    storage.write.mockRejectedValueOnce(new Error('write failed'));
    storage.remove.mockRejectedValueOnce(new Error('remove failed'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    await vi.waitFor(() => expect(store.getSnapshot().storageStatus).toBe('write-error'));
    await expect(store.deleteLocalSnapshot()).rejects.toThrow();
    expect(store.getSnapshot().state.adultConfirmed).toBe(true);
    store.retryStorage();
    await vi.waitFor(() => expect(store.getSnapshot().storageStatus).toBe('ready'));
    expect(JSON.parse(storage.value()!).adultConfirmed).toBe(true);
  });

  it('reports a newer queued edit as unsaved if deletion fails after an older write', async () => {
    const firstWrite = deferred<void>();
    const storage = fakeStorage('{}');
    storage.write.mockImplementationOnce(async (value) => { await firstWrite.promise; storage.set(value); });
    storage.remove.mockRejectedValueOnce(new Error('remove failed'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    store.dispatch({ type: 'setSafetyMode', on: true });
    const deletion = store.deleteLocalSnapshot();
    firstWrite.resolve();
    await expect(deletion).rejects.toThrow();
    expect(JSON.parse(storage.value()!).safetyMode).toBe(false);
    expect(store.getSnapshot()).toMatchObject({ storageStatus: 'write-error', deletionResult: 'error', state: { safetyMode: true } });
    store.retryStorage();
    await vi.waitFor(() => expect(store.getSnapshot().storageStatus).toBe('ready'));
    expect(JSON.parse(storage.value()!).safetyMode).toBe(true);
  });

  it('still removes the snapshot if an older in-flight write fails', async () => {
    const firstWrite = deferred<void>();
    const storage = fakeStorage('{"safetyMode":true}');
    storage.write.mockImplementationOnce(() => firstWrite.promise);
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    const deletion = store.deleteLocalSnapshot();
    firstWrite.reject(new Error('write failed'));
    await deletion;
    expect(storage.value()).toBeNull();
    expect(store.getSnapshot()).toMatchObject({ storageStatus: 'ready', deletionResult: 'success', state: { safetyMode: false } });
  });

  it('does not clear an unsaved serialization error when an older write finishes', async () => {
    const firstWrite = deferred<void>();
    const storage = fakeStorage('{}');
    storage.write.mockImplementationOnce(() => firstWrite.promise);
    const store = createLocalSnapshotStore(storage);
    await start(store);
    store.dispatch({ type: 'confirmAdult' });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    store.dispatch({ type: 'saveProgress', activityId: 'test', data: cyclic, completed: false });
    expect(store.getSnapshot().storageStatus).toBe('write-error');
    firstWrite.resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(store.getSnapshot().storageStatus).toBe('write-error');
    store.retryStorage();
    expect(store.getSnapshot().storageStatus).toBe('write-error');
    await store.deleteLocalSnapshot();
    expect(store.getSnapshot().storageStatus).toBe('ready');
  });

  it('times out and ignores late reads without overwriting data', async () => {
    const read = deferred<string | null>();
    const storage = { read: vi.fn(() => read.promise), write: vi.fn(async (_: string) => {}), remove: vi.fn(async () => {}) };
    const store = createLocalSnapshotStore(storage, 5);
    await start(store);
    expect(store.getSnapshot().storageStatus).toBe('read-error');
    read.resolve('{}');
    await Promise.resolve(); await Promise.resolve();
    expect(store.getSnapshot().state.hydrated).toBe(false);
    expect(storage.write).not.toHaveBeenCalled();
  });
});

// Render the real screen's JSX with small stand-ins for native components and hooks.
// This avoids real device storage and works without a native renderer or browser DOM.
type Node = { type: unknown; props: Record<string, unknown> } | string | number | null | undefined;
function safetyHarness(store: ReturnType<typeof createLocalSnapshotStore>, development: boolean) {
  const state: unknown[] = [];
  let hook = 0;
  const react = {
    useState(initial: unknown) {
      const index = hook++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (next: unknown) => { state[index] = typeof next === 'function' ? (next as (v: unknown) => unknown)(state[index]) : next; }];
    },
    createElement(type: unknown, props: Record<string, unknown> | null, ...children: Node[]): Node {
      return { type, props: { ...props, children } };
    },
    Fragment: 'Fragment',
  };
  const source = readFileSync(new URL('../../../apps/mobile/src/app/safety.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} as { default: () => Node } };
  const imports: Record<string, unknown> = {
    'expo-router': { router: { push: vi.fn(), replace: vi.fn() } },
    react,
    'react-native': { Linking: { openURL: vi.fn() } },
    '@/components/themed-text': { ThemedText: 'Text' },
    '@/components/ui': { Button: 'Button', Card: 'Card', Screen: 'Screen', Section: 'Section' },
    '@/content': { resources: () => [], safetyScreen: { id: 'safety' } },
    '@/state/store': { useStore: () => ({ ...store.getSnapshot(), dispatch: store.dispatch, retryStorage: store.retryStorage, deleteLocalSnapshot: store.deleteLocalSnapshot, clearDeletionResult: store.clearDeletionResult }) },
  };
  const factory = vm.runInNewContext(`(function(require, module, exports, React, __DEV__) { ${compiled}\n})`) as (...args: unknown[]) => void;
  factory((name: string) => imports[name], mod, mod.exports, react, development);
  return () => { hook = 0; return mod.exports.default(); };
}

function findNodes(node: unknown, predicate: (value: Exclude<Node, string | number | null | undefined>) => boolean): Exclude<Node, string | number | null | undefined>[] {
  if (Array.isArray(node)) return node.flatMap((child) => findNodes(child, predicate));
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const element = node as Exclude<Node, string | number | null | undefined>;
  return [...(predicate(element) ? [element] : []), ...findNodes(element.props.children, predicate)];
}
function button(tree: Node, label: string) {
  const found = findNodes(tree, (node) => node.type === 'Button' && node.props.label === label)[0];
  if (!found) throw new Error(`Missing button: ${label}`);
  return found.props.onPress as () => void;
}
function text(tree: Node): string {
  if (Array.isArray(tree)) return tree.map(text).join(' ');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (!tree || typeof tree !== 'object') return '';
  return text(tree.props.children as Node);
}

describe('Safety & Support deletion UI', () => {
  for (const scenario of [
    { name: 'safety mode in development', development: true, initial: '{"safetyScreenDone":true,"safetyMode":true}' },
    { name: 'safety mode in a release build', development: false, initial: '{"safetyScreenDone":true,"safetyMode":true}' },
    { name: 'unreadable data in a release build', development: false, initial: 'invalid data' },
  ]) {
    it(`offers two-step deletion with cancel and accurate outcomes in ${scenario.name}`, async () => {
      const storage = fakeStorage(scenario.initial);
      const removal = deferred<void>();
      storage.remove.mockImplementationOnce(async () => { await removal.promise; storage.set(null); });
      const store = createLocalSnapshotStore(storage);
      await start(store);
      const render = safetyHarness(store, scenario.development);
      expect(text(render())).toContain('backups');
      button(render(), 'Review deletion of local data')();
      expect(text(render())).toContain('resets the safety check and safety mode');
      expect(storage.remove).not.toHaveBeenCalled();
      button(render(), 'Cancel deletion')();
      expect(storage.remove).not.toHaveBeenCalled();
      button(render(), 'Review deletion of local data')();
      button(render(), 'Confirm delete local snapshot')();
      await vi.waitFor(() => expect(storage.remove).toHaveBeenCalledOnce());
      expect(text(render())).toContain('Deletion is in progress');
      expect(text(render())).not.toContain('was removed from app storage');
      removal.resolve();
      await vi.waitFor(() => expect(text(render())).toContain('was removed from app storage'));
      expect(text(render())).toContain('may remain');
      expect(storage.value()).toBeNull();
      expect(text(safetyHarness(store, scenario.development)())).toContain('was removed from app storage');
    });
  }

  it('reports removal failure, leaves data intact, and requires confirmation again on retry', async () => {
    const storage = fakeStorage('{"safetyMode":true}');
    storage.remove.mockRejectedValueOnce(new Error('failed'));
    const store = createLocalSnapshotStore(storage);
    await start(store);
    const render = safetyHarness(store, false);
    button(render(), 'Review deletion of local data')();
    button(render(), 'Confirm delete local snapshot')();
    await vi.waitFor(() => expect(text(render())).toContain('Deletion could not be confirmed'));
    expect(storage.value()).not.toBeNull();
    expect(text(render())).not.toContain('was removed from app storage');
    expect(text(safetyHarness(store, false)())).toContain('Deletion could not be confirmed');
    button(render(), 'Confirm delete local snapshot')();
    await vi.waitFor(() => expect(text(render())).toContain('was removed from app storage'));
    expect(storage.value()).toBeNull();
  });
});

describe('profile deletion entry point', () => {
  for (const platform of ['ios', 'web']) {
    it(`opens the shared confirmation screen on ${platform} instead of claiming deletion`, () => {
      const push = vi.fn();
      const alert = vi.fn();
      const confirm = vi.fn();
      const remove = vi.fn();
      const store = createLocalSnapshotStore(fakeStorage('{}'));
      const react = {
        useState: (initial: unknown) => [initial, vi.fn()],
        createElement: (type: unknown, props: Record<string, unknown> | null, ...children: Node[]): Node => ({ type, props: { ...props, children } }),
        Fragment: 'Fragment',
      };
      const source = readFileSync(new URL('../../../apps/mobile/src/app/(tabs)/profile.tsx', import.meta.url), 'utf8');
      const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
      const mod = { exports: {} as { default: () => Node } };
      const imports: Record<string, unknown> = {
        'expo-router': { router: { push } },
        react,
        'react-native': { Alert: { alert }, Platform: { OS: platform } },
        '@/components/themed-text': { ThemedText: 'Text' },
        '@/components/ui': { Button: 'Button', Card: 'Card', Screen: 'Screen', Section: 'Section' },
        '@/content': { onboardingAssessment: { id: 'assessment', title: 'Assessment' } },
        '@/state/store': { useStore: () => ({ state: store.getSnapshot().state, dispatch: vi.fn(), deleteLocalSnapshot: remove }) },
      };
      const factory = vm.runInNewContext(`(function(require, module, exports, React) { ${compiled}\n})`, { confirm }) as (...args: unknown[]) => void;
      factory((name: string) => imports[name], mod, mod.exports, react);
      button(mod.exports.default(), 'Review deletion in Safety & Support')();
      expect(push).toHaveBeenCalledWith('/safety');
      expect(alert).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    });
  }
});
