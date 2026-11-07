import type {
  IndoorRoute,
  Maneuver,
  NodeHazardType,
  RouteInstruction,
  RouteStep,
  VerticalLink,
  VerticalLinkDirection,
  VerticalLinkKind,
} from './types'

export type PathfindingNode = {
  id: string
  floorId: string
  x: number
  y: number
  type: string
  accessible?: boolean
  name?: string | null
  hazard?: NodeHazardType
}

export type PathfindingEdge = {
  id: string
  floorId: string
  fromNodeId: string
  toNodeId: string
  accessible?: boolean
  status?: 'ACTIVE' | 'BLOCKED'
  hazard?: NodeHazardType
}

export type VerticalTiming = { waitSeconds: number; travelSecondsPerFloor: number }

export type PathfindingOptions = {
  wheelchairMode?: boolean
  emergencyMode?: 'NONE' | 'FIRE'
  blockedNodeIds?: ReadonlySet<string>
  blockedEdgeIds?: ReadonlySet<string>
  /** floorId -> floorNumber: số tầng của vertical link, chiều thang cuốn, tầng trệt */
  floorLevels?: Record<string, number>
  /** floorId -> tên hiển thị trong chỉ dẫn */
  floorNames?: Record<string, string>
  /** floorId -> số đơn vị bản đồ trên 1 mét (calibration theo tầng) */
  mapUnitsPerMeter?: Record<string, number>
  /** floorId -> bearing thật của hướng "lên trên" của bản đồ */
  northOffsetDegrees?: Record<string, number>
  /** Chỉ cho phép một số loại chuyển tầng (demo thang máy/thang bộ/thang cuốn) */
  allowedTransitions?: ReadonlySet<VerticalLinkKind>
  /** Chiều mặc định cho thang cuốn không khai báo direction */
  defaultEscalatorDirection?: VerticalLinkDirection
  /** Bán kính vùng nguy hiểm quanh điểm cháy (mét), dùng cho định tuyến ưu tiên an toàn */
  hazardSafetyRadiusMeters?: number
  timing?: Partial<Record<VerticalLinkKind, VerticalTiming>>
  walkingSpeedMps?: number
}

export type RouteTarget = string | { findNearestExit: boolean } | { nodeIds: string[] }

export const DEFAULT_MAP_UNITS_PER_METER = 10
export const DEFAULT_WALKING_SPEED_MPS = 1.2
export const DEFAULT_HAZARD_SAFETY_RADIUS_METERS = 8
export const DEFAULT_VERTICAL_TIMING: Record<VerticalLinkKind, VerticalTiming> = {
  ELEVATOR: { waitSeconds: 30, travelSecondsPerFloor: 4 },
  STAIR: { waitSeconds: 0, travelSecondsPerFloor: 18 },
  ESCALATOR: { waitSeconds: 0, travelSecondsPerFloor: 12 },
}
/** Ngưỡng phân loại maneuver theo |delta bearing| (độ) */
export const MANEUVER_THRESHOLDS = { straight: 15, slight: 45, turn: 135 }

const EXIT_TYPES = new Set(['EXIT', 'EMERGENCY_EXIT'])
const SMOKE_PENALTY = 3
const RISK_EPSILON = 1e-9

// ── Bearing & maneuver ────────────────────────────────────────────────────────

type Point = { x: number; y: number }

export const normalize360 = (angle: number) => ((angle % 360) + 360) % 360

