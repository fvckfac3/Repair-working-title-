import React from 'react';
// The workspace has the React DOM runtime but does not install its type package.
// @ts-expect-error Vitest renders with the installed react-dom/server runtime.
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deferRootScreen, rootNavigationAccess } from '../../../apps/mobile/src/state/access';
import { initialState, reducer } from '../../../apps/mobile/src/state/model';
import { createLocalSnapshotStore } from '../../../apps/mobile/src/state/persistence';

const navigation = vi.hoisted(() => ({
  route: { name: '(tabs)', params: {} as Record<string, string> },
  store: {} as Record<string, unknown>,
  guard: undefined as boolean | undefined,
  redirect: undefined as string | undefined,
  mounted: [] as string[],
  buttons: [] as { label: string; onPress: () => void }[],
  push: vi.fn(),
}));

vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn().mockResolvedValue(undefined),
  hideAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  const View = ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children);
  const Text = ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children);
  return {
    View,
    Text,
    Pressable: ({ children }: { children: React.ReactNode }) => React.createElement('button', null, children),
    StyleSheet: { create: (styles: unknown) => styles },
    useColorScheme: () => 'light',
  };
});

vi.mock('../../../apps/mobile/src/state/store', () => ({
  StoreProvider: ({ children }: { children: React.ReactNode }) => children,
  useStore: () => navigation.store,
}));

vi.mock('../../../apps/mobile/src/components/themed-text', async () => {
  const React = await import('react');
  return { ThemedText: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children) };
});

vi.mock('../../../apps/mobile/src/components/ui', async () => {
  const React = await import('react');
  return {
    Screen: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => {
      navigation.buttons.push({ label, onPress });
      return React.createElement('button', null, label);
    },
  };
});

// This mock models the root stack's registration and guard contract, not native transitions.
// Its child sentinel detects whether screenLayout actually mounts route content.
vi.mock('expo-router', async () => {
  const React = await import('react');
  const Protected = (_props: unknown) => null;
  const Screen = (_props: unknown) => null;
  function Scene() {
    navigation.mounted.push(navigation.route.name);
    return React.createElement('div', null,
      navigation.route.name === 'safety' ? 'Support resources' : `Content ${navigation.route.name} ${JSON.stringify(navigation.route.params)}`);
  }
  const Stack = Object.assign(function Stack({ children, screenLayout }: {
    children: React.ReactNode;
    screenLayout: (args: { route: typeof navigation.route; children: React.ReactElement }) => React.ReactElement;
  }) {
    function find(nodes: React.ReactNode, guard = true, redirect?: string): void {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement<{ name?: string; guard?: boolean; redirectTo?: string; children?: React.ReactNode }>(child)) return;
        if (child.type === Protected) find(child.props.children, guard && !!child.props.guard, child.props.redirectTo);
        if (child.type === Screen && child.props.name === navigation.route.name) {
          navigation.guard = guard;
          navigation.redirect = redirect;
        }
      });
    }
    find(children);
    const screen = navigation.guard
      ? React.createElement(Scene)
      : React.createElement('div', null, `Redirect ${navigation.redirect}`);
    return screenLayout({ route: navigation.route, children: screen });
  }, { Protected, Screen });
  return {
    Stack,
    router: { push: navigation.push },
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
    DarkTheme: {}, DefaultTheme: {},
  };
});

// @ts-expect-error Vitest transforms Expo TSX; the scoring project does not enable JSX.
import RootLayout from '../../../apps/mobile/src/app/_layout';

const hydrated = reducer(initialState, { type: 'hydrate', state: {} });
const screened = { ...hydrated, safetyScreenDone: true };

function render(route: string, state = initialState, status = 'loading', params: Record<string, string> = {}) {
  navigation.route = { name: route, params };
  navigation.store = { state, storageStatus: status, retryStorage: vi.fn() };
  navigation.guard = undefined;
  navigation.redirect = undefined;
  navigation.mounted = [];
  navigation.buttons = [];
  return renderToStaticMarkup(React.createElement(RootLayout));
}

