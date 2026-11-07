import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';

import {
  findIndoorRoute,
  findRouteWithHazardPolicy,
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
  PublicFloorMap,
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
};

let state: VenueState = {
  status: 'idle',
  buildingId: BUILDING_ID,
  buildingName: 'SpotWay',
  floors: [],
  mapsByFloorId: {},
  destinations: [],
  verticalLinks: [],
  fireNodeIds: [],
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
      setState({
        status: 'ready',
        buildingName: overview.building?.name ?? 'SpotWay',
        floors,
        mapsByFloorId: Object.fromEntries(maps.map((m) => [m.floor.id, m])),
        destinations,
        verticalLinks: [...explicit, ...inferVerticalLinks(nodes, floorLevelsOf(floors), explicit)],
      });
    } catch (e) {
      setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

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
};

export type RouteResult = {
  route: IndoorRoute | undefined;
  /** 'NORMAL' or 'EVACUATION' (destination cancelled / fire on route). */
  effectiveMode: 'NORMAL' | 'EVACUATION';
  warningCode?: string;
  destinationCancelled?: boolean;
};

function graphInput(opts: RouteOptions) {
  const { floors, mapsByFloorId, verticalLinks, fireNodeIds } = state;
  const fire = [...fireNodeIds, ...(opts.avoidNodeIds ?? [])];
  return {
    nodes: nodesWithPoiExits(mapsByFloorId),
    edges: Object.values(mapsByFloorId).flatMap((m) => m.edges),
    verticalLinks,
    options: {
      wheelchairMode: !!opts.wheelchair,
      emergencyMode: (fireNodeIds.length ? 'FIRE' : 'NONE') as 'FIRE' | 'NONE',
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
