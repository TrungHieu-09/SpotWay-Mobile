import { addScenario, announce, currentBuildingId, fetchOperations, getVenue, metersPerPixelOf, nodeById, removeScenario, setScenarios, venueRevision, type Scenario } from './venue';

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

// ---------------------------------------------------------------------------
// Declared by the building's manager (web) and polled by every phone of that building
// ---------------------------------------------------------------------------

let lastSignature = '';
let lastBuilding = '';
let lastNoticeKey = '';

/**
 * Applies what the manager of THIS building declared. Only acts when it changed, so a closure switched on by hand in the
 * rehearsal panel is not wiped every few seconds. Nothing declared = nothing applied: no closure is ever hard-coded.
 */
export async function refreshOperations(): Promise<void> {
  const building = currentBuildingId();
  const ops = await fetchOperations();
  if (!ops || building !== currentBuildingId() || getVenue().status !== 'ready') return;
  if (building !== lastBuilding) {
    lastBuilding = building;
    lastSignature = '';
    lastNoticeKey = '';
  }
  // Closures are derived from node types / positions: when the map was reloaded under them, compute them again.
  const declared = ops.elevator || ops.power || !!ops.zone;
  const signature = JSON.stringify([ops.elevator, ops.power, ops.zone?.nodeId ?? null, declared ? venueRevision() : 0]);
  if (signature !== lastSignature) {
    const first = lastSignature === '';
    lastSignature = signature;
    // On the first poll an all-clear must not erase closures the user set up by hand.
    if (!(first && !ops.elevator && !ops.power && !ops.zone)) {
      const list: Scenario[] = [];
      if (ops.elevator) list.push(elevatorOutage());
      if (ops.power) list.push(powerOutage());
      if (ops.zone) {
        const zone = zoneClosure(ops.zone.nodeId, ops.zone.name);
        if (zone) list.push(zone);
      }
      setScenarios(list.filter((s) => s.blockedNodeIds.length > 0));
    }
  }
  const notice = ops.announcement;
  const key = notice ? `${notice.id}:${notice.at}` : '';
  if (notice && key !== lastNoticeKey) {
    lastNoticeKey = key;
    announce(notice.text);
  } else if (!notice && lastNoticeKey !== '') {
    lastNoticeKey = '';
    announce(undefined);
  }
}
