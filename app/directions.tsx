import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle, G, Path, Polyline } from 'react-native-svg';

import { FloorCanvas, markerScale } from '@/components/floor-canvas';
import { EmptyState } from '@/components/empty-state';
import { Text } from '@/components/scaled-text';
import { stepHeadline, type Point, type StepKind } from '@/data/venue/plan';
import { floorLabel, metersPerPixelOf } from '@/data/venue/venue';
import { useTextScale } from '@/hooks/use-accessibility-mode';
import { useActiveStep } from '@/hooks/use-active-step';
import { setIncident } from '@/hooks/use-incident';
import { routeKey, useTrip } from '@/hooks/use-trip';
import { simSpeed, useWalkSimulation } from '@/hooks/use-walk-simulation';

import { useColors, type Colors } from '@/hooks/use-colors';
const DANGER = '#D64545';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const WALK_SPEED_MPS = 1.2;

const TRANSFER_ICON = {
  stairs: 'stairs',
  lift: 'elevator',
  escalator: 'escalator',
} as const;

const STEP_ICON: Record<Exclude<StepKind, 'transfer'>, keyof typeof MaterialIcons.glyphMap> = {
  straight: 'arrow-upward',
  left: 'turn-left',
  right: 'turn-right',
  arrive: 'flag',
};

type Focus = 'follow' | 'stairs' | 'elevator';

