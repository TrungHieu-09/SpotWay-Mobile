import { useEffect, useMemo } from 'react';

import { tripFromRoute, type Trip } from '@/data/venue/plan';
import { computeRoute, defaultStartNodeId, loadVenue, nodeById, useVenue } from '@/data/venue/venue';
import { useAccessibilityMode } from '@/hooks/use-accessibility-mode';
import { useIncident } from '@/hooks/use-incident';

/** Stable key shared by the directions screen and the step list for a route's active step. */
export const routeKey = (evac: boolean, startNodeId: string | undefined, destId: string, leg: number) =>
  evac ? `evac:${leg}` : `${startNodeId ?? ''}>${destId}:${leg}`;

/**
 * The route the user is following, computed on the phone from the venue data: to a picked
 * destination, or (evac) to the nearest safe exit. Re-computed when the accessibility mode,
 * the blocked paths or an incident change.
 */
export function useTrip({ to, from, evac }: { to?: string; from?: string; evac: boolean }) {
  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  const [accessible] = useAccessibilityMode();
  const [incident] = useIncident();

  const startNodeId = useMemo(
    () => (from && nodeById(from) ? from : defaultStartNodeId()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, venue.status],
  );

  const planned: { trip: Trip; nodeIds: string[] } | null = useMemo(() => {
    if (venue.status !== 'ready' || !startNodeId) return null;
    const destination = evac ? undefined : venue.destinations.find((d) => d.id === to);
    if (!evac && !destination) return null;
    const result = computeRoute(startNodeId, evac ? { findNearestExit: true } : destination!.nodeId, {
      wheelchair: accessible,
    });
    if (!result.route) return null;
    const lastNode = nodeById(result.route.nodeIds[result.route.nodeIds.length - 1]);
    const name = evac ? (lastNode?.name ?? 'Lối thoát') : destination!.name;
    return {
      nodeIds: result.route.nodeIds,
      trip: tripFromRoute(result.route, name, {
        evacuation: evac || result.effectiveMode === 'EVACUATION',
        destinationCancelled: result.destinationCancelled,
        warningCode: result.warningCode,
      }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.status, venue.fireNodeIds, venue.remoteIncident, venue.blockedEdgeIds, startNodeId, to, evac, accessible, incident]);

  return { venue, trip: planned?.trip ?? null, routeNodeIds: planned?.nodeIds ?? null, startNodeId, accessible, incident };
}
