import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Image as SvgImage, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg';

import { EmptyState } from '@/components/empty-state';
import { Text } from '@/components/scaled-text';
import { tripMinutes, type Point } from '@/data/venue/plan';
import { useColors, type Colors } from '@/hooks/use-colors';
import { useTrip } from '@/hooks/use-trip';

const DANGER = '#D64545';
const START = '#2E9E5B';
/** Isometric projection: x' = (x - y) cos30, y' = (x + y) sin30. */
const COS = 0.866;
const SIN = 0.5;
const SCALE = 0.34;
const FLOOR_GAP = 330;

export default function Route3DScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { to, from, mode } = useLocalSearchParams<{ to?: string; from?: string; mode?: string }>();
  const evac = mode === 'evac';
  const { venue, trip } = useTrip({ to, from, evac });
  const [focusId, setFocusId] = useState<string | null>(null);

  const floors = venue.floors;
  const accent = evac ? DANGER : colors.BLUE;

  const scene = useMemo(() => {
    if (!trip || floors.length === 0) return null;
    const w = Math.max(...floors.map((f) => f.mapWidth ?? 1000));
    const h = Math.max(...floors.map((f) => f.mapHeight ?? 1000));
    const index = new Map(floors.map((f, i) => [f.id, i]));
    // Floor i sits i * FLOOR_GAP above the ground floor on the screen.
    const project = (floorId: string, p: Point): Point => ({
      x: (p.x - p.y) * COS * SCALE,
      y: (p.x + p.y) * SIN * SCALE - (index.get(floorId) ?? 0) * FLOOR_GAP,
    });
    const matrix = (floorId: string) => {
      const dy = -(index.get(floorId) ?? 0) * FLOOR_GAP;
      return `matrix(${COS * SCALE}, ${SIN * SCALE}, ${-COS * SCALE}, ${SIN * SCALE}, 0, ${dy})`;
    };
    const corners = (floorId: string): Point[] => [
      project(floorId, { x: 0, y: 0 }),
      project(floorId, { x: w, y: 0 }),
      project(floorId, { x: w, y: h }),
      project(floorId, { x: 0, y: h }),
    ];
    const allPoints = floors.flatMap((f) => corners(f.id));
    const minX = Math.min(...allPoints.map((p) => p.x));
    const maxX = Math.max(...allPoints.map((p) => p.x));
    const minY = Math.min(...allPoints.map((p) => p.y));
    const maxY = Math.max(...allPoints.map((p) => p.y));
    const pad = 40;
    return { w, h, project, matrix, corners, viewBox: `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}` };
  }, [trip, floors]);

  if (venue.status === 'loading' || venue.status === 'idle') {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={styles.loading} color={colors.BLUE} size="large" />
      </SafeAreaView>
    );
  }
  if (!trip || !scene) {
    return (
      <SafeAreaView style={styles.root}>
        <EmptyState icon="alt-route" title={t(evac ? 'evac.noRoute' : 'nav.noRoute')} actionLabel={t('error.backToMap')} onAction={() => router.back()} />
      </SafeAreaView>
    );
  }

  const legs = trip.legs;
  const routeFloorIds = new Set(legs.map((l) => l.floorId));
  const first = legs[0].corners[0];
  const lastLeg = legs[legs.length - 1];
  const last = lastLeg.corners[lastLeg.corners.length - 1];
  const transfers = legs.length - 1;
  // Floors are drawn bottom-up so upper plates overlay the lower ones, like a stack.
  const ordered = [...floors].sort((a, b) => (a.floorNumber ?? 0) - (b.floorNumber ?? 0));

  return (
    <View style={styles.root}>
      <Svg width="100%" height="100%" viewBox={scene.viewBox} preserveAspectRatio="xMidYMid meet">
        {ordered.map((floor) => {
          const onRoute = routeFloorIds.has(floor.id);
          const focused = focusId === floor.id;
          const quad = scene.corners(floor.id);
          return (
            <G key={floor.id} opacity={onRoute || focused ? 1 : 0.35} onPress={() => setFocusId((current) => (current === floor.id ? null : floor.id))}>
              <Polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} fill={colors.CARD} stroke={onRoute ? accent : colors.BORDER} strokeWidth={onRoute ? 3 : 1.5} />
              {floor.mapImageUrl ? (
                <G transform={scene.matrix(floor.id)}>
                  <SvgImage x={0} y={0} width={scene.w} height={scene.h} href={{ uri: floor.mapImageUrl }} preserveAspectRatio="none" opacity={0.9} />
                </G>
              ) : null}
              <SvgText x={quad[3].x - 6} y={quad[3].y + 4} fontSize={30} fontWeight="700" fill={onRoute ? accent : colors.MUTED} textAnchor="end">
                {t('map.floor', { floor: floor.floorNumber })}
              </SvgText>
              {legs
                .filter((leg) => leg.floorId === floor.id)
                .map((leg, i) => (
                  <Polyline
                    key={`${floor.id}-${i}`}
                    points={leg.corners.map((c) => `${scene.project(floor.id, c).x},${scene.project(floor.id, c).y}`).join(' ')}
                    fill="none"
                    stroke={accent}
                    strokeWidth={7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
            </G>
          );
        })}

        {legs.slice(0, -1).map((leg, i) => {
          const a = scene.project(leg.floorId, leg.corners[leg.corners.length - 1]);
          const next = legs[i + 1];
          const b = scene.project(next.floorId, next.corners[0]);
          return (
            <G key={`link-${i}`}>
              <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeWidth={6} strokeDasharray="14 10" strokeLinecap="round" />
              <Circle cx={a.x} cy={a.y} r={11} fill="#FFFFFF" stroke={accent} strokeWidth={4} />
              <Circle cx={b.x} cy={b.y} r={11} fill="#FFFFFF" stroke={accent} strokeWidth={4} />
            </G>
          );
        })}

        <Circle cx={scene.project(legs[0].floorId, first).x} cy={scene.project(legs[0].floorId, first).y} r={15} fill={START} stroke="#FFFFFF" strokeWidth={5} />
        <Circle cx={scene.project(lastLeg.floorId, last).x} cy={scene.project(lastLeg.floorId, last).y} r={17} fill={accent} stroke="#FFFFFF" strokeWidth={5} />
      </Svg>

      <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} onPress={() => router.back()} style={[styles.back, { top: insets.top + 12 }]}>
        <MaterialIcons name="arrow-back" size={22} color={colors.INK} />
      </Pressable>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={styles.title}>{t('route3d.title')}</Text>
        <Text style={styles.sub}>
          {trip.destName} · {t('map.walkTime', { meters: Math.round(trip.totalMeters), minutes: tripMinutes(trip) })}
        </Text>
        <View style={styles.chips}>
          <View style={styles.chip}>
            <MaterialIcons name="layers" size={16} color={accent} />
            <Text style={styles.chipText}>{t('route3d.floors', { count: routeFloorIds.size })}</Text>
          </View>
          <View style={styles.chip}>
            <MaterialIcons name="swap-vert" size={16} color={accent} />
            <Text style={styles.chipText}>{t('route3d.transfers', { count: transfers })}</Text>
          </View>
        </View>
        <Text style={styles.hint}>{t('route3d.hint')}</Text>
      </View>
    </View>
  );
}

const makeStyles = ({ BG, INK, MUTED, CARD, BORDER, SURFACE }: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    loading: { flex: 1 },
    back: { position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.92)' },
    panel: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 8, backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: BORDER },
    title: { fontSize: 18, fontWeight: '800', color: INK },
    sub: { fontSize: 14, color: MUTED },
    chips: { flexDirection: 'row', gap: 8, marginTop: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: SURFACE },
    chipText: { fontSize: 13, fontWeight: '600', color: INK },
    hint: { fontSize: 12, color: MUTED, marginTop: 2 },
  });
