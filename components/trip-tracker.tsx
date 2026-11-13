import { useEffect, useRef } from 'react';

import { trackEvent } from '@/data/venue/venue';

type Props = {
  /** Identifies the route being followed; a new value counts as a new trip. */
  tripKey: string;
  evac: boolean;
  destId: string;
  arrived: boolean;
};

/** Reports anonymous trip events (started / completed / evacuation) to the backend; renders nothing. */
export function TripTracker({ tripKey, evac, destId, arrived }: Props) {
  const startedAt = useRef(Date.now());
  const completedFor = useRef<string | undefined>(undefined);
  const safeFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    startedAt.current = Date.now();
    completedFor.current = undefined;
    if (evac) trackEvent('EVACUATION_STARTED');
    else if (destId && !destId.startsWith('node:')) trackEvent('ROUTE_STARTED', { targetId: destId });
  }, [tripKey, evac, destId]);

  // Reaching the exit of an evacuation route: the building counts this person as safe.
  useEffect(() => {
    if (!arrived || !evac || safeFor.current === tripKey) return;
    safeFor.current = tripKey;
    trackEvent('SAFE_REACHED');
  }, [arrived, evac, tripKey]);

  useEffect(() => {
    if (!arrived || evac || !destId || destId.startsWith('node:') || completedFor.current === tripKey) return;
    completedFor.current = tripKey;
    trackEvent('ROUTE_COMPLETED', { targetId: destId, durationSeconds: Math.round((Date.now() - startedAt.current) / 1000) });
  }, [arrived, evac, destId, tripKey]);

  return null;
}
