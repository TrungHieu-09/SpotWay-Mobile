import { useSyncExternalStore } from 'react';

import { createPersistedList, sameStore, type StoreRef } from '@/hooks/persisted-list';

const favorites = createPersistedList('spotway.favorites');

export function toggleFavorite(ref: StoreRef) {
  const list = favorites.get();
  favorites.set(list.some((r) => sameStore(r, ref)) ? list.filter((r) => !sameStore(r, ref)) : [ref, ...list]);
}

/** Favourite stores (newest first) and a toggle. */
export function useFavorites() {
  const list = useSyncExternalStore(favorites.subscribe, favorites.get, favorites.get);
  return {
    favorites: list,
    isFavorite: (ref: StoreRef) => list.some((r) => sameStore(r, ref)),
    toggleFavorite,
  };
}
