import type { IndoorRoute, Maneuver, RouteInstruction, VerticalLinkKind } from './types';
import { floorById, floorLabel, getVenue, nodeById } from './venue';

export type Point = { x: number; y: number };
export type StepKind = 'straight' | 'left' | 'right' | 'arrive' | 'transfer';
export type TransferVia = 'stairs' | 'lift' | 'escalator';

export type TripStep = {
  kind: StepKind;
  /** Length of the segment this step walks, in metres (0 for arrive / transfer). */
  meters: number;
  /** Instruction text from the routing engine (Vietnamese). */
  text: string;
  maneuver: Maneuver;
  /** Transfer only. */
  via?: TransferVia;
  toFloorId?: string;
  toFloor?: string;
  down?: boolean;
  waitSeconds?: number;
};

/** One floor's worth of a route. Segment i runs corners[i] → corners[i + 1]; the last step has no segment. */
export type TripLeg = {
  floorId: string;
  corners: Point[];
  steps: TripStep[];
};

export type Trip = {
  legs: TripLeg[];
  totalMeters: number;
  seconds: number;
  destName: string;
  /** True when the route is an evacuation route. */
  evacuation: boolean;
  /** Destination cancelled because of a hazard. */
  destinationCancelled: boolean;
  warningCode?: string;
};

const VIA: Record<VerticalLinkKind, TransferVia> = { STAIR: 'stairs', ELEVATOR: 'lift', ESCALATOR: 'escalator' };
const TRANSFER_MANEUVER: Partial<Record<Maneuver, VerticalLinkKind>> = {
  STAIR: 'STAIR',
  ELEVATOR: 'ELEVATOR',
  ESCALATOR: 'ESCALATOR',
};

const kindOf = (m: Maneuver): StepKind => {
  switch (m) {
    case 'TURN_LEFT':
    case 'SLIGHT_LEFT':
    case 'U_TURN_LEFT':
      return 'left';
    case 'TURN_RIGHT':
    case 'SLIGHT_RIGHT':
    case 'U_TURN_RIGHT':
      return 'right';
    case 'ARRIVE':
    case 'ARRIVE_AT_SAFE_EXIT':
      return 'arrive';
    case 'STAIR':
    case 'ELEVATOR':
    case 'ESCALATOR':
      return 'transfer';
    default:
      return 'straight';
  }
};

/**
 * Turn the engine's route into per-floor legs. Consecutive vertical hops (e.g. floor 1 → 2 → 3 on
 * one escalator ride) are merged into a single 'transfer' step toward the last floor.
 */
export function tripFromRoute(
  route: IndoorRoute,
  destName: string,
  meta: { evacuation?: boolean; destinationCancelled?: boolean; warningCode?: string } = {},
): Trip {
  const instructions: RouteInstruction[] = route.instructions ?? [];
  const pos = new Map<string, Point>();
  route.nodeIds.forEach((id, i) => {
    const s = route.steps[i];
    if (s) pos.set(id, { x: s.x, y: s.y });
  });
  const at = (id: string): Point => pos.get(id) ?? nodeById(id) ?? { x: 0, y: 0 };

  const legs: TripLeg[] = [];
  let leg: TripLeg | null = null;
  let i = 0;
  while (i < instructions.length) {
    const ins = instructions[i];
    const kind = kindOf(ins.maneuver);
    if (!leg || leg.floorId !== ins.floorId) {
      leg = { floorId: ins.floorId, corners: [at(ins.fromNodeId)], steps: [] };
      legs.push(leg);
    }

    if (kind === 'transfer') {
      // Merge a chain of vertical hops into one step toward the final floor.
      let j = i;
      let last = ins;
      let wait = ins.waitSeconds ?? 0;
      while (j + 1 < instructions.length && kindOf(instructions[j + 1].maneuver) === 'transfer') {
        j += 1;
        last = instructions[j];
        wait += last.waitSeconds ?? 0;
      }
      const toFloorId = last.targetFloorId ?? last.floorId;
      const fromLevel = floorById(ins.floorId)?.floorNumber ?? 0;
      const toLevel = floorById(toFloorId)?.floorNumber ?? fromLevel;
      leg.steps.push({
        kind: 'transfer',
        meters: 0,
        text: last.text,
        maneuver: ins.maneuver,
        via: VIA[TRANSFER_MANEUVER[ins.maneuver] ?? 'STAIR'],
        toFloorId,
        toFloor: floorLabel(toFloorId),
        down: toLevel < fromLevel,
        waitSeconds: wait || undefined,
      });
      // The next leg starts where the last hop ended.
      i = j + 1;
      leg = null;
      continue;
    }

    leg.steps.push({
      kind,
      meters: kind === 'arrive' ? 0 : Math.max(1, Math.round(ins.distanceMeters)),
      text: ins.text,
      maneuver: ins.maneuver,
    });
    if (kind !== 'arrive') leg.corners.push(at(ins.toNodeId));
    i += 1;
  }

  // A transfer closes a leg without adding a corner: keep corners.length === steps.length.
  for (const l of legs) {
    if (l.corners.length > l.steps.length) l.corners.length = l.steps.length;
  }

  return {
    legs: legs.filter((l) => l.steps.length > 0),
    totalMeters: route.totalDistance,
    seconds: route.estimatedDurationSeconds,
    destName,
    evacuation: !!meta.evacuation,
    destinationCancelled: !!meta.destinationCancelled,
    warningCode: meta.warningCode,
  };
}

export const tripMinutes = (trip: Trip) => Math.max(1, Math.ceil(trip.seconds / 60));

/** Corner list of a leg is also used by the walk simulation. */
export const legMeters = (leg: TripLeg) => leg.steps.reduce((sum, s) => sum + s.meters, 0);

/** Re-read venue data on demand (kept here so screens import one module for planning). */
export const venueFloors = () => getVenue().floors;

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Headline for the big instruction card, e.g. "Rẽ trái 20m". */
export function stepHeadline(t: Translate, step: TripStep): string {
  switch (step.kind) {
    case 'straight':
      return t('dir.mainStraight', { meters: step.meters });
    case 'left':
      return t('dir.mainLeft', { meters: step.meters });
    case 'right':
      return t('dir.mainRight', { meters: step.meters });
    case 'transfer':
      return t(`dir.${step.via ?? 'stairs'}${step.down ? 'Down' : 'Up'}`, { floor: step.toFloor });
    default:
      return t('dir.arrived');
  }
}
