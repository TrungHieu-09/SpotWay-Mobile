import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

import {
  findIndoorRoute,
  findRouteWithHazardPolicy,
  getExitCandidates,
  inferVerticalLinks,
  type RouteTarget,
} from './indoorPathfinding';
import {
  allNodesOf,
  calibrationOf,
  floorLevelsOf,
  floorNamesOf,
  nodesWithPoiExits,
  sortFloors,
} from './navigationHelpers';
import type {
  IndoorRoute,
  PublicFloor,
  BuildingPromotion,
  PublicFloorMap,
  PublicPromotion,
  PublicQrResolution,
  PublicSearchResult,
  VerticalLink,
  VerticalLinkKind,
} from './types';

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Building shown by the app. Override with EXPO_PUBLIC_BUILDING_ID. */
export const BUILDING_ID =
  process.env.EXPO_PUBLIC_BUILDING_ID ?? '48ea6235-ff4a-428b-b75f-a6d7a998d10a';

/**
 * Backend base URL. On a phone "localhost" is the phone itself, so by default the host of the
 * Metro dev server (the computer running `expo start`) is reused with the backend port.
 */
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0] || 'localhost';
  return `http://${host}:3000/api/v1`;
}
export const API_URL = resolveApiUrl();

type Envelope<T> = { success: boolean; data: T; error: { message?: string } | null };

async function request<T>(path: string, init?: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!res.ok || !body?.success) {
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    return body.data;
  } finally {
    clearTimeout(timer);
  }
}

const getFloors = (buildingId: string) => request<PublicFloor[]>(`/public/buildings/${buildingId}/floors`);
const getFloorMap = (floorId: string) => request<PublicFloorMap>(`/public/floors/${floorId}/map`);
const getOverview = (buildingId: string) =>
  request<{ building?: { name?: string }; verticalLinks?: VerticalLink[] }>(
    `/public/buildings/${buildingId}/overview`,
    undefined,
    30_000,
  );

async function searchAll(buildingId: string): Promise<PublicSearchResult[]> {
  const parts = await Promise.all(
    (['STORE', 'POI'] as const).map(async (type) => {
      const qs = `q=&type=${type}&limit=100`;
      return (await request<{ items: PublicSearchResult[] }>(`/public/buildings/${buildingId}/search?${qs}`)).items;
    }),
  );
  return parts.flat().sort((a, b) => a.name.localeCompare(b.name, 'vi'));
}

/** Promotions currently running at a store (empty when none or on any error: they are a bonus, never blocking). */
export const getStorePromotions = (storeId: string) =>
  request<PublicPromotion[]>(`/public/stores/${encodeURIComponent(storeId)}/promotions`, undefined, 10_000).catch(() => [] as PublicPromotion[]);

/** Store record (description, logo, images) of a destination, when it is a store. */
export const storeById = (id: string) =>
  Object.values(state.mapsByFloorId)
    .flatMap((m) => m.stores)
    .find((s) => s.id === id);

export type TrackedEvent = 'SEARCH_PERFORMED' | 'ROUTE_STARTED' | 'ROUTE_COMPLETED' | 'EVACUATION_STARTED' | 'STORE_VIEWED' | 'HELP_REQUESTED' | 'SAFE_REACHED';

/** Anonymous usage event for the owner's analytics. Fire and forget: it never blocks or breaks the app. */
export function trackEvent(
  eventType: TrackedEvent,
  extra: { targetId?: string; floorId?: string; query?: string; resultCount?: number; durationSeconds?: number; helpKind?: 'LOST' | 'WHEELCHAIR' | 'SMOKE' | 'OTHER'; nodeId?: string } = {},
): void {
  request<unknown>('/public/events', { method: 'POST', body: JSON.stringify({ eventType, buildingId: BUILDING_ID, ...extra }) }, 6_000).catch(() => undefined);
}

/** Resolve a scanned QR token to the node the user is standing at. */
export const resolveQrToken = (token: string) =>
  request<PublicQrResolution>(`/qr/${encodeURIComponent(token)}`, undefined, 10_000);

