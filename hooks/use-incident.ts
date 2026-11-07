import { useSyncExternalStore } from 'react';

import { setFireNodes } from '@/data/venue/venue';

/** A simulated incident anchored at a graph node of the real building. */
export type Incident = { floorId: string; nodeId: string; type: 'fire' | 'maintenance'; name: string };

// DEMO ONLY: a simulated incident kept in memory. No push notification is ever sent.
let incident: Incident | null = null;
const listeners = new Set<() => void>();

export function setIncident(next: Incident | null) {
  if (next === incident) return;
  incident = next;
  // The routing engine treats the node as blocked / on fire.
  setFireNodes(next ? [next.nodeId] : []);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The simulated incident, or null when there is none. */
export function useIncident(): [Incident | null, (next: Incident | null) => void] {
  const value = useSyncExternalStore(subscribe, () => incident, () => incident);
  return [value, setIncident];
}
