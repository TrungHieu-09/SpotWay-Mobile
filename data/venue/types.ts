export type HazardType = 'NONE' | 'FIRE' | 'SMOKE' | 'BLOCKED'

export type PublicFloor = {
  id: string
  buildingId: string
  floorNumber: number
  name: string
  mapImageUrl: string | null
  mapWidth: number | null
  mapHeight: number | null
  mapUnitsPerMeter?: number | null
  /** Calibration as served by the public API: metres per map pixel. */
  metersPerPixel?: number | null
  northOffsetDegrees?: number | null
}

export type NodeHazardType = HazardType

export type VerticalLinkKind = 'ELEVATOR' | 'STAIR' | 'ESCALATOR'

export type VerticalLinkDirection = 'UP' | 'DOWN' | 'BIDIRECTIONAL'

export type VerticalLink = {
  id?: string
  nodeIdFrom: string
  nodeIdTo: string
  kind: VerticalLinkKind
  direction?: VerticalLinkDirection
  accessible?: boolean
  emergencyAllowed?: boolean
  status?: 'ACTIVE' | 'BLOCKED'
}

export type Maneuver =
  | 'START'
  | 'STRAIGHT'
  | 'SLIGHT_LEFT'
  | 'SLIGHT_RIGHT'
  | 'TURN_LEFT'
  | 'TURN_RIGHT'
  | 'U_TURN_LEFT'
  | 'U_TURN_RIGHT'
  | 'ELEVATOR'
  | 'STAIR'
  | 'ESCALATOR'
  | 'ARRIVE'
  | 'ARRIVE_AT_SAFE_EXIT'

export type RouteInstruction = {
  maneuver: Maneuver
  floorId: string
  fromNodeId: string
  toNodeId: string
  distanceMeters: number
  bearing: number | null
  deltaBearing: number | null
  durationSeconds: number
  waitSeconds?: number
  targetFloorId?: string
  text: string
}

export type PublicQrResolution = {
  nodeId: string
  floorId: string
  buildingId: string
  x: number
  y: number
  label: string
}

export type PublicNode = {
  id: string
  floorId: string
  x: number
  y: number
  type: string
  accessible: boolean
  name?: string | null
  hazard?: NodeHazardType
}

export type PublicStore = {
  id: string
  floorId: string
  nodeId: string | null
  name: string
  status: string
}

export type PublicPoi = {
  id: string
  floorId: string
  nodeId: string
  name: string
  category: string
  /** Position in map pixels (served by the API next to the anchor node). */
  x?: number
  y?: number
}

export type PublicFloorMap = {
  floor: PublicFloor
  nodes: PublicNode[]
  edges: Array<{
    id: string
    fromNodeId: string
    toNodeId: string
    floorId: string
    accessible?: boolean
    status?: 'ACTIVE' | 'BLOCKED'
    hazard?: NodeHazardType
  }>
  pois: PublicPoi[]
  stores: PublicStore[]
}

export type PublicSearchResult = {
  type: 'STORE' | 'POI'
  id: string
  name: string
  floorId: string
  nodeId: string
  x: number
  y: number
}

export type RouteStep = {
  nodeId: string
  floorId: string
  x: number
  y: number
  bearing: number | null
  transition?: VerticalLinkKind
  targetFloorId?: string
  instruction: string
  maneuver?: Maneuver
  distanceMeters?: number
  waitSeconds?: number
}

export type RouteWarningPayload = {
  code: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  message: string
}

export type RouteDestinationRef = { type: string; id: string; nodeId: string }

export type IndoorRoute = {
  requestedMode?: 'NORMAL' | 'EVACUATION'
  effectiveMode?: 'NORMAL' | 'EVACUATION'
  routeReason?: string
  destinationCancelled?: boolean
  requestedDestination?: RouteDestinationRef | null
  resolvedDestination?: RouteDestinationRef | null
  warnings?: RouteWarningPayload[]
  totalDistance: number
  estimatedDurationSeconds: number
  nodeIds: string[]
  steps: RouteStep[]
  instructions?: RouteInstruction[]
  walkingDurationSeconds?: number
  transitionDurationSeconds?: number
}
