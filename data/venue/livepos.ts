/**
 * Live position on one floor, kept on the walkable graph of that floor ("graph-constrained dead reckoning").
 *
 * The phone only knows how many steps were taken and roughly which way the person faces, so the position is never a free
 * x/y: it is a point on an edge of the floor graph. Every step moves it forward along the edge that best matches the
 * heading, and at a junction the edge that points the way the person is facing (with a preference for the planned route)
 * is taken. This keeps the marker in the corridors and stops compass noise from pushing it through walls.
 *
 * Pure functions only (no React / Expo imports) so the maths can be tested on its own.
 */

export type Pt = { x: number; y: number };
export type GNode = Pt & { id: string };
export type GEdge = { fromNodeId: string; toNodeId: string };

/** Position on an edge: travelling from node `a` towards node `b`, `t` in 0..1 along it. */
export type Loc = { floorId: string; a: string; b: string; t: number };

export type FloorGraph = {
  floorId: string;
  nodes: Map<string, GNode>;
  /** node id -> neighbour node ids (walking is possible both ways; blocked-for-routing edges are still walkable). */
  adjacency: Map<string, string[]>;
};

export const edgeKey = (a: string, b: string) => `${a}>${b}`;

export function buildFloorGraph(floorId: string, nodes: GNode[], edges: GEdge[]): FloorGraph {
  const map = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    if (!map.has(from) || !map.has(to) || from === to) return;
    const list = adjacency.get(from) ?? [];
    if (!list.includes(to)) list.push(to);
    adjacency.set(from, list);
  };
  for (const edge of edges) {
    link(edge.fromNodeId, edge.toNodeId);
    link(edge.toNodeId, edge.fromNodeId);
  }
  return { floorId, nodes: map, adjacency };
}

const dist = (p: Pt, q: Pt) => Math.hypot(q.x - p.x, q.y - p.y);

/** Unit vector of a heading in degrees (0 = up on the map, clockwise). */
export const headingVector = (deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
};

/** Bearing in degrees (0 = up, clockwise) from p to q. */
export const bearing = (p: Pt, q: Pt) => ((Math.atan2(q.x - p.x, -(q.y - p.y)) * 180) / Math.PI + 360) % 360;

export const normalizeDeg = (deg: number) => ((deg % 360) + 360) % 360;
/** Smallest signed difference a - b in degrees, -180..180. */
export const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

export function locPoint(graph: FloorGraph, loc: Loc): Pt {
  const a = graph.nodes.get(loc.a);
  const b = graph.nodes.get(loc.b);
  if (!a || !b) return a ?? b ?? { x: 0, y: 0 };
  return { x: a.x + (b.x - a.x) * loc.t, y: a.y + (b.y - a.y) * loc.t };
}

/** Standing exactly on a node: pick any edge that leaves it (or a zero-length loc when the node is isolated). */
export function locAtNode(graph: FloorGraph, nodeId: string): Loc | undefined {
  if (!graph.nodes.has(nodeId)) return undefined;
  const next = graph.adjacency.get(nodeId)?.[0] ?? nodeId;
  return { floorId: graph.floorId, a: nodeId, b: next, t: 0 };
}

/** Node the position is closest to (an endpoint of its edge). */
export function nearestEndpoint(graph: FloorGraph, loc: Loc): string {
  return loc.t < 0.5 ? loc.a : loc.b;
}

