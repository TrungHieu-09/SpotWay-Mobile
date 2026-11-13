import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  angleDiff,
  buildFloorGraph,
  locAtNode,
  locPoint,
  moveAlong,
  normalizeDeg,
  routeEdgeSet,
  snapToGraph,
  type FloorGraph,
  type Loc,
  type Pt,
} from '@/data/venue/livepos';
import { metersPerPixelOf, nodeById, useVenue } from '@/data/venue/venue';
import { useCompassHeading, type HeadingSensor } from '@/hooks/use-heading';
import { useStepCounter, type StepSensor } from '@/hooks/use-step-counter';

/** Average adult stride in metres. */
export const STRIDE_METERS = 0.7;
/** The first steps after (re)starting align the compass with the planned route (the person is assumed to follow it). */
const AUTO_CALIBRATE_STEPS = 3;
const VERTICAL_TYPES = new Set(['ELEVATOR', 'STAIR', 'ESCALATOR']);
/** A floor tap reverted within this time is treated as a slip: the person never really changed floor. */
const SLIP_WINDOW_MS = 90_000;

export type LivePosition = {
  /** Floor the person says they are on (picked with the floor buttons: the height axis is manual). */
  floorId: string | undefined;
  loc: Loc | undefined;
  /** Position on the floor plan, in map pixels. */
  point: Pt | undefined;
  /** Facing direction in the map frame (degrees, 0 = up), when known. */
  heading: number | undefined;
  /** Count of position updates: lets effects react to every move. */
  version: number;
  stepSensor: StepSensor;
  compass: HeadingSensor;
  /** Add steps (pedometer or tap fallback). `headingOverride` moves along a given map heading instead of the compass. */
  addSteps: (steps: number, headingOverride?: number) => void;
  /** The person picked another floor: place them at the lift / stairs of that floor (or the route's arrival point). */
  setFloor: (floorId: string) => void;
  /** Put the person at a node (new start after a QR scan or a reroute anchor). */
  placeAt: (nodeId: string) => void;
  /** Align the compass so that "facing the route" matches the compass right now. */
  calibrate: () => void;
};

type Options = {
  enabled: boolean;
  /** Where to place the person first (the route's start). */
  startNodeId: string | undefined;
  /** Nodes of the planned route, to prefer them at junctions and to find the arrival point on another floor. */
  routeNodeIds: string[] | null;
  /** Bearing of the current route segment on the current floor (map frame), used to calibrate the compass. */
  expectedBearing: number | undefined;
};

/**
 * The person's live position: steps from the pedometer, direction from the compass, kept on the walkable graph of the
 * floor they say they are on. See `data/venue/livepos.ts` for the movement rules.
 */
