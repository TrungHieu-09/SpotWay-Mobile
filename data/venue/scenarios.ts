import { addScenario, getVenue, metersPerPixelOf, nodeById, removeScenario, setScenarios, type Scenario } from './venue';

/** Radius of a closed zone around the chosen place, in metres. */
export const ZONE_RADIUS_METERS = 12;

const nodesOfTypes = (types: string[]) =>
  Object.values(getVenue().mapsByFloorId)
    .flatMap((map) => map.nodes)
    .filter((node) => types.includes(node.type))
    .map((node) => node.id);

/** Every lift is out of service (all floors): the router can no longer enter lift nodes. */
export function elevatorOutage(): Scenario {
  return { kind: 'elevator', blockedNodeIds: nodesOfTypes(['ELEVATOR']) };
}

/** Power cut: lifts and escalators stop, so only the stairs connect the floors. */
export function powerOutage(): Scenario {
  return { kind: 'power', blockedNodeIds: nodesOfTypes(['ELEVATOR', 'ESCALATOR']) };
}

/** A part of one floor is closed: every node within `ZONE_RADIUS_METERS` of the chosen node. */
export function zoneClosure(centerNodeId: string, zoneName: string): Scenario | undefined {
  const center = nodeById(centerNodeId);
  const map = center ? getVenue().mapsByFloorId[center.floorId] : undefined;
  if (!center || !map) return undefined;
  const radiusPx = ZONE_RADIUS_METERS / metersPerPixelOf(center.floorId);
  const blockedNodeIds = map.nodes.filter((n) => Math.hypot(n.x - center.x, n.y - center.y) <= radiusPx).map((n) => n.id);
  return { kind: 'zone', blockedNodeIds, zoneName };
}

export const isActive = (kind: Scenario['kind']) => getVenue().scenarios.some((s) => s.kind === kind);

export function toggleScenario(kind: Scenario['kind'], build: () => Scenario | undefined) {
  if (isActive(kind)) {
    removeScenario(kind);
    return;
  }
  const scenario = build();
  if (scenario && scenario.blockedNodeIds.length > 0) addScenario(scenario);
}

export const endAllScenarios = () => setScenarios([]);