describe('cold-start root navigation', () => {
  beforeEach(() => { vi.stubGlobal('__DEV__', true); navigation.push.mockReset(); });

  it.each([
    ['module/[slug]', { slug: 'calming-the-storm', from: 'link' }],
    ['activity/[id]', { id: 'cts-conflict-temperature', from: 'link' }],
    ['(tabs)', { screen: 'library' }],
  ])('retains %s and its parameters without mounting content during a delayed read', (route, params) => {
    const loading = render(route, initialState, 'loading', params);
    expect(navigation.guard).toBe(true);
    expect(navigation.mounted).toEqual([]);
    expect(loading).toContain('Reading saved data');
    expect(loading).not.toContain('Content');
    const ready = render(route, screened, 'ready', params);
    expect(navigation.guard).toBe(true);
    expect(navigation.mounted).toEqual([route]);
    expect(ready).toContain(route);
    expect(ready).toContain(Object.values(params)[0]);
  });

  it('keeps the direct support route usable during loading, failure and timeout', () => {
    for (const status of ['loading', 'read-error']) {
      expect(render('safety', initialState, status)).toContain('Support resources');
      expect(navigation.mounted).toEqual(['safety']);
    }
  });

  it('offers support and retry without abandoning or rendering the pending route', () => {
    const text = render('activity/[id]', initialState, 'read-error', { id: 'draft' });
    expect(navigation.guard).toBe(true);
    expect(navigation.mounted).toEqual([]);
    expect(text).toContain('Saved data could not be read');
    navigation.buttons.find((button) => button.label === 'Safety & Support')?.onPress();
    expect(navigation.push).toHaveBeenCalledWith('/safety');
    navigation.buttons.find((button) => button.label === 'Retry reading data')?.onPress();
    expect(navigation.store.retryStorage).toHaveBeenCalledOnce();
    expect(render('activity/[id]', initialState, 'loading', { id: 'draft' })).toContain('Reading saved data');
    expect(navigation.mounted).toEqual([]);
    expect(render('activity/[id]', screened, 'ready', { id: 'draft' })).toContain('draft');
  });

  it('does not interrupt an explicit visit to support when hydration completes', () => {
    render('module/[slug]', initialState, 'loading', { slug: 'calming-the-storm' });
    navigation.buttons.find((button) => button.label === 'Safety & Support')?.onPress();
    expect(navigation.push).toHaveBeenCalledWith('/safety');
    expect(render('safety', initialState, 'loading')).toContain('Support resources');
    expect(render('safety', screened, 'ready')).toContain('Support resources');
    expect(render('module/[slug]', screened, 'ready', { slug: 'calming-the-storm' })).toContain('calming-the-storm');
  });

  it('continues to defer a timed-out route until a retry wins over a late read', async () => {
    vi.useFakeTimers();
    const reads: ((value: string | null) => void)[] = [];
    const store = createLocalSnapshotStore({
      read: () => new Promise<string | null>((resolve) => { reads.push(resolve); }),
      write: async () => {},
      remove: async () => {},
    }, 50);
    const params = { slug: 'calming-the-storm', from: 'deep-link' };
    const snapshot = () => store.getSnapshot();
    const show = () => render('module/[slug]', snapshot().state, snapshot().storageStatus, params);
    try {
      store.start();
      await Promise.resolve();
      expect(show()).toContain('Reading saved data');
      vi.advanceTimersByTime(50);
      expect(show()).toContain('Saved data could not be read');
      expect(navigation.mounted).toEqual([]);
      store.retryStorage();
      await Promise.resolve();
      expect(show()).toContain('Reading saved data');
      reads[0]!(JSON.stringify({ safetyScreenDone: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(show()).toContain('Reading saved data');
      expect(navigation.mounted).toEqual([]);
      reads[1]!(JSON.stringify({ safetyScreenDone: true }));
      await Promise.resolve(); await Promise.resolve();
      expect(show()).toContain('calming-the-storm');
      expect(navigation.mounted).toEqual(['module/[slug]']);
    } finally {
      store.stop();
      vi.useRealTimers();
    }
  });

  it('applies guards on the first render after read, including release and safety mode', () => {
    for (const [dev, state] of [[true, hydrated], [true, { ...screened, safetyMode: true }], [false, screened]] as const) {
      vi.stubGlobal('__DEV__', dev);
      render('module/[slug]', initialState, 'loading', { slug: 'x' });
      const output = render('module/[slug]', state, 'ready', { slug: 'x' });
      expect(navigation.guard).toBe(false);
      expect(navigation.redirect).toBe('/safety');
      expect(navigation.mounted).toEqual([]);
      expect(output).toContain('Redirect /safety');
    }
    vi.stubGlobal('__DEV__', false);
    expect(render('activity/[id]', screened, 'ready', { id: 'x' })).toContain('Redirect /safety');
    expect(navigation.mounted).toEqual([]);
  });
});

describe('hydration decision policy', () => {
  it('requires both hydrated state and completed read status, but tolerates write errors', () => {
    for (const status of ['loading', 'read-error'] as const) {
      expect(rootNavigationAccess(true, screened, status).awaitingRead).toBe(true);
      expect(rootNavigationAccess(true, initialState, status).awaitingRead).toBe(true);
    }
    expect(rootNavigationAccess(true, initialState, 'ready').awaitingRead).toBe(true);
    expect(rootNavigationAccess(true, screened, 'ready').awaitingRead).toBe(false);
    expect(rootNavigationAccess(true, screened, 'write-error')).toEqual({
      awaitingRead: false, normalRouteRegistered: true, activityRouteRegistered: true,
    });
  });

  it('keeps only support renderable during a read, including implicit routes', () => {
    for (const name of ['(tabs)', 'module/[slug]', 'activity/[id]', '+not-found']) {
      expect(deferRootScreen(true, name)).toBe(true);
      expect(deferRootScreen(false, name)).toBe(false);
    }
    expect(deferRootScreen(true, 'safety')).toBe(false);
  });

  it('continues to route the safety check through the activity screen after a read', () => {
    expect(rootNavigationAccess(true, hydrated, 'ready')).toEqual({
      awaitingRead: false, normalRouteRegistered: false, activityRouteRegistered: true,
    });
    expect(rootNavigationAccess(true, { ...screened, safetyMode: true }, 'ready').activityRouteRegistered).toBe(true);
    expect(rootNavigationAccess(false, screened, 'ready').activityRouteRegistered).toBe(false);
  });
});