/** Bearing trên bản đồ canvas (x sang phải, y hướng xuống): 0° = lên trên, tăng theo chiều kim đồng hồ */
export const mapBearing = (from: Point, to: Point) =>
  normalize360((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI)

/** Kết quả thuộc [-180, 180): dương = rẽ phải, âm = rẽ trái */
export const deltaBearing = (incoming: number, outgoing: number) => ((outgoing - incoming + 540) % 360) - 180

export function classifyManeuver(delta: number): Maneuver {
  const magnitude = Math.abs(delta)
  const right = delta >= 0
  if (magnitude < MANEUVER_THRESHOLDS.straight) return 'STRAIGHT'
  if (magnitude < MANEUVER_THRESHOLDS.slight) return right ? 'SLIGHT_RIGHT' : 'SLIGHT_LEFT'
  if (magnitude < MANEUVER_THRESHOLDS.turn) return right ? 'TURN_RIGHT' : 'TURN_LEFT'
  return right ? 'U_TURN_RIGHT' : 'U_TURN_LEFT'
}

const MANEUVER_TEXT: Partial<Record<Maneuver, string>> = {
  STRAIGHT: 'Đi thẳng',
  SLIGHT_LEFT: 'Chếch trái',
  SLIGHT_RIGHT: 'Chếch phải',
  TURN_LEFT: 'Rẽ trái',
  TURN_RIGHT: 'Rẽ phải',
  U_TURN_LEFT: 'Quay đầu (bên trái)',
  U_TURN_RIGHT: 'Quay đầu (bên phải)',
}

const TRANSITION_LABEL: Record<VerticalLinkKind, string> = {
  ELEVATOR: 'thang máy',
  STAIR: 'thang bộ',
  ESCALATOR: 'thang cuốn',
}

const round2 = (value: number) => Math.round(value * 100) / 100
const formatMeters = (meters: number) => `${meters < 10 ? round2(meters).toFixed(1) : Math.round(meters)} m`

// ── Graph helpers ─────────────────────────────────────────────────────────────

export function isExitNode(node: PathfindingNode) {
  return EXIT_TYPES.has(node.type)
}

export function isNodePassable(node: PathfindingNode, options: PathfindingOptions) {
  if (options.blockedNodeIds?.has(node.id)) return false
  if (node.hazard === 'FIRE' || node.hazard === 'BLOCKED') return false
  if (options.wheelchairMode && node.accessible === false) return false
  return true
}

/**
 * Danh sách node có thể làm lối thoát: EXIT/EMERGENCY_EXIT; nếu tòa nhà chưa khai báo,
 * dùng tạm các DOOR ở tầng thấp nhất.
 */
export function getExitCandidates(nodes: PathfindingNode[], floorLevels: Record<string, number> = {}) {
  const exits = nodes.filter(isExitNode)
  if (exits.length > 0) return exits
  const levels = Object.values(floorLevels)
  const groundLevel = levels.length > 0 ? Math.min(...levels) : undefined
  return nodes.filter(
    (node) => node.type === 'DOOR' && (groundLevel === undefined || floorLevels[node.floorId] === groundLevel),
  )
}

/**
 * Nối các node thang khi backend chưa trả vertical link: thang máy nối thẳng tới mọi tầng trong cùng trục
 * (chỉ chờ thang 1 lần), thang bộ/cuốn chỉ nối tầng liền kề.
 */
export function inferVerticalLinks(
  nodes: PathfindingNode[],
  floorLevels: Record<string, number>,
  existing: VerticalLink[] = [],
  maxOffset = 150,
) {
  const linked = new Set(existing.flatMap((link) => [link.nodeIdFrom, link.nodeIdTo]))
  const inferred: VerticalLink[] = []
  const kinds: VerticalLinkKind[] = ['ELEVATOR', 'STAIR', 'ESCALATOR']

  for (const kind of kinds) {
    const candidates = nodes.filter((node) => node.type === kind && floorLevels[node.floorId] !== undefined)
    for (const from of candidates) {
      if (linked.has(from.id)) continue
      const fromLevel = floorLevels[from.floorId]
      const bestByFloor = new Map<string, { node: PathfindingNode; offset: number }>()
      for (const to of candidates) {
        const toLevel = floorLevels[to.floorId]
        if (kind === 'ELEVATOR' ? toLevel <= fromLevel : toLevel !== fromLevel + 1) continue
        const offset = Math.hypot(to.x - from.x, to.y - from.y)
        const best = bestByFloor.get(to.floorId)
        if (offset <= maxOffset && (!best || offset < best.offset)) bestByFloor.set(to.floorId, { node: to, offset })
      }
      for (const { node: to } of bestByFloor.values()) {
        inferred.push({ id: `inferred-${from.id}-${to.id}`, nodeIdFrom: from.id, nodeIdTo: to.id, kind })
      }
    }
  }
  return inferred
}

type Arc = {
  to: string
  kind: 'WALK' | VerticalLinkKind
  /** Chi phí tìm kiếm (giây, đã nhân phạt khói) */
  cost: number
  /** Thời gian thực tế (giây) */
  seconds: number
  meters: number
  waitSeconds: number
}

type Context = {
  nodeById: Map<string, PathfindingNode>
  unitsPerMeter: (floorId: string) => number
  walkingSpeed: number
  timing: Record<VerticalLinkKind, VerticalTiming>
}

function createContext(nodes: PathfindingNode[], options: PathfindingOptions): Context {
  return {
    nodeById: new Map(nodes.map((node) => [node.id, node])),
    unitsPerMeter: (floorId) => {
      const value = options.mapUnitsPerMeter?.[floorId]
      return value !== undefined && Number.isFinite(value) && value > 0 ? value : DEFAULT_MAP_UNITS_PER_METER
    },
    walkingSpeed: options.walkingSpeedMps ?? DEFAULT_WALKING_SPEED_MPS,
    timing: { ...DEFAULT_VERTICAL_TIMING, ...options.timing },
  }
}

function linkAllowed(link: VerticalLink, options: PathfindingOptions) {
  if (link.status === 'BLOCKED') return false
  if (options.allowedTransitions && !options.allowedTransitions.has(link.kind)) return false
  if (options.emergencyMode === 'FIRE') {
    if (link.kind === 'ELEVATOR') return false
    if (!(link.emergencyAllowed ?? link.kind === 'STAIR')) return false
  }
  if (options.wheelchairMode && (link.kind !== 'ELEVATOR' || link.accessible === false)) return false
  return true
}

function buildAdjacency(
  context: Context,
  edges: PathfindingEdge[],
  verticalLinks: VerticalLink[],
  options: PathfindingOptions,
) {
  const { nodeById, unitsPerMeter, walkingSpeed, timing } = context
  const adjacency = new Map<string, Arc[]>()
  const push = (from: string, arc: Arc) => {
    const list = adjacency.get(from)
    if (list) list.push(arc)
    else adjacency.set(from, [arc])
  }

  for (const edge of edges) {
    if (edge.status === 'BLOCKED' || edge.hazard === 'FIRE' || edge.hazard === 'BLOCKED') continue
    if (options.blockedEdgeIds?.has(edge.id)) continue
    if (options.wheelchairMode && edge.accessible === false) continue
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!from || !to || from.floorId !== to.floorId) continue
    const meters = Math.hypot(to.x - from.x, to.y - from.y) / unitsPerMeter(from.floorId)
    const seconds = meters / walkingSpeed
    const smoky = edge.hazard === 'SMOKE' || from.hazard === 'SMOKE' || to.hazard === 'SMOKE'
    const arc = { kind: 'WALK' as const, cost: smoky ? seconds * SMOKE_PENALTY : seconds, seconds, meters, waitSeconds: 0 }
    push(from.id, { ...arc, to: to.id })
    push(to.id, { ...arc, to: from.id })
  }

  const levels = options.floorLevels ?? {}
  for (const link of verticalLinks) {
    if (!linkAllowed(link, options)) continue
    const from = nodeById.get(link.nodeIdFrom)
    const to = nodeById.get(link.nodeIdTo)
    if (!from || !to || from.floorId === to.floorId) continue
    const fromLevel = levels[from.floorId]
    const toLevel = levels[to.floorId]
    const known = fromLevel !== undefined && toLevel !== undefined
    const floorsCrossed = known ? Math.max(1, Math.abs(toLevel - fromLevel)) : 1
    const { waitSeconds, travelSecondsPerFloor } = timing[link.kind]
    const seconds = waitSeconds + travelSecondsPerFloor * floorsCrossed
    const arc = { kind: link.kind, cost: seconds, seconds, meters: 0, waitSeconds }

    const direction =
      link.kind === 'ESCALATOR' ? (link.direction ?? options.defaultEscalatorDirection ?? 'BIDIRECTIONAL') : 'BIDIRECTIONAL'
    // UP: chỉ đi từ tầng thấp lên tầng cao; DOWN: ngược lại
    const fromIsLower = known ? fromLevel < toLevel : true
    const allowForward = direction === 'BIDIRECTIONAL' || !known || (direction === 'UP') === fromIsLower
    const allowBackward = direction === 'BIDIRECTIONAL' || !known || (direction === 'UP') !== fromIsLower
    if (allowForward) push(from.id, { ...arc, to: to.id })
    if (allowBackward) push(to.id, { ...arc, to: from.id })
  }

  return adjacency
}

