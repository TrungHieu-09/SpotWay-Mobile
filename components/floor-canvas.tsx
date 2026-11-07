import type { ReactNode } from 'react';
import { Animated } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Polyline, Text as SvgText } from 'react-native-svg';

import { StoreIcon } from '@/components/floor-plan-parts';
import { poiIcon } from '@/data/venue/places';
import type { PublicFloor, PublicFloorMap, PublicPoi } from '@/data/venue/types';
import { useColors } from '@/hooks/use-colors';

const DANGER = '#D64545';
const EXIT_GREEN = '#2E9E5B';

export const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

/** Marker size multiplier: markers are designed on a 400-unit plan and scaled to the real image size. */
export const markerScale = (floor: Pick<PublicFloor, 'mapWidth' | 'mapHeight'>) =>
  Math.max(floor.mapWidth ?? 1000, floor.mapHeight ?? 1000) / 400;

export type FloorCanvasProps = {
  floor: PublicFloor;
  map: PublicFloorMap | undefined;
  selectedPoiId?: string | null;
  onPoiPress?: (poi: PublicPoi) => void;
  /** Hide labels (used while following a route, where the background is busy). */
  showLabels?: boolean;
  fireNodeIds?: string[];
  /** viewBox override in map pixels: "x y w h". */
  viewBox?: string;
  preserveAspectRatio?: string;
  children?: ReactNode;
};

/** Floor plan image with POI markers in map pixels; route / position overlays go in `children`. */
export function FloorCanvas({
  floor,
  map,
  selectedPoiId,
  onPoiPress,
  showLabels = true,
  fireNodeIds = [],
  viewBox,
  preserveAspectRatio = 'xMidYMid meet',
  children,
}: FloorCanvasProps) {
  const { BLUE, INK, STORE_FILL, SELECTED_FILL } = useColors();
  const w = floor.mapWidth ?? 1000;
  const h = floor.mapHeight ?? 1000;
  const k = markerScale(floor);
  const nodeAt = new Map((map?.nodes ?? []).map((n) => [n.id, n]));
  const fire = fireNodeIds.map((id) => nodeAt.get(id)).filter((n): n is NonNullable<typeof n> => !!n);

  return (
    <Svg width="100%" height="100%" viewBox={viewBox ?? `0 0 ${w} ${h}`} preserveAspectRatio={preserveAspectRatio}>
      {floor.mapImageUrl ? (
        <SvgImage x={0} y={0} width={w} height={h} href={{ uri: floor.mapImageUrl }} preserveAspectRatio="xMidYMid slice" />
      ) : null}

      {fire.map((n) => (
        <G key={n.id}>
          <Circle cx={n.x} cy={n.y} r={36 * k} fill={DANGER} opacity={0.28} />
          <Circle cx={n.x} cy={n.y} r={10 * k} fill={DANGER} />
        </G>
      ))}

      {(map?.pois ?? []).map((poi) => {
        const x = poi.x ?? nodeAt.get(poi.nodeId)?.x;
        const y = poi.y ?? nodeAt.get(poi.nodeId)?.y;
        if (x === undefined || y === undefined) return null;
        const icon = poiIcon(poi);
        const selected = poi.id === selectedPoiId;
        const r = 9 * k;
        return (
          <G key={poi.id} onPress={onPoiPress ? () => onPoiPress(poi) : undefined}>
            <Circle cx={x} cy={y} r={r * 1.5} fill="transparent" />
            <Circle
              cx={x}
              cy={y}
              r={selected ? r * 1.25 : r}
              fill={selected ? SELECTED_FILL : STORE_FILL}
              stroke={selected ? BLUE : icon === 'exit' ? EXIT_GREEN : INK}
              strokeWidth={(selected ? 2.2 : 1.4) * k}
            />
            {icon ? (
              <G transform={`translate(${x}, ${y}) scale(${k * 0.55})`}>
                <StoreIcon category={icon} x={0} y={0} />
              </G>
            ) : null}
            {showLabels && poi.name ? (
              <SvgText x={x} y={y + r + 8 * k} fontSize={6.5 * k} fill={INK} textAnchor="middle">
                {poi.name.length > 14 ? `${poi.name.slice(0, 13)}…` : poi.name}
              </SvgText>
            ) : null}
          </G>
        );
      })}

      {children}
    </Svg>
  );
}