/** Token inside a scanned QR: either a full link (`…?qr=<token>`) or the bare token. */
export function extractQrToken(raw: string): string | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const match = /[?&]qr=([^&#\s]+)/.exec(text);
  if (match) return decodeURIComponent(match[1]);
  return /^[\w.~-]{8,}$/.test(text) ? text : undefined;
}

// ---------------------------------------------------------------------------
// Venue store (tiny external store, no extra dependency)
// ---------------------------------------------------------------------------

export type VenueState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error?: string;
  buildingId: string;
  buildingName: string;
  floors: PublicFloor[];
  mapsByFloorId: Record<string, PublicFloorMap>;
  destinations: PublicSearchResult[];
  verticalLinks: VerticalLink[];
  /** Nodes the engine treats as on fire (emergency). */
  fireNodeIds: string[];
  /** Edges the building staff have blocked (maintenance / incident), kept in sync by polling. */
  blockedEdgeIds: string[];
  /** Set when a poll found a change in what is blocked; screens show it briefly. */
  notice?: { id: number; kind: 'blocked' | 'reopened' | 'offline'; count: number };
  /** True when the data comes from the last saved copy because the backend could not be reached. */
  offline?: boolean;
  /** Promotions running now in the building (best effort: empty when none or unavailable). */
  promotions: BuildingPromotion[];
  /** Closures in force (demo scenarios): their nodes are removed from the walkable graph without declaring an emergency. */
  scenarios: Scenario[];
  /** Message of the building shown to every guest. */
  announcement?: Announcement;
  /** Emergency raised by the building staff (polled from the backend). */
  remoteIncident?: RemoteIncident;
  /** Other phones heading to each exit (exit node id -> count), so evacuees can be spread over the exits. */
  evacLoads: Record<string, number>;
  /** Last node the user is known to stand at (scan or start point); where an evacuation starts from. */
  userNodeId?: string;
};

/** A closure announced by the building (lift out of order, power cut, zone closed): routes must avoid these nodes. */
export type Scenario = {
  kind: 'elevator' | 'power' | 'zone';
  /** Nodes that cannot be used while the scenario lasts. */
  blockedNodeIds: string[];
  /** Name of the closed place (zone only). */
  zoneName?: string;
};

export type Announcement = { id: number; text: string };

export type RemoteIncident = { id: string; type: 'FIRE'; nodeIds: string[]; floorIds: string[]; message: string | null; startedAt: string };

let state: VenueState = {
  status: 'idle',
  buildingId: BUILDING_ID,
  buildingName: 'SpotWay',
  floors: [],
  mapsByFloorId: {},
  destinations: [],
  verticalLinks: [],
  fireNodeIds: [],
  blockedEdgeIds: [],
  promotions: [],
  evacLoads: {},
  scenarios: [],
};
const listeners = new Set<() => void>();
const setState = (patch: Partial<VenueState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const getVenue = () => state;
export const useVenue = () => useSyncExternalStore(subscribe, getVenue, getVenue);

let loading: Promise<void> | null = null;

const CACHE_KEY = `spotway.venue.v1.${BUILDING_ID}`;
type VenueSnapshot = Pick<VenueState, 'buildingName' | 'floors' | 'mapsByFloorId' | 'destinations' | 'verticalLinks' | 'blockedEdgeIds'>;

/** Keeps the last good copy so the map still opens when the venue Wi-Fi or the backend is down. */
async function saveSnapshot(snapshot: VenueSnapshot) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or unavailable: caching is best-effort.
  }
}

async function readSnapshot(): Promise<VenueSnapshot | undefined> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as VenueSnapshot) : undefined;
    return parsed?.floors?.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Load floors, floor maps, vertical links and destinations (once; pass force to reload). */
