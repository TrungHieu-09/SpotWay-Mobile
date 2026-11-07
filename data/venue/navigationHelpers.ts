import type { PublicFloor, PublicFloorMap, PublicNode, PublicSearchResult } from './types'

export const AMENITY_MATCHERS: Record<'RESTROOM' | 'ATM' | 'INFO', { categories: string[]; keywords: string[]; label: string }> = {
  RESTROOM: { categories: ['RESTROOM', 'TOILET'], keywords: ['wc', 'toilet', 'vệ sinh', 'restroom'], label: 'nhà vệ sinh' },
  ATM: { categories: ['ATM'], keywords: ['atm'], label: 'ATM' },
  INFO: { categories: ['INFO'], keywords: ['info', 'thông tin', 'lễ tân', 'quầy'], label: 'quầy thông tin' },
}

export const floorLevelsOf = (floors: PublicFloor[]) =>
  Object.fromEntries(floors.map((floor) => [floor.id, floor.floorNumber]))

export const floorNamesOf = (floors: PublicFloor[]) =>
  Object.fromEntries(floors.map((floor) => [floor.id, `Tầng ${floor.floorNumber}`]))

export const calibrationOf = (floors: PublicFloor[], key: 'mapUnitsPerMeter' | 'northOffsetDegrees') =>
  Object.fromEntries(
    floors.flatMap((floor) => (typeof floor[key] === 'number' ? [[floor.id, floor[key] as number]] : [])),
  )

export const allNodesOf = (mapsByFloorId: Record<string, PublicFloorMap>) =>
  Object.values(mapsByFloorId).flatMap((map) => map.nodes)

/**
 * Mọi node của toà nhà, trong đó node neo của POI loại EXIT được coi là lối thoát (type EXIT).
 * Khớp với BE: lúc publish BE chấp nhận "POI EXIT" thay cho node EXIT, nên tuyến thoát hiểm tính trên FE cũng phải vậy.
 * Node vốn đã là lối thoát hoặc thang giữ nguyên loại.
 */
export function nodesWithPoiExits(mapsByFloorId: Record<string, PublicFloorMap>): PublicNode[] {
  const exitAnchors = new Set(
    Object.values(mapsByFloorId)
      .flatMap((map) => map.pois)
      .filter((poi) => poi.category.toUpperCase() === 'EXIT')
      .map((poi) => poi.nodeId),
  )
  return allNodesOf(mapsByFloorId).map((node) =>
    exitAnchors.has(node.id) && !['EXIT', 'EMERGENCY_EXIT', 'ELEVATOR', 'STAIR', 'ESCALATOR'].includes(node.type)
      ? { ...node, type: 'EXIT' }
      : node,
  )
}

export const sortFloors = (floors: PublicFloor[]) => [...floors].sort((a, b) => a.floorNumber - b.floorNumber)

export function pickDefaultStart(floors: PublicFloor[], nodes: PublicNode[]) {
  const ground = sortFloors(floors)[0]
  const groundNodes = nodes.filter((node) => node.floorId === ground?.id)
  return (groundNodes.find((node) => node.type === 'DOOR') ?? groundNodes[0] ?? nodes[0])?.id
}

export function pickDestination(destinations: PublicSearchResult[], floorId: string | undefined, keywords: string[]) {
  const onFloor = destinations.filter((item) => item.floorId === floorId)
  return onFloor.find((item) => keywords.some((keyword) => item.name.toLowerCase().includes(keyword))) ?? onFloor[0]
}

/** Tầng đích cho demo đa tầng: Tầng 3 nếu có, không thì tầng cao nhất */
export const upperFloorOf = (floors: PublicFloor[]) => {
  const sorted = sortFloors(floors)
  return sorted.length > 2 ? sorted[2] : sorted.at(-1)
}

export function neighborsOf(mapsByFloorId: Record<string, PublicFloorMap>, nodeId: string) {
  return Object.values(mapsByFloorId)
    .flatMap((map) => map.edges)
    .flatMap((edge) =>
      edge.fromNodeId === nodeId ? [edge.toNodeId] : edge.toNodeId === nodeId ? [edge.fromNodeId] : [],
    )
}
