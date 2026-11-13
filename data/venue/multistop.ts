import { destinationById, plainRoute } from './venue';

export type MultiStopPlan = {
  /** Destination ids in the order that makes the shortest walk. */
  order: string[];
  /** Metres from the previous stop (or the start) to each stop, in `order`. */
  legMeters: number[];
  totalMeters: number;
  /** Walk when the stops are visited in the order they were picked. */
  naiveMeters: number;
  /** Stops with no walkable route from the start (left out of the plan). */
  unreachable: string[];
};

/** Up to this many stops every order is tried (7! = 5040 orders on a tiny distance matrix); beyond it nearest-neighbour is used. */
const EXACT_LIMIT = 7;

function* permutations<T>(items: T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield items;
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i], ...tail];
  }
}

/**
 * Shortest visiting order for several stops, starting at `startNodeId` (a travelling-salesman path over real walking
 * distances, including changes of floor). Distances come from the same routing engine the directions use.
 */
export function planMultiStop(startNodeId: string, stopIds: string[], opts: { wheelchair?: boolean } = {}): MultiStopPlan | null {
  const stops = stopIds.map((id) => ({ id, nodeId: destinationById(id)?.nodeId })).filter((s): s is { id: string; nodeId: string } => !!s.nodeId);
  if (stops.length === 0) return null;

  const cache = new Map<string, number>();
  const meters = (from: string, to: string) => {
    if (from === to) return 0;
    const key = `${from}>${to}`;
    let value = cache.get(key);
    if (value === undefined) {
      value = plainRoute(from, to, { wheelchair: opts.wheelchair })?.totalDistance ?? Infinity;
      cache.set(key, value);
    }
    return value;
  };

  const reachable = stops.filter((s) => Number.isFinite(meters(startNodeId, s.nodeId)));
  const unreachable = stops.filter((s) => !reachable.includes(s)).map((s) => s.id);
  if (reachable.length === 0) return null;

  const walk = (order: typeof reachable) => {
    let total = 0;
    let at = startNodeId;
    for (const stop of order) {
      total += meters(at, stop.nodeId);
      at = stop.nodeId;
    }
    return total;
  };

  let best = reachable;
  if (reachable.length <= EXACT_LIMIT) {
    let bestMeters = Infinity;
    for (const candidate of permutations(reachable)) {
      const total = walk(candidate);
      if (total < bestMeters) {
        bestMeters = total;
        best = candidate;
      }
    }
  } else {
    const left = [...reachable];
    best = [];
    let at = startNodeId;
    while (left.length) {
      left.sort((a, b) => meters(at, a.nodeId) - meters(at, b.nodeId));
      const next = left.shift()!;
      best.push(next);
      at = next.nodeId;
    }
  }

  const legMeters: number[] = [];
  let at = startNodeId;
  for (const stop of best) {
    legMeters.push(Math.round(meters(at, stop.nodeId)));
    at = stop.nodeId;
  }
  return {
    order: best.map((s) => s.id),
    legMeters,
    totalMeters: Math.round(walk(best)),
    naiveMeters: Math.round(walk(reachable)),
    unreachable,
  };
}