/** Mức rủi ro khi đi qua 1 node: tổng mức gần các điểm cháy cùng tầng trong bán kính an toàn */
export function nodeRisk(
  node: PathfindingNode,
  hazards: PathfindingNode[],
  radiusMeters: number,
  unitsPerMeter: number,
) {
  if (radiusMeters <= 0) return 0
  let risk = 0
  for (const hazard of hazards) {
    if (hazard.floorId !== node.floorId) continue
    const meters = Math.hypot(hazard.x - node.x, hazard.y - node.y) / unitsPerMeter
    if (meters < radiusMeters) risk += 1 - meters / radiusMeters
  }
  return Math.round(risk * 1e6) / 1e6
}

// ── Min-priority queue với khoá (risk, cost, nodeId) ─────────────────────────

type QueueItem = { id: string; risk: number; cost: number }

function compareItems(a: QueueItem, b: QueueItem) {
  if (Math.abs(a.risk - b.risk) > RISK_EPSILON) return a.risk - b.risk
  if (a.cost !== b.cost) return a.cost - b.cost
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

class MinHeap {
  private items: QueueItem[] = []
  get size() {
    return this.items.length
  }
  push(item: QueueItem) {
    const items = this.items
    items.push(item)
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (compareItems(items[index], items[parent]) >= 0) break
      ;[items[index], items[parent]] = [items[parent], items[index]]
      index = parent
    }
  }
  pop() {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length > 0 && last) {
      items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < items.length && compareItems(items[left], items[smallest]) < 0) smallest = left
        if (right < items.length && compareItems(items[right], items[smallest]) < 0) smallest = right
        if (smallest === index) break
        ;[items[index], items[smallest]] = [items[smallest], items[index]]
        index = smallest
      }
    }
    return top
  }
}

