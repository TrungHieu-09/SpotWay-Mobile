import { useEffect, useMemo, useRef } from 'react';

import { tripFromRoute, type Trip } from '@/data/venue/plan';
import { chooseEvacuationExit, computeRoute, defaultStartNodeId, loadVenue, nodeById, useVenue } from '@/data/venue/venue';
import { useAccessibilityMode } from '@/hooks/use-accessibility-mode';
import { useIncident } from '@/hooks/use-incident';

/** Stable key shared by the directions screen and the step list for a route's active step. */
export const routeKey = (evac: boolean, startNodeId: string | undefined, destId: string, leg: number) =>
  evac ? `evac:${leg}` : `${startNodeId ?? ''}>${destId}:${leg}`;

export type EvacExit = {
  nodeId: string;
  name: string;
  /** Other phones already heading to this exit. */
  others: number;
  /** True when a closer exit exists but this one was chosen to spread people out. */
  spreadOut: boolean;
};

type Planned = { trip: Trip; nodeIds: string[]; exit?: EvacExit };

/**
 * The route the user is following, computed on the phone from the venue data: to a picked
 * destination, or (evac) to the exit that is best for this person and the crowd. Re-computed when the
 * accessibility mode, the blocked paths, an incident or the exit crowding change.
 */
export function useTrip({ to, from, evac }: { to?: string; from?: string; evac: boolean }) {
  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  const [accessible] = useAccessibilityMode();
  const [incident] = useIncident();
  const preferredExit = useRef<string | undefined>(undefined);
  const previous = useRef<Planned | null>(null);

  const startNodeId = useMemo(
    () => (from && nodeById(from) ? from : defaultStartNodeId()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, venue.status],
  );

  const planned: Planned | null = useMemo(() => {
    if (venue.status !== 'ready' || !startNodeId) return null;

    let next: Planned | null = null;
    if (evac) {
      const choice = chooseEvacuationExit(startNodeId, { wheelchair: accessible, prefer: preferredExit.current });
      if (choice) {
        preferredExit.current = choice.exitNodeId;
        const name = nodeById(choice.exitNodeId)?.name ?? 'Lối thoát';
        next = {
          nodeIds: choice.route.nodeIds,
          exit: { nodeId: choice.exitNodeId, name, others: choice.others, spreadOut: !!choice.nearestWouldBe },
          trip: tripFromRoute(choice.route, name, { evacuation: true }),
        };
      }
    }
    if (!next) {
      const destination = evac ? undefined : venue.destinations.find((d) => d.id === to);
      if (!evac && !destination) return null;
      const result = computeRoute(startNodeId, evac ? { findNearestExit: true } : destination!.nodeId, { wheelchair: accessible });
      if (!result.route) return null;
      const lastNode = nodeById(result.route.nodeIds[result.route.nodeIds.length - 1]);
      const name = evac ? (lastNode?.name ?? 'Lối thoát') : destination!.name;
      next = {
        nodeIds: result.route.nodeIds,
        trip: tripFromRoute(result.route, name, {
          evacuation: evac || result.effectiveMode === 'EVACUATION',
          destinationCancelled: result.destinationCancelled,
          warningCode: result.warningCode,
        }),
      };
    }

    // Same path as before (e.g. only the crowd numbers changed): keep the old object so the walker is not restarted.
    const before = previous.current;
    if (before && before.nodeIds.join() === next.nodeIds.join() && before.trip.evacuation === next.trip.evacuation) {
      before.exit = next.exit;
      return before;
    }
    previous.current = next;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.status, venue.fireNodeIds, venue.remoteIncident, venue.blockedEdgeIds, venue.evacLoads, startNodeId, to, evac, accessible, incident]);

  return { venue, trip: planned?.trip ?? null, routeNodeIds: planned?.nodeIds ?? null, evacExit: planned?.exit ?? null, startNodeId, accessible, incident };
}