export function loadVenue(force = false): Promise<void> {
  if (!force && state.status === 'ready') return Promise.resolve();
  if (loading) return loading;
  setState({ status: 'loading', error: undefined });
  loading = (async () => {
    try {
      // The API serves calibration as metres per pixel; the engine wants map units per metre.
      const floors = sortFloors(await getFloors(BUILDING_ID)).map((f) => ({
        ...f,
        mapUnitsPerMeter: f.mapUnitsPerMeter ?? (f.metersPerPixel ? 1 / f.metersPerPixel : null),
      }));
      const maps = await Promise.all(floors.map((f) => getFloorMap(f.id)));
      const [destinations, overview] = await Promise.all([
        searchAll(BUILDING_ID),
        getOverview(BUILDING_ID).catch(() => ({}) as Awaited<ReturnType<typeof getOverview>>),
      ]);
      const explicit = overview.verticalLinks ?? [];
      const nodes = maps.flatMap((m) => m.nodes);
      const fresh: VenueSnapshot = {
        buildingName: overview.building?.name ?? 'SpotWay',
        floors,
        mapsByFloorId: Object.fromEntries(maps.map((m) => [m.floor.id, m])),
        blockedEdgeIds: blockedIdsOf(maps),
        destinations,
        verticalLinks: [...explicit, ...inferVerticalLinks(nodes, floorLevelsOf(floors), explicit)],
      };
      setState({ status: 'ready', offline: false, ...fresh });
      void saveSnapshot(fresh);
      void refreshPromotions();
    } catch (e) {
      const cached = await readSnapshot();
      if (cached) {
        setState({ status: 'ready', offline: true, ...cached, notice: { id: ++noticeSeq, kind: 'offline', count: 0 } });
      } else {
        setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      loading = null;
    }
  })();
  return loading;
}

const blockedIdsOf = (maps: PublicFloorMap[]) =>
  maps.flatMap((m) => m.edges.filter((e) => e.status === 'BLOCKED').map((e) => e.id)).sort();

let noticeSeq = 0;
let refreshing = false;

/**
 * Re-reads the floor maps (cheap) so edges blocked on the web by the building staff reach the phone within seconds.
 * Only replaces the maps when the set of blocked edges changed; routes are then recomputed by the screens.
 */
export async function refreshMaps(): Promise<void> {
  if (refreshing || state.status !== 'ready') return;
  refreshing = true;
  try {
    const maps = await Promise.all(state.floors.map((f) => getFloorMap(f.id)));
    // Back online after running from the saved copy: reload everything once.
    if (state.offline) {
      void loadVenue(true);
      return;
    }
    const next = blockedIdsOf(maps);
    const prev = state.blockedEdgeIds;
    if (next.length === prev.length && next.every((id, i) => id === prev[i])) return;
    const added = next.filter((id) => !prev.includes(id)).length;
    const removed = prev.filter((id) => !next.includes(id)).length;
    setState({
      mapsByFloorId: Object.fromEntries(maps.map((m) => [m.floor.id, m])),
      blockedEdgeIds: next,
      notice: { id: ++noticeSeq, kind: added > 0 ? 'blocked' : 'reopened', count: added > 0 ? added : removed },
    });
  } catch {
    // Offline or backend restarting: keep what we have and try again on the next tick.
  } finally {
    refreshing = false;
  }
}

/** Reloads the running promotions; a failure keeps what is already known. */
export async function refreshPromotions(): Promise<void> {
  try {
    const list = await request<BuildingPromotion[]>(`/public/buildings/${BUILDING_ID}/promotions`, undefined, 10_000);
    if (JSON.stringify(list.map((p) => p.id)) !== JSON.stringify(state.promotions.map((p) => p.id))) setState({ promotions: list });
  } catch {
    // Promotions are a bonus; never block the map on them.
  }
}

/** Promotions of stores close to a route (same floor, within `maxMeters` of any node of it), nearest first. */
export function promotionsAlong(routeNodeIds: string[], excludeStoreId?: string, maxMeters = 15): (BuildingPromotion & { meters: number })[] {
  const nodes = routeNodeIds.map(nodeById).filter((n): n is NonNullable<ReturnType<typeof nodeById>> => !!n);
  const out: (BuildingPromotion & { meters: number })[] = [];
  const seen = new Set<string>();
  for (const promo of state.promotions) {
    if (promo.storeId === excludeStoreId || seen.has(promo.storeId)) continue;
    const target = nodeById(promo.nodeId);
    if (!target) continue;
    const mpp = metersPerPixelOf(target.floorId);
    let best = Infinity;
    for (const n of nodes) {
      if (n.floorId !== target.floorId) continue;
      best = Math.min(best, Math.hypot(n.x - target.x, n.y - target.y) * mpp);
    }
    if (best <= maxMeters) {
      seen.add(promo.storeId);
      out.push({ ...promo, meters: Math.round(best) });
    }
  }
  return out.sort((a, b) => a.meters - b.meters);
}

/** Polls the emergency state. A failed poll keeps the last known state: never clear an alarm because the network blinked. */
export async function refreshIncident(): Promise<void> {
  try {
    const res = await request<{ active: boolean } & Partial<RemoteIncident>>(`/public/buildings/${BUILDING_ID}/incident`, undefined, 8_000);
    const current = state.remoteIncident;
    if (!res.active) {
      if (current) setState({ remoteIncident: undefined, evacLoads: {} });
      return;
    }
    void refreshEvacLoads();
    if (current?.id === res.id) return;
    setState({
      remoteIncident: { id: res.id!, type: 'FIRE', nodeIds: res.nodeIds ?? [], floorIds: res.floorIds ?? [], message: res.message ?? null, startedAt: res.startedAt ?? '' },
    });
  } catch {
    // Offline or backend restarting.
  }
}

/** Random id of this app run: lets the backend count evacuees without knowing who they are. */
const DEVICE_ID = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(Math.random() * 16);
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

async function refreshEvacLoads(): Promise<void> {
  try {
    const res = await request<{ loads: Record<string, number> }>(`/public/buildings/${BUILDING_ID}/incident/evacuation?deviceId=${DEVICE_ID}`, undefined, 8_000);
    if (JSON.stringify(res.loads) !== JSON.stringify(state.evacLoads)) setState({ evacLoads: res.loads });
  } catch {
    // keep the last known loads
  }
}

/** Tell the backend which exit this phone is walking to (fire and forget); the answer is the other phones' loads. */
export function claimExit(exitNodeId: string): void {
  request<{ loads?: Record<string, number> }>(`/public/buildings/${BUILDING_ID}/incident/evacuation/claim`, { method: 'POST', body: JSON.stringify({ deviceId: DEVICE_ID, exitNodeId }) }, 6_000)
    .then((res) => {
      if (res.loads && JSON.stringify(res.loads) !== JSON.stringify(state.evacLoads)) setState({ evacLoads: res.loads });
    })
    .catch(() => undefined);
}

/** Extra metres one other person heading to an exit is worth: enough to prefer a slightly longer, emptier exit. */
export const CROWD_PENALTY_METERS = 25;
/** An exit is only swapped for another one when the other is at least this much cheaper (avoids flip-flopping). */
const SWITCH_MARGIN_METERS = 15;

export type ExitChoice = { exitNodeId: string; route: IndoorRoute; others: number; meters: number; nearestWouldBe?: string };

/**
 * Picks the evacuation exit that is best for this person and for the crowd: walking distance plus a penalty per other
 * person already heading to that exit. `prefer` (the exit chosen last time) is kept unless another is clearly better.
 */
export function chooseEvacuationExit(startNodeId: string, opts: RouteOptions & { prefer?: string } = {}): ExitChoice | undefined {
  const { floors, mapsByFloorId, evacLoads } = state;
  const candidates = getExitCandidates(nodesWithPoiExits(mapsByFloorId), floorLevelsOf(floors));
  const scored: (ExitChoice & { cost: number })[] = [];
  for (const exit of candidates) {
    const route = plainRoute(startNodeId, exit.id, { ...opts, forceEmergency: true });
    if (!route) continue;
    const others = evacLoads[exit.id] ?? 0;
    scored.push({ exitNodeId: exit.id, route, others, meters: route.totalDistance, cost: route.totalDistance + CROWD_PENALTY_METERS * others });
  }
  if (scored.length === 0) return undefined;
  scored.sort((a, b) => a.cost - b.cost);
  const nearest = [...scored].sort((a, b) => a.meters - b.meters)[0];
  const best = scored[0];
  const kept = opts.prefer ? scored.find((s) => s.exitNodeId === opts.prefer) : undefined;
  const chosen = kept && kept.cost <= best.cost + SWITCH_MARGIN_METERS ? kept : best;
  return { exitNodeId: chosen.exitNodeId, route: chosen.route, others: chosen.others, meters: chosen.meters, nearestWouldBe: nearest.exitNodeId !== chosen.exitNodeId ? nearest.exitNodeId : undefined };
}

export const setUserNode = (id: string | undefined) => {
  if (id && id !== state.userNodeId) setState({ userNodeId: id });
};

let announcementSeq = 0;

/** Closures in force: a kind appears at most once. Routes are recomputed by the screens when this changes. */
export const setScenarios = (list: Scenario[]) => setState({ scenarios: list });
export const addScenario = (scenario: Scenario) => setScenarios([...state.scenarios.filter((s) => s.kind !== scenario.kind), scenario]);
export const removeScenario = (kind: Scenario['kind']) => setScenarios(state.scenarios.filter((s) => s.kind !== kind));
export const announce = (text: string | undefined) => setState({ announcement: text?.trim() ? { id: ++announcementSeq, text: text.trim() } : undefined });

export const setFireNodes = (ids: string[]) => setState({ fireNodeIds: ids });

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Metres per map pixel of a floor (falls back to the engine default of 10 px/m). */
export const metersPerPixelOf = (floorId: string) => {
  const f = state.floors.find((x) => x.id === floorId);
  return f?.metersPerPixel ?? (f?.mapUnitsPerMeter ? 1 / f.mapUnitsPerMeter : 0.1);
};
export const floorById = (id: string) => state.floors.find((f) => f.id === id);
export const floorLabel = (floorId: string) => {
  const f = floorById(floorId);
  return f ? `${f.floorNumber}` : '?';
};
export const nodeById = (id: string) => allNodesOf(state.mapsByFloorId).find((n) => n.id === id);
export const destinationById = (id: string) => state.destinations.find((d) => d.id === id);
export const poisOf = (floorId: string) => state.mapsByFloorId[floorId]?.pois ?? [];

/** Where the user is assumed to be without a scan: the main door of the lowest floor. */
export function defaultStartNodeId(): string | undefined {
  const ground = state.floors[0];
  const nodes = state.mapsByFloorId[ground?.id]?.nodes ?? [];
  return (nodes.find((n) => n.type === 'DOOR') ?? nodes.find((n) => n.type === 'EXIT') ?? nodes[0])?.id;
}

// ---------------------------------------------------------------------------
// Routing (runs on the phone, same engine as the web guest page)
// ---------------------------------------------------------------------------

export type RouteOptions = {
  wheelchair?: boolean;
  allowedTransitions?: ReadonlySet<VerticalLinkKind>;
  /** Extra nodes to avoid on top of the active fire nodes. */
  avoidNodeIds?: string[];
  /** Use evacuation rules (no elevators) even when no fire node is known. */
  forceEmergency?: boolean;
};

export type RouteResult = {
  route: IndoorRoute | undefined;
  /** 'NORMAL' or 'EVACUATION' (destination cancelled / fire on route). */
  effectiveMode: 'NORMAL' | 'EVACUATION';
  warningCode?: string;
  destinationCancelled?: boolean;
};

/**
 * Edges touching a closed node are blocked (the router skips blocked edges). This keeps a closure from being treated as a
 * fire: a closed shop is simply unreachable instead of turning the route into an evacuation.
 */
function closedEdges<E extends { fromNodeId: string; toNodeId: string; status?: 'ACTIVE' | 'BLOCKED' }>(edges: E[]): E[] {
  const closed = new Set(state.scenarios.flatMap((s) => s.blockedNodeIds));
  if (closed.size === 0) return edges;
  return edges.map((e) => (closed.has(e.fromNodeId) || closed.has(e.toNodeId) ? { ...e, status: 'BLOCKED' as const } : e));
}

function graphInput(opts: RouteOptions) {
  const { floors, mapsByFloorId, verticalLinks, fireNodeIds } = state;
  const fire = [...fireNodeIds, ...(state.remoteIncident?.nodeIds ?? []), ...(opts.avoidNodeIds ?? [])];
  return {
    nodes: nodesWithPoiExits(mapsByFloorId),
    edges: closedEdges(Object.values(mapsByFloorId).flatMap((m) => m.edges)),
    verticalLinks,
    options: {
      wheelchairMode: !!opts.wheelchair,
      emergencyMode: (fire.length || opts.forceEmergency ? 'FIRE' : 'NONE') as 'FIRE' | 'NONE',
      blockedNodeIds: new Set(fire),
      blockedEdgeIds: new Set<string>(),
      allowedTransitions: opts.allowedTransitions,
      floorLevels: floorLevelsOf(floors),
      floorNames: floorNamesOf(floors),
      mapUnitsPerMeter: calibrationOf(floors, 'mapUnitsPerMeter'),
      northOffsetDegrees: calibrationOf(floors, 'northOffsetDegrees'),
    },
  };
}

/** Route from a node to a destination node (or the nearest safe exit), with hazard policy. */
export function computeRoute(startNodeId: string, target: RouteTarget, opts: RouteOptions = {}): RouteResult {
  const { nodes, edges, verticalLinks, options } = graphInput(opts);
  const out = findRouteWithHazardPolicy(startNodeId, target, nodes, edges, verticalLinks, options as never);
  return {
    route: out.route ?? undefined,
    effectiveMode: out.effectiveMode === 'EVACUATION' ? 'EVACUATION' : 'NORMAL',
    warningCode: out.warningCode,
    destinationCancelled: out.destinationCancelled,
  };
}

/** Plain shortest route, no hazard policy (used for the nearest-amenity search). */
export function plainRoute(startNodeId: string, targetNodeId: string, opts: RouteOptions = {}) {
  const { nodes, edges, verticalLinks, options } = graphInput(opts);
  return findIndoorRoute(startNodeId, targetNodeId, nodes, edges, verticalLinks, options as never);
}