// ── Turn-by-turn ──────────────────────────────────────────────────────────────

function nodeLabel(node: PathfindingNode) {
  if (node.name) return node.name
  if (node.type === 'EMERGENCY_EXIT') return 'cửa thoát hiểm'
  if (node.type === 'EXIT') return 'cửa ra'
  return 'điểm đến'
}

/**
 * Gom các đoạn WALK cùng hướng thành instruction, tách riêng chuyển tầng,
 * và gắn chỉ dẫn tương ứng cho từng node (steps) để vẽ bản đồ.
 */
export function buildTurnByTurn(
  path: PathfindingNode[],
  arcs: Arc[],
  options: Pick<PathfindingOptions, 'floorLevels' | 'floorNames' | 'emergencyMode' | 'northOffsetDegrees'> = {},
): { instructions: RouteInstruction[]; steps: RouteStep[] } {
  const instructions: RouteInstruction[] = []
  const stepMeta: Array<{ maneuver: Maneuver; text: string; distanceMeters?: number; waitSeconds?: number }> = []
  const evacuation = options.emergencyMode === 'FIRE'
  const trueBearing = (bearing: number, floorId: string) =>
    normalize360(bearing + (options.northOffsetDegrees?.[floorId] ?? 0))

  let incoming: number | null = null
  let afterTransition: VerticalLinkKind | undefined
  let current: RouteInstruction | undefined
  let groupStart = 0

  const closeGroup = (endIndex: number) => {
    if (!current) return
    current.distanceMeters = round2(current.distanceMeters)
    current.durationSeconds = round2(current.durationSeconds)
    const verb = current.text
    current.text = `${verb} ${formatMeters(current.distanceMeters)}`
    // Node trung gian trong cùng nhóm: "tiếp tục đi thẳng" với quãng còn lại
    let remaining = current.distanceMeters
    for (let index = groupStart; index < endIndex; index += 1) {
      if (index === groupStart) {
        stepMeta[index] = { maneuver: current.maneuver, text: current.text, distanceMeters: current.distanceMeters }
      } else {
        stepMeta[index] = { maneuver: 'STRAIGHT', text: `Tiếp tục đi thẳng ${formatMeters(remaining)}`, distanceMeters: round2(remaining) }
      }
      remaining = Math.max(0, remaining - arcs[index].meters)
    }
    instructions.push(current)
    current = undefined
  }

  arcs.forEach((arc, index) => {
    const from = path[index]
    const to = path[index + 1]

    if (arc.kind !== 'WALK') {
      closeGroup(index)
      const fromLevel = options.floorLevels?.[from.floorId]
      const toLevel = options.floorLevels?.[to.floorId]
      const direction = fromLevel !== undefined && toLevel !== undefined && toLevel < fromLevel ? 'xuống' : 'lên'
      const target = options.floorNames?.[to.floorId] ?? (toLevel !== undefined ? `Tầng ${toLevel}` : 'tầng tiếp theo')
      const wait = arc.waitSeconds > 0 ? ` (chờ ~${Math.round(arc.waitSeconds)} s, tổng ~${Math.round(arc.seconds)} s)` : ` (~${Math.round(arc.seconds)} s)`
      const text = `Đi ${TRANSITION_LABEL[arc.kind]} ${direction} ${target}${wait}`
      instructions.push({
        maneuver: arc.kind,
        floorId: from.floorId,
        fromNodeId: from.id,
        toNodeId: to.id,
        distanceMeters: 0,
        bearing: null,
        deltaBearing: null,
        durationSeconds: round2(arc.seconds),
        waitSeconds: arc.waitSeconds > 0 ? arc.waitSeconds : undefined,
        targetFloorId: to.floorId,
        text,
      })
      stepMeta[index] = { maneuver: arc.kind, text, waitSeconds: arc.waitSeconds || undefined }
      incoming = null
      afterTransition = arc.kind
      return
    }

    const zeroLength = arc.meters === 0
    const bearing = zeroLength ? incoming : mapBearing(from, to)
    let maneuver: Maneuver
    let delta: number | null = null
    if (index === 0) maneuver = 'START'
    else if (incoming === null || bearing === null) maneuver = 'STRAIGHT'
    else {
      delta = deltaBearing(incoming, bearing)
      maneuver = classifyManeuver(delta)
    }

    if (current && maneuver === 'STRAIGHT' && !afterTransition) {
      current.distanceMeters += arc.meters
      current.durationSeconds += arc.seconds
      current.toNodeId = to.id
    } else {
      closeGroup(index)
      groupStart = index
      let verb: string
      if (maneuver === 'START') verb = evacuation ? 'Bình tĩnh, theo lối thoát hiểm đi thẳng' : 'Xuất phát, đi thẳng'
      else if (afterTransition) verb = `Ra khỏi ${TRANSITION_LABEL[afterTransition]}, đi thẳng`
      else verb = maneuver === 'STRAIGHT' ? 'Đi thẳng' : `${MANEUVER_TEXT[maneuver]} rồi đi`
      current = {
        maneuver,
        floorId: from.floorId,
        fromNodeId: from.id,
        toNodeId: to.id,
        distanceMeters: arc.meters,
        bearing: bearing === null ? null : round2(trueBearing(bearing, from.floorId)),
        deltaBearing: delta === null ? null : round2(delta),
        durationSeconds: arc.seconds,
        text: verb,
      }
      afterTransition = undefined
    }
    if (bearing !== null) incoming = bearing
  })
  closeGroup(arcs.length)

  const last = path[path.length - 1]
  const arriveManeuver: Maneuver = evacuation ? 'ARRIVE_AT_SAFE_EXIT' : 'ARRIVE'
  const arriveText = evacuation
    ? `Đã tới ${nodeLabel(last)} — rời khỏi tòa nhà ngay`
    : `Đã đến ${nodeLabel(last)}`
  instructions.push({
    maneuver: arriveManeuver,
    floorId: last.floorId,
    fromNodeId: last.id,
    toNodeId: last.id,
    distanceMeters: 0,
    bearing: null,
    deltaBearing: null,
    durationSeconds: 0,
    text: arriveText,
  })
  stepMeta[path.length - 1] = { maneuver: arriveManeuver, text: arriveText }

  const steps: RouteStep[] = path.map((node, index) => {
    const arc = arcs[index]
    const next = path[index + 1]
    const isVertical = arc !== undefined && arc.kind !== 'WALK'
    const meta = stepMeta[index]
    return {
      nodeId: node.id,
      floorId: node.floorId,
      x: node.x,
      y: node.y,
      bearing: next && !isVertical && arc.meters > 0 ? round2(mapBearing(node, next)) : null,
      transition: isVertical ? (arc.kind as VerticalLinkKind) : undefined,
      targetFloorId: isVertical ? next.floorId : undefined,
      instruction: meta.text,
      maneuver: meta.maneuver,
      distanceMeters: meta.distanceMeters,
      waitSeconds: meta.waitSeconds,
    }
  })

  return { instructions, steps }
}

