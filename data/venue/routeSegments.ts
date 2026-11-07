import type { RouteStep, VerticalLinkKind } from './types'

/** Đoạn đi bộ trên một tầng. */
export type WalkSegment = {
  type: 'walk'
  floorId: string
  /** Chỉ số bước đầu/cuối (trong `route.steps`) của đoạn; bấm vào đoạn thì nhảy tới `firstIndex`. */
  firstIndex: number
  lastIndex: number
  distanceMeters: number
  isStart: boolean
  isEnd: boolean
}

/** Một lần đi thang liền mạch (có thể qua nhiều tầng, vd. thang máy T1 → T3). */
export type RideSegment = {
  type: 'ride'
  kind: VerticalLinkKind
  fromFloorId: string
  toFloorId: string
  /** Các tầng thang đi ngang qua mà không bước ra. */
  viaFloorIds: string[]
  firstIndex: number
  lastIndex: number
  waitSeconds: number
}

export type RouteSegment = WalkSegment | RideSegment

/**
 * Chia tuyến thành trình tự "đi bộ ở tầng A → đi thang → đi bộ ở tầng B…" để hiện cả hành trình qua nhiều tầng.
 * Bước có `transition` là bước lên thang; các bước liên tiếp có `transition` gộp thành một lần đi thang.
 */
export function splitRouteByFloor(steps: readonly RouteStep[]): RouteSegment[] {
  const segments: RouteSegment[] = []
  let index = 0
  while (index < steps.length) {
    const step = steps[index]
    if (step.transition) {
      let last = index
      const via: string[] = []
      let waitSeconds = step.waitSeconds ?? 0
      while (steps[last + 1]?.transition) {
        last += 1
        via.push(steps[last].floorId)
        waitSeconds += steps[last].waitSeconds ?? 0
      }
      const lastStep = steps[last]
      segments.push({
        type: 'ride',
        kind: step.transition,
        fromFloorId: step.floorId,
        toFloorId: lastStep.targetFloorId ?? steps[last + 1]?.floorId ?? lastStep.floorId,
        viaFloorIds: via,
        firstIndex: index,
        lastIndex: last,
        waitSeconds,
      })
      index = last + 1
      continue
    }
    let last = index
    let distance = step.distanceMeters ?? 0
    while (steps[last + 1] && !steps[last + 1].transition && steps[last + 1].floorId === step.floorId) {
      last += 1
      distance += steps[last].distanceMeters ?? 0
    }
    segments.push({ type: 'walk', floorId: step.floorId, firstIndex: index, lastIndex: last, distanceMeters: distance, isStart: false, isEnd: false })
    index = last + 1
  }
  const walks = segments.filter((segment): segment is WalkSegment => segment.type === 'walk')
  if (walks.length > 0) {
    walks[0].isStart = walks[0].firstIndex === 0
    walks[walks.length - 1].isEnd = walks[walks.length - 1].lastIndex === steps.length - 1
  }
  return segments
}

/** Mọi tầng tuyến đi qua (kể cả tầng chỉ đi ngang trong thang), theo thứ tự xuất hiện, không lặp. */
export function floorsOnRoute(steps: readonly RouteStep[]): string[] {
  const ordered: string[] = []
  for (const step of steps) {
    if (!ordered.includes(step.floorId)) ordered.push(step.floorId)
    if (step.targetFloorId && !ordered.includes(step.targetFloorId)) ordered.push(step.targetFloorId)
  }
  return ordered
}
