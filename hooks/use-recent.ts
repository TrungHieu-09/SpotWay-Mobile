import { useSyncExternalStore } from 'react';

import { createPersistedList, sameStore, type StoreRef } from '@/hooks/persisted-list';

export const MAX_RECENT = 10;

const recent = createPersistedList('spotway.recent');

/** Puts a store at the top of the recent list: no duplicates, at most MAX_RECENT items. */
export function addRecent(ref: StoreRef) {
  recent.set([ref, ...recent.get().filter((r) => !sameStore(r, ref))].slice(0, MAX_RECENT));
}

export function clearRecent() {
  recent.set([]);
}

/** Recently opened stores, newest first. */
export function useRecent() {
  const list = useSyncExternalStore(recent.subscribe, recent.get, recent.get);
  return { recent: list, addRecent, clearRecent };
}
