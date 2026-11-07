import AsyncStorage from '@react-native-async-storage/async-storage';

/** A store reference. Store ids repeat across floors, so the floor is part of the identity. */
export type StoreRef = { id: string; floor: string };

export const sameStore = (a: StoreRef, b: StoreRef) => a.id === b.id && a.floor === b.floor;

const isStoreRef = (v: unknown): v is StoreRef =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as StoreRef).id === 'string' &&
  typeof (v as StoreRef).floor === 'string';

/** Small shared store of StoreRef lists saved in AsyncStorage (usable with useSyncExternalStore). */
export function createPersistedList(key: string) {
  let value: StoreRef[] = [];
  let touched = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const save = () => AsyncStorage.setItem(key, JSON.stringify(value)).catch(() => {});

  AsyncStorage.getItem(key)
    .then((saved) => {
      // A change made before the saved list finished loading wins over the old data.
      if (saved === null || touched) return;
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        value = parsed.filter(isStoreRef);
        emit();
      }
    })
    .catch(() => {});

  return {
    get: () => value,
    set: (next: StoreRef[]) => {
      touched = true;
      value = next;
      save();
      emit();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