const NO_CORNERS: Point[] = [];

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export default function DirectionsScreen() {
  const colors = useColors();
  const { BLUE, INK, EVAC_BG } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { to, dest, from, mode } = useLocalSearchParams<{
    to?: string;
    dest?: string;
    from?: string;
    mode?: string;
  }>();
  const evac = mode === 'evac';
  const destId = to ?? dest ?? '';

  // One leg per floor, joined by 'transfer' steps; computed on the phone by the routing engine.
  const { venue, trip, startNodeId, incident } = useTrip({ to: destId, from, evac });
  const mapTextScale = 1 + (useTextScale() - 1) * 0.5;
  void mapTextScale;
  const legs = trip?.legs ?? null;
  const [legIndex, setLegIndex] = useState(0);
  useEffect(() => setLegIndex(0), [trip]);
  const plan = useMemo(() => legs?.[legIndex] ?? null, [legs, legIndex]);
  const routeFloorId = plan?.floorId ?? '';
  const [active, setActive] = useActiveStep(routeKey(evac, startNodeId, destId, legIndex));
  const [viewFloorId, setViewFloorId] = useState<string>(routeFloorId);
  useEffect(() => setViewFloorId(routeFloorId), [routeFloorId]);
  const [focus, setFocus] = useState<Focus>('follow');
  const viewFloorObj = venue.floors.find((f) => f.id === viewFloorId) ?? null;
  const k = viewFloorObj ? markerScale(viewFloorObj) : 1;

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const pulseR = pulse.interpolate({ inputRange: [0, 1], outputRange: [10 * k, 28 * k] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  // Simulated walker: drives the active step; external step changes (card tap, list) seek it.
  const corners = plan?.corners ?? NO_CORNERS;
  const sim = useWalkSimulation(corners, simSpeed(metersPerPixelOf(routeFloorId)));
  const { segmentIndex, seekToSegment } = sim;
  useEffect(() => {
    setActive(segmentIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentIndex]);

  // The step list can change the active step while this screen is hidden: seek when we come back.
  // (Seeking only on explicit actions avoids the sim and the store chasing each other.)
  const latest = useRef({ active, segmentIndex });
  latest.current = { active, segmentIndex };
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      if (latest.current.active !== latest.current.segmentIndex) seekToSegment(latest.current.active);
    }, [seekToSegment]),
  );

  // Reaching the lift / escalator / stairwell hands over to the next floor's leg after a short pause.
  const lastStep = plan?.steps[plan.steps.length - 1];
  const atTransfer = lastStep?.kind === 'transfer' && sim.finished;
  useEffect(() => {
    if (!atTransfer || !legs || legIndex >= legs.length - 1) return;
    const id = setTimeout(() => setLegIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
  }, [atTransfer, legs, legIndex]);

  if (!plan) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} hitSlop={8} onPress={() => router.back()} style={styles.emptyBack}>
          <MaterialIcons name="arrow-back" size={24} color={INK} />
        </Pressable>
        <EmptyState
          icon={evac ? 'warning-amber' : 'alt-route'}
          title={t(evac ? 'evac.noRoute' : 'nav.noRoute')}
          message={evac ? undefined : t('nav.noRouteHint')}
          actionLabel={t('error.backToMap')}
          onAction={() => router.dismissTo({ pathname: '/map', params: { from } })}
        />
      </SafeAreaView>
    );
  }

  const { steps } = plan;
  const destName = trip?.destName ?? '';
  const viewMap = viewFloorObj ? venue.mapsByFloorId[viewFloorObj.id] : undefined;
  const routeFloor = routeFloorId;
  const viewFloor = viewFloorId;
  const accent = evac ? DANGER : BLUE;
  const legCount = corners.length - 1;
  const current = Math.min(active, steps.length - 1);
  const step = steps[current];
  const next = steps[current + 1];
  const onRouteFloor = viewFloor === routeFloor;

  // Position + heading come from the walk simulation; leg bounds still drive the camera.
  const { position, heading } = sim;
  const legFrom = corners[Math.min(current, legCount - 1)] ?? position;
  const legTo = corners[Math.min(current + 1, legCount)] ?? position;
  const legLeft = step.kind === 'arrive' ? 0 : Math.max(1, Math.ceil(step.meters * (1 - sim.progress)));

  const remainingMeters =
    legLeft + steps.slice(current + 1).reduce((sum, s) => sum + s.meters, 0) +
    (legs ?? []).slice(legIndex + 1).reduce((sum, l) => sum + l.steps.reduce((a, c) => a + c.meters, 0), 0);
  const arrived = step.kind === 'arrive' && sim.finished;
  const safe = evac && arrived && legIndex === (legs?.length ?? 1) - 1;
  const remainingMinutes = Math.max(1, Math.ceil(remainingMeters / WALK_SPEED_MPS / 60));

  // Camera: follow the current leg, or jump to a lift / stairwell the user asked about.
  const facilityNode = (type: 'ELEVATOR' | 'STAIR') => {
    const nodes = (viewMap?.nodes ?? []).filter((n) => n.type === type);
    let best = nodes[0];
    for (const n of nodes) {
      if (Math.hypot(n.x - position.x, n.y - position.y) < Math.hypot(best.x - position.x, best.y - position.y)) best = n;
    }
    return best ?? null;
  };
  const focusPoint = focus === 'stairs' ? facilityNode('STAIR') : focus === 'elevator' ? facilityNode('ELEVATOR') : null;
  const MAP_W = viewFloorObj?.mapWidth ?? 1000;
  const MAP_H = viewFloorObj?.mapHeight ?? 1000;
  const aspect = winH / winW;
  let vbW: number;
  let cx: number;
  let cy: number;
  if (focusPoint || !onRouteFloor) {
    vbW = 240 * k;
    cx = focusPoint?.x ?? MAP_W / 2;
    cy = focusPoint?.y ?? MAP_H / 2;
    if (!focusPoint) vbW = Math.max(MAP_W, MAP_H * 0.7);
  } else {
    const minX = Math.min(legFrom.x, legTo.x);
    const maxX = Math.max(legFrom.x, legTo.x);
    const minY = Math.min(legFrom.y, legTo.y);
    const maxY = Math.max(legFrom.y, legTo.y);
    vbW = Math.min(MAP_W, Math.max(maxX - minX + 200 * k, (maxY - minY + 200 * k) / aspect, 320 * k));
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
  }
  const vbH = vbW * aspect;
  const vbX = Math.min(Math.max(MAP_W - vbW, 0), Math.max(0, cx - vbW / 2));
  // The instruction card is taller than the bottom bar, so nudge content down a little.
  const vbY = Math.min(Math.max(MAP_H - vbH, 0), Math.max(-60 * k, cy - vbH / 2 - vbH * 0.06));
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`;

  const pts = (list: { x: number; y: number }[]) => list.map((p) => `${p.x},${p.y}`).join(' ');
  const done = current >= legCount ? corners : [...corners.slice(0, current + 1), position];
  const now = current < legCount ? [position, corners[current + 1]] : [];
  const upcoming = current + 1 < legCount ? corners.slice(current + 1) : [];

  const sub = step.kind === 'arrive' || step.kind === 'transfer' ? destName : step.text;
  const afterText = next
    ? next.kind === 'arrive'
      ? t('dir.arrived')
      : stepHeadline(t, next)
    : null;

  return (
    <View style={styles.root}>
      <View style={StyleSheet.absoluteFill}>
        {viewFloorObj ? (
          <FloorCanvas
            floor={viewFloorObj}
            map={viewMap}
            showLabels={false}
            viewBox={viewBox}
            preserveAspectRatio="xMidYMid slice"
            fireNodeIds={incident && incident.floorId === viewFloorObj.id ? [incident.nodeId] : []}>
          {onRouteFloor && done.length > 1 && (
            <Polyline
              points={pts(done)}
              fill="none"
              stroke={accent}
              strokeWidth={3 * k}
              strokeOpacity={0.25}
              strokeDasharray={[8 * k, 4 * k, 2 * k, 4 * k]}
              strokeLinejoin="round"
            />
          )}
          {onRouteFloor && upcoming.length > 1 && (
            <Polyline
              points={pts([corners[current + 1], ...upcoming.slice(1)])}
              fill="none"
              stroke={accent}
              strokeWidth={3 * k}
              strokeDasharray={[8 * k, 4 * k, 2 * k, 4 * k]}
              strokeLinejoin="round"
            />
          )}
          {onRouteFloor && now.length > 1 && (
            <Polyline
              points={pts(now)}
              fill="none"
              stroke={accent}
              strokeWidth={6 * k}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {onRouteFloor && (
            <G>
              <AnimatedCircle
                cx={position.x}
                cy={position.y}
                r={pulseR}
                fill={accent}
                opacity={pulseOpacity}
              />
              <G transform={`translate(${position.x}, ${position.y}) rotate(${heading}) scale(${k})`}>
                <Path
                  d="M0 -11 L8 9 L0 4 L-8 9 Z"
                  fill={accent}
                  stroke="#FFFFFF"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              </G>
            </G>
          )}
          </FloorCanvas>
        ) : null}
      </View>

      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        {evac && (
          <View style={styles.evacBanner}>
            <MaterialIcons name="warning" size={26} color="#FFFFFF" />
            <Text style={styles.evacBannerText}>{t('evac.header')}</Text>
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const nextStep = Math.min(current + 1, steps.length - 1);
            setActive(nextStep);
            seekToSegment(nextStep);
          }}
          style={[styles.card, evac && styles.cardEvac]}>
          <View style={[styles.cardIcon, evac && { backgroundColor: DANGER }]}>
            <MaterialIcons
              name={step.kind === 'transfer' ? TRANSFER_ICON[step.via ?? 'stairs'] : STEP_ICON[step.kind]}
              size={44}
              color="#FFFFFF"
            />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardMain, evac && styles.cardMainEvac]} numberOfLines={evac ? 2 : 1}>
              {stepHeadline(t, { ...step, meters: legLeft })}
            </Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {sub}
            </Text>
            {afterText && (
              <Text style={styles.cardNext} numberOfLines={1}>
                {t('dir.next', { action: lowerFirst(afterText) })}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('dir.list')}
            hitSlop={10}
            onPress={() =>
              router.push({ pathname: '/directions-list', params: { to: destId, from, mode, leg: String(legIndex) },
              })
            }
            style={styles.menu}>
            <MaterialIcons name="menu" size={24} color={INK} />
          </Pressable>
        </Pressable>
      </SafeAreaView>

      <View style={[styles.sideLeft, { top: insets.top + 150 + (evac ? 70 : 0) }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: focus === 'stairs' }}
          onPress={() => setFocus((f) => (f === 'stairs' ? 'follow' : 'stairs'))}
          style={styles.facility}>
          <View style={[styles.facilityBtn, focus === 'stairs' && styles.facilityBtnOn]}>
            <MaterialIcons name="stairs" size={22} color={focus === 'stairs' ? '#FFFFFF' : BLUE} />
          </View>
          <Text style={styles.facilityLabel}>{t('dir.stairs')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: focus === 'elevator' }}
          onPress={() => setFocus((f) => (f === 'elevator' ? 'follow' : 'elevator'))}
          style={styles.facility}>
          <View style={[styles.facilityBtn, focus === 'elevator' && styles.facilityBtnOn]}>
            <MaterialIcons name="elevator" size={22} color={focus === 'elevator' ? '#FFFFFF' : BLUE} />
          </View>
          <Text style={styles.facilityLabel}>{t('dir.lift')}</Text>
        </Pressable>
      </View>

      <View style={[styles.sideRight, { top: insets.top + 150 + (evac ? 70 : 0) }]} pointerEvents="box-none">
        <View style={styles.floorColumn}>
          {[...venue.floors].reverse().map((fl) => {
            const f = fl.id;
            const label = floorLabel(fl.id);
            const on = f === viewFloor;
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t('map.floor', { floor: label })}
                onPress={() => {
                  setViewFloorId(f);
                  setFocus('follow');
                }}
                style={[styles.floorItem, on && styles.floorItemOn]}>
                <Text style={[styles.floorText, on && styles.floorTextOn]}>{label}</Text>
                {incident?.floorId === f && <View style={styles.floorDot} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[
          styles.bottom,
          evac && { backgroundColor: EVAC_BG },
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomName} numberOfLines={1}>
            {destName}
          </Text>
          <Text style={styles.bottomMeta}>
            {arrived
              ? t('dir.youArrived')
              : t('dir.time', { minutes: remainingMinutes, meters: remainingMeters })}
          </Text>
        </View>
        {arrived && !evac ? (
          <View style={styles.arrivedBtns}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/store', params: { id: destId, from } })}
              style={[styles.arrivedBtn, styles.arrivedBtnPrimary]}>
              <Text style={styles.arrivedBtnPrimaryText}>{t('dir.viewStore')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.dismissTo('/')}
              style={styles.arrivedBtn}>
              <Text style={styles.arrivedBtnText}>{t('dir.goHome')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
        {!sim.finished && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={sim.playing ? t('dir.pause') : t('dir.resume')}
            onPress={sim.playing ? sim.pause : sim.play}
            hitSlop={6}
            style={styles.simBtn}>
            <MaterialIcons name={sim.playing ? 'pause' : 'play-arrow'} size={22} color={BLUE} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dir.restart')}
          onPress={sim.restart}
          hitSlop={6}
          style={styles.simBtn}>
          <MaterialIcons name="replay" size={22} color={BLUE} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.dismissTo({ pathname: '/map', params: { from, floor: routeFloor, ts: String(Date.now()) } })
          }
          hitSlop={8}>
          <Text style={styles.exit}>{t('dir.exit')}</Text>
        </Pressable>
          </>
        )}
      </View>
      {safe && (
        <View style={styles.safe}>
          <MaterialIcons name="verified-user" size={96} color="#FFFFFF" />
          <Text style={styles.safeTitle}>{t('evac.safeTitle')}</Text>
          <Text style={styles.safeDesc}>{t('evac.safeDesc')}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setIncident(null);
              router.dismissTo({ pathname: '/map', params: { from, floor: routeFloor, ts: String(Date.now()) } });
            }}
            style={styles.safeBtn}>
            <Text style={styles.safeBtnText}>{t('evac.safeBack')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const shadow = {
  shadowColor: '#14213D',
  shadowOpacity: 0.14,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const makeStyles = ({ BLUE, INK, MUTED, BORDER, ACTIVE_BG, CANVAS, CARD }: Colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: CANVAS },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  card: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: CARD,
    ...shadow,
  },
  cardEvac: { borderWidth: 3, borderColor: DANGER },
  cardMainEvac: { fontSize: 28 },
  evacBanner: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: DANGER,
  },
  evacBannerText: { flex: 1, fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  safe: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
    backgroundColor: '#2E9E5B',
  },
  safeTitle: { fontSize: 32, fontWeight: '800', color: '#FFFFFF' },
  safeDesc: { fontSize: 16, textAlign: 'center', color: '#FFFFFF' },
  safeBtn: {
    marginTop: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: CARD,
  },
  safeBtnText: { fontSize: 16, fontWeight: '800', color: '#2E9E5B' },
  cardIcon: {
    width: 68,
    height: 68,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
  },
  cardBody: { flex: 1, gap: 2 },
  cardMain: { fontSize: 22, fontWeight: '800', color: INK },
  cardSub: { fontSize: 14, color: MUTED },
  cardNext: { marginTop: 4, fontSize: 12, fontWeight: '600', color: MUTED },
  menu: {
    alignSelf: 'flex-start',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACTIVE_BG,
  },
  sideLeft: { position: 'absolute', left: 12, gap: 12 },
  facility: { alignItems: 'center', gap: 4 },
  facilityBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    ...shadow,
  },
  facilityBtnOn: { backgroundColor: BLUE, borderColor: BLUE },
  facilityLabel: { fontSize: 11, fontWeight: '700', color: INK },
  sideRight: { position: 'absolute', right: 12 },
  floorColumn: {
    padding: 4,
    gap: 4,
    borderRadius: 24,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    ...shadow,
  },
  floorItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorItemOn: { backgroundColor: BLUE },
  floorDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: DANGER,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  floorText: { fontSize: 13, fontWeight: '700', color: MUTED },
  floorTextOn: { color: '#FFFFFF' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  bottomInfo: { flex: 1 },
  bottomName: { fontSize: 16, fontWeight: '800', color: INK },
  bottomMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
  arrivedBtns: { flexDirection: 'row', gap: 10 },
  arrivedBtn: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BLUE,
  },
  arrivedBtnPrimary: { backgroundColor: BLUE },
  arrivedBtnText: { fontSize: 14, fontWeight: '700', color: BLUE },
  arrivedBtnPrimaryText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  simBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACTIVE_BG,
  },
  exit: { fontSize: 15, fontWeight: '800', color: DANGER },
  emptyBack: { padding: 16 },
  empty: { padding: 24, textAlign: 'center', color: MUTED },
});