export function useLivePosition({ enabled, startNodeId, routeNodeIds, expectedBearing }: Options): LivePosition {
  const venue = useVenue();
  const [loc, setLoc] = useState<Loc | undefined>();
  const [version, setVersion] = useState(0);
  const [heading, setHeading] = useState<number | undefined>();
  const compassOffset = useRef(0);
  /** Last position on each floor the person left, so tapping the previous floor again (a slip) puts them back where they were. */
  const lastOnFloor = useRef(new Map<string, { loc: Loc; at: number }>());
  const stepsSinceStart = useRef(0);
  const calibrated = useRef(false);
  const latest = useRef({ loc, routeNodeIds, expectedBearing });
  latest.current = { loc, routeNodeIds, expectedBearing };

  const graphs = useMemo(() => {
    const result = new Map<string, FloorGraph>();
    for (const [floorId, map] of Object.entries(venue.mapsByFloorId)) {
      result.set(floorId, buildFloorGraph(floorId, map.nodes, map.edges));
    }
    return result;
  }, [venue.mapsByFloorId]);
  const graphsRef = useRef(graphs);
  graphsRef.current = graphs;

  const compass = useCompassHeading(enabled);

  const commit = useCallback((next: Loc | undefined) => {
    setLoc(next);
    setVersion((v) => v + 1);
  }, []);

  const placeAt = useCallback(
    (nodeId: string) => {
      const node = nodeById(nodeId);
      const graph = node ? graphsRef.current.get(node.floorId) : undefined;
      if (!node || !graph) return;
      stepsSinceStart.current = 0;
      calibrated.current = false;
      commit(locAtNode(graph, nodeId));
    },
    [commit],
  );

  // Place the person at the route start when the mode is switched on.
  useEffect(() => {
    if (!enabled) {
      setLoc(undefined);
      setHeading(undefined);
      return;
    }
    if (!latest.current.loc && startNodeId && graphs.size > 0) placeAt(startNodeId);
  }, [enabled, startNodeId, graphs, placeAt]);

  const addSteps = useCallback(
    (steps: number, headingOverride?: number) => {
      const current = latest.current.loc;
      if (!current || steps <= 0) return;
      const graph = graphsRef.current.get(current.floorId);
      if (!graph) return;
      const expected = latest.current.expectedBearing;
      const compassNow = compass.getHeading();

      let mapHeading: number | undefined = headingOverride;
      if (mapHeading === undefined && compassNow !== null) {
        stepsSinceStart.current += steps;
        // First steps: trust that the person walks along the route and align the compass to it.
        if (!calibrated.current && expected !== undefined && stepsSinceStart.current <= AUTO_CALIBRATE_STEPS) {
          compassOffset.current = angleDiff(expected, compassNow);
        } else {
          calibrated.current = true;
        }
        mapHeading = normalizeDeg(compassNow + compassOffset.current);
      }
      // No compass at all: follow the route direction (still moves along the corridor).
      if (mapHeading === undefined) mapHeading = expected ?? 0;

      const prefer = latest.current.routeNodeIds
        ? routeEdgeSet(latest.current.routeNodeIds, (id) => nodeById(id)?.floorId, current.floorId)
        : undefined;
      const distancePx = (steps * STRIDE_METERS) / metersPerPixelOf(current.floorId);
      setHeading(mapHeading);
      commit(moveAlong(graph, current, distancePx, mapHeading, { prefer }));
    },
    [commit, compass],
  );

  const setFloor = useCallback(
    (floorId: string) => {
      const current = latest.current.loc;
      const graph = graphsRef.current.get(floorId);
      if (!graph || current?.floorId === floorId) return;
      if (current) lastOnFloor.current.set(current.floorId, { loc: current, at: Date.now() });
      const remembered = lastOnFloor.current.get(floorId);
      if (remembered && Date.now() - remembered.at < SLIP_WINDOW_MS) {
        commit(remembered.loc);
        return;
      }
      const previousGraph = current ? graphsRef.current.get(current.floorId) : undefined;
      const from: Pt = current && previousGraph ? locPoint(previousGraph, current) : { x: 0, y: 0 };
      // Arrival point: the route's own node on that floor if the route passes there, else the nearest lift / stairs.
      const onRoute = (latest.current.routeNodeIds ?? []).filter((id) => nodeById(id)?.floorId === floorId);
      let candidates: string[] = onRoute.length ? [onRoute[0]] : [];
      if (candidates.length === 0) {
        candidates = [...graph.nodes.values()].filter((n) => VERTICAL_TYPES.has(nodeById(n.id)?.type ?? '')).map((n) => n.id);
      }
      const next = snapToGraph(graph, from, candidates.length ? candidates : undefined);
      if (next) {
        stepsSinceStart.current = 0;
        calibrated.current = false;
        commit(next);
      }
    },
    [commit],
  );

  const calibrate = useCallback(() => {
    const compassNow = compass.getHeading();
    const expected = latest.current.expectedBearing;
    if (compassNow === null || expected === undefined) return;
    compassOffset.current = angleDiff(expected, compassNow);
    calibrated.current = true;
  }, [compass]);

  const stepSensor = useStepCounter(enabled, (steps) => addSteps(steps));

  const graph = loc ? graphs.get(loc.floorId) : undefined;
  const point = loc && graph ? locPoint(graph, loc) : undefined;

  return { floorId: loc?.floorId, loc, point, heading, version, stepSensor, compass: compass.status, addSteps, setFloor, placeAt, calibrate };
}
