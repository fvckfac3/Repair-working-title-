import { initialState, parseStoredState, reducer, type Action, type AppState } from './model';

/** Serialize writes and retain the newest snapshot after a failed write. */
export function createPersistenceQueue(
  write: (snapshot: string) => Promise<void>,
  onError: () => void,
  onSaved: () => void,
) {
  let pending: string | null = null;
  let writing: Promise<void> | null = null;
  let activeWrite: { snapshot: string; succeeded: boolean } | null = null;
  let deleting = false;
  let removal: Promise<void> | null = null;

  function flush(): void {
    if (writing || deleting || pending === null) return;
    const run = async () => {
      while (pending !== null && !deleting) {
        const snapshot: string = pending;
        const attempt = { snapshot, succeeded: false };
        activeWrite = attempt;
        try {
          await write(snapshot);
          attempt.succeeded = true;
        } catch {
          return false;
        }
        // A newer snapshot may have arrived while this write was in flight.
        if (pending === snapshot) pending = null;
      }
      return true;
    };
    writing = run().then((success) => {
      writing = null;
      activeWrite = null;
      if (!success) onError();
      else if (!deleting && pending !== null) flush();
      else if (!deleting) onSaved();
    });
  }

  return {
    enqueue(snapshot: string) {
      if (deleting) return;
      pending = snapshot;
      flush();
    },
    retry() { flush(); },
    /** Discard queued snapshots and wait for any in-flight write before removal. */
    remove(remove: () => Promise<void>): Promise<void> {
      if (removal) return removal;
      deleting = true;
      const previousPending = pending;
      pending = null;
      const currentWrite = writing;
      const currentAttempt = activeWrite;
      removal = (async () => {
        // Always yield so removal is assigned before synchronous failures are handled.
        await Promise.resolve();
        try {
          if (currentWrite) await currentWrite;
          await remove();
        } catch (error) {
          // Do not lose unsaved changes if removal fails; a later retry can save them.
          pending = currentAttempt?.succeeded && currentAttempt.snapshot === previousPending ? null : previousPending;
          if (pending !== null) onError();
          throw error;
        } finally {
          deleting = false;
          removal = null;
        }
      })();
      return removal;
    },
  };
}

export type StorageStatus = 'loading' | 'ready' | 'read-error' | 'write-error';
type UserAction = Exclude<Action, { type: 'hydrate' | 'reset' }>;
type Snapshot = { state: AppState; storageStatus: StorageStatus; deleting: boolean; deletionResult: 'idle' | 'success' | 'error' };

/** Coordinates hydration, edits and confirmed removal for one local snapshot. */
export function createLocalSnapshotStore(storage: {
  read: () => Promise<string | null>;
  write: (snapshot: string) => Promise<void>;
  remove: () => Promise<void>;
}, readTimeoutMs = 8000) {
  let snapshot: Snapshot = { state: initialState, storageStatus: 'loading', deleting: false, deletionResult: 'idle' };
  const listeners = new Set<() => void>();
  let readGeneration = 0;
  let readTimeout: ReturnType<typeof setTimeout> | undefined;
  let removal: Promise<void> | null = null;
  let serializationError = false;

  const update = (changes: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
  };
  const invalidateRead = () => {
    readGeneration += 1;
    if (readTimeout !== undefined) clearTimeout(readTimeout);
    readTimeout = undefined;
  };
  const queue = createPersistenceQueue(
    storage.write,
    () => update({ storageStatus: 'write-error' }),
    () => { if (!serializationError) update({ storageStatus: 'ready' }); },
  );

  const saveState = (state: AppState) => {
    try {
      const { hydrated: _ignored, ...persisted } = state;
      const serialized = JSON.stringify(persisted);
      serializationError = false;
      queue.enqueue(serialized);
    } catch {
      serializationError = true;
      update({ storageStatus: 'write-error' });
    }
  };

  const startRead = () => {
    if (snapshot.deleting || snapshot.state.hydrated) return;
    invalidateRead();
    const generation = readGeneration;
    update({ storageStatus: 'loading' });
    readTimeout = setTimeout(() => {
      if (generation !== readGeneration) return;
      invalidateRead();
      update({ storageStatus: 'read-error' });
    }, readTimeoutMs);
    Promise.resolve().then(storage.read).then((json) => {
      const saved = parseStoredState(json);
      if (generation !== readGeneration) return;
      invalidateRead();
      update({ state: reducer(initialState, { type: 'hydrate', state: saved }), storageStatus: 'ready' });
    }).catch(() => {
      if (generation !== readGeneration) return;
      invalidateRead();
      update({ storageStatus: 'read-error' });
    });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start: startRead,
    stop: invalidateRead,
    dispatch(action: UserAction) {
      if (snapshot.deleting) return;
      const state = reducer(snapshot.state, action);
      if (state === snapshot.state) return;
      update({ state });
      if (!state.hydrated) return;
      saveState(state);
    },
    retryStorage() {
      if (snapshot.deleting) return;
      if (snapshot.storageStatus === 'read-error') startRead();
      else if (snapshot.storageStatus === 'write-error') {
        if (serializationError) saveState(snapshot.state);
        else queue.retry();
      }
    },
    clearDeletionResult() {
      if (!snapshot.deleting && snapshot.deletionResult !== 'idle') update({ deletionResult: 'idle' });
    },
    /** Call only after the user has explicitly confirmed deletion. */
    deleteLocalSnapshot(): Promise<void> {
      if (removal) return removal;
      invalidateRead();
      update({ deleting: true, deletionResult: 'idle' });
      removal = queue.remove(storage.remove).then(() => {
        serializationError = false;
        update({ state: reducer(initialState, { type: 'hydrate', state: {} }), storageStatus: 'ready', deleting: false, deletionResult: 'success' });
      }, (error) => {
        // A canceled or failed read must stay fail-closed after a failed removal.
        update({ storageStatus: snapshot.state.hydrated ? snapshot.storageStatus : 'read-error', deleting: false, deletionResult: 'error' });
        throw error;
      }).finally(() => { removal = null; });
      return removal;
    },
  };
}