export type HazardPolicyOutcome = {
  route: IndoorRoute | null
  effectiveMode: 'NORMAL' | 'EVACUATION'
  destinationCancelled: boolean
  warningCode?: 'DESTINATION_IN_HAZARD' | 'NO_SAFE_EXIT_FOUND' | 'SOURCE_IN_HAZARD'
}

/**
 * Áp chính sách an toàn lên một yêu cầu tìm đường:
 * - nguồn nằm trong vùng cháy → SOURCE_IN_HAZARD (không giả vờ có tuyến an toàn);
 * - điểm đến cụ thể nằm trong vùng cháy → huỷ điểm đến, chuyển sang EVACUATION;
 * - đang ở chế độ cháy → mọi điểm đến cụ thể đều đổi thành lối thoát an toàn gần nhất;
 * - không còn lối thoát → NO_SAFE_EXIT_FOUND, tuyệt đối không quay lại điểm cháy.
 */
export function findRouteWithHazardPolicy(
  startNodeId: string,
  target: RouteTarget,
  nodes: PathfindingNode[],
  edges: PathfindingEdge[],
  verticalLinks: VerticalLink[],
  options: PathfindingOptions = {},
): HazardPolicyOutcome {
  const blocked = options.blockedNodeIds
  const burning = options.emergencyMode === 'FIRE'
  if (blocked?.has(startNodeId)) {
    return {
      route: null,
      effectiveMode: burning ? 'EVACUATION' : 'NORMAL',
      destinationCancelled: false,
      warningCode: 'SOURCE_IN_HAZARD',
    }
  }
  const destinationCancelled = typeof target === 'string' && blocked?.has(target) === true
  const evacuation = burning || destinationCancelled
  const effectiveTarget: RouteTarget =
    evacuation && typeof target === 'string' ? { findNearestExit: true } : target
  const route = findIndoorRoute(startNodeId, effectiveTarget, nodes, edges, verticalLinks, {
    ...options,
    emergencyMode: evacuation ? 'FIRE' : options.emergencyMode,
  })
  return {
    route,
    effectiveMode: evacuation ? 'EVACUATION' : 'NORMAL',
    destinationCancelled,
    warningCode: !route && evacuation ? 'NO_SAFE_EXIT_FOUND' : destinationCancelled ? 'DESTINATION_IN_HAZARD' : undefined,
  }
}

