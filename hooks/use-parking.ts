import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/** Where the user parked: a node of the venue and when it was saved. */
export type ParkingSpot = { nodeId: string; floorId: string; label: string; savedAt: number };

const KEY = 'spotway.parking.v1';
let spot: ParkingSpot | null = null;
let touched = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(KEY)
  .then((saved) => {
    // Something saved before the stored value finished loading wins.
    if (!saved || touched) return;
    const parsed = JSON.parse(saved) as Partial<ParkingSpot>;
    if (typeof parsed.nodeId === 'string' && typeof parsed.floorId === 'string') {
      spot = { nodeId: parsed.nodeId, floorId: parsed.floorId, label: parsed.label ?? '', savedAt: parsed.savedAt ?? 0 };
      emit();
    }
  })
  .catch(() => undefined);

export function saveParking(next: ParkingSpot | null) {
  touched = true;
  spot = next;
  emit();
  (next ? AsyncStorage.setItem(KEY, JSON.stringify(next)) : AsyncStorage.removeItem(KEY)).catch(() => undefined);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useParking = () => useSyncExternalStore(subscribe, () => spot, () => spot);
