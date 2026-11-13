import { useMemo, useSyncExternalStore } from 'react';

import { nodeById, setFireNodes, useVenue, type RemoteIncident } from '@/data/venue/venue';

/** An incident anchored at a graph node of the real building. */
export type Incident = { floorId: string; nodeId: string; type: 'fire' | 'maintenance'; name: string; remote?: boolean };

// A locally simulated incident (demo panel), kept in memory. The real one comes from the building staff via the backend.
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

function fromRemote(remote: RemoteIncident): Incident | null {
  const nodeId = remote.nodeIds[0];
  if (!nodeId) return null;
  return {
    floorId: nodeById(nodeId)?.floorId ?? remote.floorIds[0] ?? '',
    nodeId,
    type: 'fire',
    name: remote.message ?? nodeById(nodeId)?.name ?? '',
    remote: true,
  };
}

/** The active incident (a simulated one wins, else the one raised by the building staff) or null, and a setter for the simulated one. */
export function useIncident(): [Incident | null, (next: Incident | null) => void] {
  const local = useSyncExternalStore(subscribe, () => incident, () => incident);
  const remote = useVenue().remoteIncident;
  const value = useMemo(() => local ?? (remote ? fromRemote(remote) : null), [local, remote]);
  return [value, setIncident];
}