/** Closest point of the graph to an arbitrary map point (used when the person says which floor they are on). */
export function snapToGraph(graph: FloorGraph, point: Pt, candidateNodeIds?: Iterable<string>): Loc | undefined {
  let best: { loc: Loc; d: number } | undefined;
  const considerNode = (node: GNode) => {
    const d = dist(point, node);
    if (!best || d < best.d) best = { loc: locAtNode(graph, node.id)!, d };
  };
  if (candidateNodeIds) {
    for (const id of candidateNodeIds) {
      const node = graph.nodes.get(id);
      if (node) considerNode(node);
    }
    if (best) return best.loc;
  }
  for (const [from, neighbours] of graph.adjacency) {
    const p = graph.nodes.get(from)!;
    considerNode(p);
    for (const to of neighbours) {
      const q = graph.nodes.get(to)!;
      const len = dist(p, q);
      if (len === 0) continue;
      const t = Math.max(0, Math.min(1, ((point.x - p.x) * (q.x - p.x) + (point.y - p.y) * (q.y - p.y)) / (len * len)));
      const d = dist(point, { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      if (!best || d < best.d) best = { loc: { floorId: graph.floorId, a: from, b: to, t }, d };
    }
  }
  return best?.loc;
}

export type MoveOptions = {
  /** Directed edges (`edgeKey(from, to)`) of the planned route: preferred at junctions when they roughly match the heading. */
  prefer?: ReadonlySet<string>;
};

/** An edge must point at least this far in the heading's direction (cosine) to be taken at a junction. */
const MIN_TURN_ALIGNMENT = -0.2;
/** Heading nearly perpendicular to the corridor: keep the current travel direction instead of flipping on noise. */
const AMBIGUOUS = 0.25;
const ROUTE_BONUS = 0.35;
const TURN_BACK_ALIGNMENT = 0.5;

/**
 * Moves the position `distance` (map pixels) while facing `headingDeg` (map frame).
 * Walks along the current edge in the direction the heading points; at a node takes the neighbour edge that best matches
 * the heading (the planned route gets a bonus); stops at a dead end.
 */
export function moveAlong(graph: FloorGraph, loc: Loc, distance: number, headingDeg: number, options: MoveOptions = {}): Loc {
  const hv = headingVector(headingDeg);
  let { a, b, t } = loc;
  let left = distance;
  let guard = 0;

  const orient = () => {
    const pa = graph.nodes.get(a)!;
    const pb = graph.nodes.get(b)!;
    const len = dist(pa, pb);
    if (len === 0) return len;
    const align = ((pb.x - pa.x) * hv.x + (pb.y - pa.y) * hv.y) / len;
    // Face the way the heading points along this edge (flip the travel direction when it points backwards).
    if (align < -AMBIGUOUS) {
      [a, b] = [b, a];
      t = 1 - t;
    }
    return len;
  };

  while (left > 1e-6 && guard++ < 64) {
    if (!graph.nodes.has(a) || !graph.nodes.has(b)) break;
    const len = orient();
    if (len === 0) {
      // Isolated or zero-length edge: nothing to walk on.
      break;
    }
    const room = (1 - t) * len;
    if (left <= room) {
      t += left / len;
      left = 0;
      break;
    }
    left -= room;
    // Reached node b: choose where to go next.
    const here = graph.nodes.get(b)!;
    let bestNext: string | undefined;
    let bestScore = -Infinity;
    for (const next of graph.adjacency.get(b) ?? []) {
      const q = graph.nodes.get(next)!;
      const l = dist(here, q);
      if (l === 0) continue;
      const align = ((q.x - here.x) * hv.x + (q.y - here.y) * hv.y) / l;
      // Turning back the way we came needs a clear heading that way, not just a sideways one (otherwise a dead end sends us back).
      if (next === a && align < TURN_BACK_ALIGNMENT) continue;
      const score = align + (options.prefer?.has(edgeKey(b, next)) ? ROUTE_BONUS : 0);
      if (score > bestScore) {
        bestScore = score;
        bestNext = next;
      }
    }
    if (bestNext === undefined || bestScore < MIN_TURN_ALIGNMENT) {
      // Dead end, or the person faces a wall: stay at the node.
      t = 1;
      left = 0;
      break;
    }
    a = b;
    b = bestNext;
    t = 0;
  }
  return { floorId: loc.floorId, a, b, t: Math.max(0, Math.min(1, t)) };
}

export type Projection = {
  /** Distance from the start of the polyline to the projected point (map pixels). */
  along: number;
  /** Distance between the point and the polyline (map pixels). */
  offset: number;
  segment: number;
  point: Pt;
};

/** Nearest point of a polyline to `point`. */
export function projectOnPolyline(corners: Pt[], point: Pt): Projection | undefined {
  if (corners.length === 0) return undefined;
  if (corners.length === 1) return { along: 0, offset: dist(point, corners[0]), segment: 0, point: corners[0] };
  let best: Projection | undefined;
  let start = 0;
  for (let i = 0; i < corners.length - 1; i++) {
    const p = corners[i];
    const q = corners[i + 1];
    const len = dist(p, q);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - p.x) * (q.x - p.x) + (point.y - p.y) * (q.y - p.y)) / (len * len)));
    const on = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    const offset = dist(point, on);
    if (!best || offset < best.offset) best = { along: start + t * len, offset, segment: i, point: on };
    start += len;
  }
  return best;
}

/** Directed edges of a route's node list on one floor, for `MoveOptions.prefer`. */
export function routeEdgeSet(nodeIds: string[], floorOf: (id: string) => string | undefined, floorId: string): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i < nodeIds.length - 1; i++) {
    if (floorOf(nodeIds[i]) === floorId && floorOf(nodeIds[i + 1]) === floorId) set.add(edgeKey(nodeIds[i], nodeIds[i + 1]));
  }
  return set;
}

export type RouteTracker = { bestAlong: number; offCount: number };

export type TrackThresholds = { offRouteM: number; reverseM: number; arriveM: number; offSamples: number };

export type TrackResult =
  | { action: 'follow'; along: number }
  | { action: 'reroute'; reason: 'off' | 'reverse' }
  | { action: 'wait' };

/**
 * Compares the live position with the planned route of the current floor and says what to do:
 * follow it (the marker's progress along the route), plan again because the person went off it for a couple of samples,
 * or because they walked back along it, or wait while a single noisy sample is judged. `state` is updated in place.
 */
export function trackOnRoute(corners: Pt[], point: Pt, metersPerPixel: number, state: RouteTracker, limits: TrackThresholds): TrackResult {
  const projection = projectOnPolyline(corners, point);
  if (!projection) return { action: 'wait' };
  const total = corners.reduce((sum, c, i) => (i === 0 ? 0 : sum + dist(corners[i - 1], c)), 0);
  if (projection.offset * metersPerPixel > limits.offRouteM) {
    state.offCount += 1;
    return state.offCount >= limits.offSamples ? { action: 'reroute', reason: 'off' } : { action: 'wait' };
  }
  state.offCount = 0;
  if (state.bestAlong - projection.along > limits.reverseM / metersPerPixel) return { action: 'reroute', reason: 'reverse' };
  state.bestAlong = Math.max(state.bestAlong, projection.along);
  const arrived = projection.along >= total - limits.arriveM / metersPerPixel;
  return { action: 'follow', along: arrived ? total : projection.along };
}