// ── Dijkstra ──────────────────────────────────────────────────────────────────

/**
 * Dijkstra đa tầng có tính an toàn PCCC.
 * - Cost chính là thời gian (giây); khi có điểm cháy, so sánh (risk, cost, nodeId) để ưu tiên an toàn trước.
 * - target là nodeId: tới node đó; { nodeIds }: tới node gần nhất theo chi phí graph;
 *   { findNearestExit: true }: tới lối thoát an toàn gần nhất (bỏ qua lối thoát bị chặn).
 */
export function findIndoorRoute(
  startNodeId: string,
  target: RouteTarget,
  nodes: PathfindingNode[],
  edges: PathfindingEdge[],
  verticalLinks: VerticalLink[],
  options: PathfindingOptions = {},
): IndoorRoute | null {
  const context = createContext(nodes, options)
  const { nodeById } = context
  const start = nodeById.get(startNodeId)
  if (!start || !isNodePassable(start, options)) return null

  const candidateIds =
    typeof target === 'string'
      ? [target]
      : 'nodeIds' in target
        ? target.nodeIds
        : getExitCandidates(nodes, options.floorLevels).map((node) => node.id)
  const targetIds = new Set(
    candidateIds.filter((id) => {
      const node = nodeById.get(id)
      return node !== undefined && isNodePassable(node, options)
    }),
  )
  if (targetIds.size === 0) return null

  const hazards = nodes.filter(
    (node) => options.blockedNodeIds?.has(node.id) || node.hazard === 'FIRE' || node.hazard === 'BLOCKED',
  )
  const radius = options.hazardSafetyRadiusMeters ?? DEFAULT_HAZARD_SAFETY_RADIUS_METERS
  const riskCache = new Map<string, number>()
  const riskOf = (node: PathfindingNode) => {
    if (hazards.length === 0) return 0
    let risk = riskCache.get(node.id)
    if (risk === undefined) {
      risk = nodeRisk(node, hazards, radius, context.unitsPerMeter(node.floorId))
      riskCache.set(node.id, risk)
    }
    return risk
  }

  const adjacency = buildAdjacency(context, edges, verticalLinks, options)
  const best = new Map<string, QueueItem>([[startNodeId, { id: startNodeId, risk: riskOf(start), cost: 0 }]])
  const previous = new Map<string, { from: string; arc: Arc }>()
  const visited = new Set<string>()
  const queue = new MinHeap()
  queue.push(best.get(startNodeId) as QueueItem)
  let reached: string | undefined

  while (queue.size > 0) {
    const current = queue.pop()
    if (visited.has(current.id)) continue
    visited.add(current.id)
    if (targetIds.has(current.id)) {
      reached = current.id
      break
    }

    for (const arc of adjacency.get(current.id) ?? []) {
      const nextNode = nodeById.get(arc.to)
      if (!nextNode || visited.has(arc.to) || !isNodePassable(nextNode, options)) continue
      const candidate = { id: arc.to, risk: current.risk + riskOf(nextNode), cost: current.cost + arc.cost }
      const known = best.get(arc.to)
      if (!known || compareItems(candidate, known) < 0) {
        best.set(arc.to, candidate)
        previous.set(arc.to, { from: current.id, arc })
        queue.push(candidate)
      }
    }
  }

  if (!reached) return null

  const nodeIds: string[] = [reached]
  const arcs: Arc[] = []
  let cursor = reached
  while (cursor !== startNodeId) {
    const link = previous.get(cursor)
    if (!link) return null
    arcs.unshift(link.arc)
    nodeIds.unshift(link.from)
    cursor = link.from
  }

  const path = nodeIds.map((id) => nodeById.get(id) as PathfindingNode)
  // Thang máy đi liền nhiều tầng (T1→T2→T3 là hai cạnh liên kết) chỉ phải chờ một lần ở lần lên đầu tiên.
  const ridden = arcs.map((arc, index) =>
    arc.kind === 'ELEVATOR' && arcs[index - 1]?.kind === 'ELEVATOR' && arc.waitSeconds > 0
      ? { ...arc, seconds: arc.seconds - arc.waitSeconds, waitSeconds: 0 }
      : arc,
  )
  const { instructions, steps } = buildTurnByTurn(path, ridden, options)
  const walkArcs = ridden.filter((arc) => arc.kind === 'WALK')
  const walkingDurationSeconds = Math.round(walkArcs.reduce((sum, arc) => sum + arc.seconds, 0))
  const transitionDurationSeconds = Math.round(
    ridden.filter((arc) => arc.kind !== 'WALK').reduce((sum, arc) => sum + arc.seconds, 0),
  )
  return {
    totalDistance: round2(walkArcs.reduce((sum, arc) => sum + arc.meters, 0)),
    estimatedDurationSeconds: walkingDurationSeconds + transitionDurationSeconds,
    walkingDurationSeconds,
    transitionDurationSeconds,
    nodeIds,
    steps,
    instructions,
  }
}
