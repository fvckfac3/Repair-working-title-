/** Local state is stored in unencrypted AsyncStorage; this is not an app lock. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { createLocalSnapshotStore } from './persistence';

export { initialState, latestResult, reducer } from './model';
export type { AppState, Checkin, JournalEntry, Progress, StoredResult, Visibility } from './model';

const STORAGE_KEY = 'repair/state/v1';
type LocalStore = ReturnType<typeof createLocalSnapshotStore>;
type StoreContextValue = ReturnType<LocalStore['getSnapshot']> & Pick<LocalStore, 'dispatch' | 'retryStorage' | 'deleteLocalSnapshot' | 'clearDeletionResult'>;

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createLocalSnapshotStore({
    read: () => AsyncStorage.getItem(STORAGE_KEY),
    write: (snapshot) => AsyncStorage.setItem(STORAGE_KEY, snapshot),
    remove: () => AsyncStorage.removeItem(STORAGE_KEY),
  }));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.start();
    return store.stop;
  }, [store]);

  const value = { ...snapshot, dispatch: store.dispatch, retryStorage: store.retryStorage, deleteLocalSnapshot: store.deleteLocalSnapshot, clearDeletionResult: store.clearDeletionResult };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
