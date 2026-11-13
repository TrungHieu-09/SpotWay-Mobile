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
import { defaultStartNodeId, destinationById, floorLabel, metersPerPixelOf, nodeById } from '@/data/venue/venue';
import { useTextScale } from '@/hooks/use-accessibility-mode';
import { useActiveStep } from '@/hooks/use-active-step';
import { setIncident } from '@/hooks/use-incident';
import { LiveNotice } from '@/components/live-notice';
import { ExitClaimer } from '@/components/exit-claimer';
import { RerouteBanner } from '@/components/reroute-banner';
import { RoutePromo } from '@/components/route-promo';
import { TripTracker } from '@/components/trip-tracker';
import { VoiceGuide } from '@/components/voice-guide';
import { routeKey, useTrip } from '@/hooks/use-trip';
import { bearing, projectOnPolyline, trackOnRoute } from '@/data/venue/livepos';
import { STRIDE_METERS, useLivePosition } from '@/hooks/use-live-position';
import { SIM_SPEEDS, simSpeed, useWalkSimulation } from '@/hooks/use-walk-simulation';

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
/** Steps added by the tap fallback when the pedometer is not usable. */
const TAP_STEPS = 3;
/** Farther than this from the planned route counts as having gone off it (metres). */
const OFF_ROUTE_M = 6;
/** Walking this far back along the route counts as turning around (metres). */
const REVERSE_M = 6;
/** Within this distance of the end the person has arrived (metres). */
const ARRIVE_M = 2.5;
const REROUTE_COOLDOWN_MS = 3000;
/** Demo walker: one step every this many ms at 1x (about 0.8 m/s), divided by the chosen speed. */
const DEMO_STEP_MS = 900;
/** Steps walked the wrong way when the presenter taps "walk back" (enough to pass the 6 m reversal limit). */
const DEMO_DETOUR_STEPS = 12;
/** A demo walker that has not moved for this many ticks is put back on the route. */
const DEMO_STUCK_TICKS = 3;
/** Pause on arriving at a lift / stairs before the demo person "presses" the next floor. */
const DEMO_FLOOR_PAUSE_MS = 1600;

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

export default function DirectionsScreen() {
  const colors = useColors();
  const { BLUE, INK, EVAC_BG } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const { to, dest, from, mode, queue, label } = useLocalSearchParams<{
    to?: string;
    dest?: string;
    from?: string;
    mode?: string;
    /** Remaining stops of a multi-stop trip (comma separated destination ids). */
    queue?: string;
    /** Display name for a `node:` target such as the parking spot. */
    label?: string;
  }>();
  const evac = mode === 'evac';
  const destId = to ?? dest ?? '';
  const [nextStopId, ...restQueue] = (queue ?? '').split(',').filter(Boolean);

  // One leg per floor, joined by 'transfer' steps; computed on the phone by the routing engine.
  // After going off the route the new route starts at a corridor node near the person instead of the scanned QR point.
  const [startOverride, setStartOverride] = useState<string | undefined>();
  const { venue, trip, routeNodeIds, evacExit, startNodeId, incident, measureFrom } = useTrip({ to: destId, from: startOverride ?? from, evac, label });
  const mapTextScale = 1 + (useTextScale() - 1) * 0.5;
  void mapTextScale;
  const legs = trip?.legs ?? null;
  // A fire that starts while someone follows a normal route turns that route into an evacuation route (the engine sends
  // them to the nearest safe exit). Switch to the evacuation screen so the title, colours and exit name match what they walk.
  const turnedEvacuation = !evac && !!trip?.evacuation;
  useEffect(() => {
    if (turnedEvacuation) router.replace({ pathname: '/directions', params: { mode: 'evac', from: startNodeId } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnedEvacuation]);
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
  const [speedIndex, setSpeedIndex] = useState(1);
  const [realWalk, setRealWalk] = useState(false);
  const sim = useWalkSimulation(corners, simSpeed(metersPerPixelOf(routeFloorId), SIM_SPEEDS[speedIndex]), realWalk);
  const { segmentIndex, seekToSegment } = sim;

  // ---- Live position (real walking): steps + compass on the floor graph, floor chosen with the floor buttons ----------
  const segForBearing = Math.min(sim.segmentIndex, Math.max(0, corners.length - 2));
  const expectedBearing = corners.length >= 2 ? bearing(corners[segForBearing], corners[segForBearing + 1]) : undefined;
  // Demo: the same live-position pipeline, driven by a timer instead of the pedometer and compass.
  const [demoDrive, setDemoDrive] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);
  const livePos = useLivePosition({ enabled: realWalk && !!trip, startNodeId, routeNodeIds, expectedBearing, simulated: demoDrive });
  const routeMpp = metersPerPixelOf(routeFloorId);
  const bestAlong = useRef(0);
  const offCount = useRef(0);
  const lastReroute = useRef(0);
  const [reroutedAt, setReroutedAt] = useState(0);
  const latestLive = useRef({ livePos, measureFrom, startNodeId });
  latestLive.current = { livePos, measureFrom, startNodeId };
  useEffect(() => {
    bestAlong.current = 0;
    offCount.current = 0;
  }, [trip, legIndex]);

  /** A new route from the corridor end (behind or ahead of the person) that gives the shortest way to the goal. */
  const reroute = useCallback((force = false) => {
    const { livePos: lp, measureFrom: measure, startNodeId: currentStart } = latestLive.current;
    const loc = lp.loc;
    const point = lp.point;
    // A floor change is an explicit action of the person: never held back by the cooldown that damps position noise.
    if (!loc || !point || (!force && Date.now() - lastReroute.current < REROUTE_COOLDOWN_MS)) return;
    const a = nodeById(loc.a);
    const b = nodeById(loc.b);
    if (!a || !b) return;
    const mpp = metersPerPixelOf(loc.floorId);
    const costA = Math.hypot(point.x - a.x, point.y - a.y) * mpp + measure(a.id);
    const costB = Math.hypot(point.x - b.x, point.y - b.y) * mpp + measure(b.id);
    if (!Number.isFinite(costA) && !Number.isFinite(costB)) return;
    const best = costA <= costB ? a.id : b.id;
    if (best === currentStart) return;
    lastReroute.current = Date.now();
    setStartOverride(best);
    setReroutedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!realWalk || !livePos.loc || !livePos.point || !legs) return;
    const liveFloor = livePos.floorId;
    if (liveFloor !== routeFloorId) {
      // The person picked another floor: continue on the leg of that floor, or recompute if the route never goes there.
      const candidates = legs.map((l, i) => ({ l, i })).filter(({ l, i }) => l.floorId === liveFloor && i !== legIndex);
      const target = candidates.find(({ i }) => i > legIndex) ?? candidates[candidates.length - 1];
      if (target) setLegIndex(target.i);
      else reroute(true);
      return;
    }
    const tracker = { bestAlong: bestAlong.current, offCount: offCount.current };
    const result = trackOnRoute(corners, livePos.point, routeMpp, tracker, { offRouteM: OFF_ROUTE_M, reverseM: REVERSE_M, arriveM: ARRIVE_M, offSamples: 2 });
    bestAlong.current = tracker.bestAlong;
    offCount.current = tracker.offCount;
    if (result.action === 'follow') sim.seekToDistance(result.along);
    else if (result.action === 'reroute') reroute();
    // Only a new live position (or a new route) matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePos.version, corners]);
  useEffect(() => {
    if (realWalk && livePos.floorId) setViewFloorId(livePos.floorId);
  }, [realWalk, livePos.floorId]);

  // ---- Demo walker ----------------------------------------------------------------------------------------------
  const detourSteps = useRef(0);
  const stuckTicks = useRef(0);
  const lastDemoPoint = useRef<{ x: number; y: number } | null>(null);
  const expectedRef = useRef(expectedBearing);
  expectedRef.current = expectedBearing;
  const cornersRef = useRef(corners);
  cornersRef.current = corners;
  const routeMppRef = useRef(routeMpp);
  routeMppRef.current = routeMpp;
  useEffect(() => {
    if (!demoDrive || !realWalk || demoPaused || sim.finished) return;
    const timer = setInterval(() => {
      const live = latestLive.current.livePos;
      const route = cornersRef.current;
      const heading = expectedRef.current;
      if (heading === undefined || !live.point || route.length < 2) return;
      // A walker that cannot move (facing a wall at the end of a side corridor) is put back on the route.
      const last = lastDemoPoint.current;
      stuckTicks.current = last && Math.hypot(live.point.x - last.x, live.point.y - last.y) < 0.05 * (STRIDE_METERS / routeMppRef.current) ? stuckTicks.current + 1 : 0;
      lastDemoPoint.current = live.point;
      if (stuckTicks.current >= DEMO_STUCK_TICKS) {
        stuckTicks.current = 0;
        detourSteps.current = 0;
        const onRoute = projectOnPolyline(route, live.point);
        if (onRoute) live.snapTo(onRoute.point);
        return;
      }
      if (detourSteps.current > 0) {
        detourSteps.current -= 1;
        live.addSteps(1, (heading + 180) % 360);
        return;
      }
      // Walk towards the end of the current segment; a step that rounds a corner is split so the turn is taken
      // exactly at the corner (otherwise a walker facing straight on would pass a T-junction and look lost).
      const at = projectOnPolyline(route, live.point);
      const target = route[Math.min((at?.segment ?? 0) + 1, route.length - 1)];
      const after = route[(at?.segment ?? 0) + 2];
      const stepPx = STRIDE_METERS / routeMppRef.current;
      const toCorner = Math.hypot(target.x - live.point.x, target.y - live.point.y);
      if (!after || toCorner >= stepPx) {
        live.addSteps(1, bearing(live.point, target));
      } else {
        live.addSteps(toCorner / stepPx, bearing(live.point, target));
        live.addSteps(1 - toCorner / stepPx, bearing(target, after));
      }
    }, DEMO_STEP_MS / SIM_SPEEDS[speedIndex]);
    return () => clearInterval(timer);
  }, [demoDrive, realWalk, demoPaused, sim.finished, speedIndex]);
  // At a lift / stairs the demo person "taps" the floor they arrive on, like a real user would.
  const nextLegFloor = legs?.[legIndex + 1]?.floorId;
  const waitingForFloor = demoDrive && realWalk && sim.finished && !!nextLegFloor && plan?.steps[plan.steps.length - 1]?.kind === 'transfer';
  useEffect(() => {
    if (!waitingForFloor || !nextLegFloor) return;
    const id = setTimeout(() => latestLive.current.livePos.setFloor(nextLegFloor), DEMO_FLOOR_PAUSE_MS);
    return () => clearTimeout(id);
  }, [waitingForFloor, nextLegFloor]);
  const originNode = from && nodeById(from) ? from : defaultStartNodeId();
  const restartWalk = () => {
    sim.restart();
    setStartOverride(undefined);
    detourSteps.current = 0;
    if (realWalk && originNode) livePos.placeAt(originNode);
  };
  const toggleDemo = () => {
    const next = !demoDrive;
    setDemoDrive(next);
    setDemoPaused(false);
    setRealWalk(next);
    detourSteps.current = 0;
    if (!next) setStartOverride(undefined);
  };
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
    // With real walking the person says when they reached the next floor (floor buttons) instead of a timer.
    if (realWalk || !atTransfer || !legs || legIndex >= legs.length - 1) return;
    const id = setTimeout(() => setLegIndex((i) => i + 1), 2000);
    return () => clearTimeout(id);
  }, [atTransfer, legs, legIndex, realWalk]);

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

  // Position + heading: the live position when walking for real, otherwise the simulation; leg bounds still drive the camera.
  const livePoint = realWalk && livePos.point && livePos.floorId === routeFloor ? livePos.point : null;
  const position = livePoint ?? sim.position;
  const heading = realWalk && livePos.heading !== undefined ? livePos.heading : sim.heading;
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
      <LiveNotice />
      {evac && <ExitClaimer exitNodeId={evacExit?.nodeId} />}
      {realWalk && (livePos.stepSensor === 'denied' || livePos.stepSensor === 'unavailable') && (
        <View style={styles.sensorNote} pointerEvents="none">
          <Text style={styles.sensorNoteText}>{t(livePos.stepSensor === 'denied' ? 'walk.denied' : 'walk.unavailable')}</Text>
        </View>
      )}
      {realWalk && livePos.stepSensor === 'ready' && (livePos.compass === 'denied' || livePos.compass === 'unavailable') && (
        <View style={styles.sensorNote} pointerEvents="none">
          <Text style={styles.sensorNoteText}>{t('walk.noCompass')}</Text>
        </View>
      )}
      {demoDrive && (
        <View style={styles.sensorNote} pointerEvents="none">
          <Text style={styles.sensorNoteText}>{t('demo.badge')}</Text>
        </View>
      )}
      <RerouteBanner at={reroutedAt} />
      <TripTracker tripKey={routeKey(evac, from, destId, 0)} evac={evac} destId={destId} arrived={arrived && legIndex === (legs?.length ?? 1) - 1} />
      {!evac && <RoutePromo routeNodeIds={routeNodeIds} destStoreId={destId} from={startNodeId} />}
      <VoiceGuide
        speakKey={`${routeKey(evac, startNodeId, destId, legIndex)}:${current}:${arrived ? 'end' : 'go'}`}
        text={arrived ? (evac ? t('evac.safeTitle') : `${t('dir.arrived')}. ${destName}`) : `${stepHeadline(t, step)}. ${sub}`}
      />
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
            <Text style={styles.evacBannerText}>
              {t('evac.header')}
              {evacExit ? `
${t(evacExit.spreadOut ? 'evac.exitSpread' : 'evac.exitNearest', { name: evacExit.name, count: evacExit.others })}` : ''}
            </Text>
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
        {realWalk && <Text style={styles.floorTitle}>{t('walk.iAmOnFloor')}</Text>}
        <View style={styles.floorColumn}>
          {[...venue.floors].reverse().map((fl) => {
            const f = fl.id;
            const label = floorLabel(fl.id);
            const on = f === (realWalk ? (livePos.floorId ?? viewFloor) : viewFloor);
            return (
              <Pressable
                key={f}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t('map.floor', { floor: label })}
                onPress={() => {
                  // Height is manual: while walking for real, picking a floor also says "I am on this floor".
                  if (realWalk) livePos.setFloor(f);
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
            {nextStopId ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.replace({ pathname: '/directions', params: { to: nextStopId, from: destinationById(destId)?.nodeId ?? from, queue: restQueue.join(',') } })
                }
                style={[styles.arrivedBtn, styles.arrivedBtnPrimary]}>
                <Text style={styles.arrivedBtnPrimaryText}>{t('multi.next', { name: destinationById(nextStopId)?.name ?? '' })}</Text>
              </Pressable>
            ) : null}
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
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: realWalk }}
          accessibilityLabel={t('walk.real')}
          onPress={() => {
            setDemoDrive(false);
            setRealWalk((on) => (demoDrive ? true : !on));
          }}
          hitSlop={6}
          style={[styles.simBtn, realWalk && { backgroundColor: BLUE }]}>
          <MaterialIcons name="directions-walk" size={22} color={realWalk ? '#FFFFFF' : BLUE} />
        </Pressable>
        {realWalk && livePos.compass === 'ready' && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('walk.calibrate')} onPress={livePos.calibrate} hitSlop={6} style={styles.simBtn}>
            <MaterialIcons name="explore" size={22} color={BLUE} />
          </Pressable>
        )}
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: demoDrive }}
          accessibilityLabel={t('demo.toggle')}
          onPress={toggleDemo}
          hitSlop={6}
          style={[styles.simBtn, demoDrive && { backgroundColor: BLUE }]}>
          <MaterialIcons name="smart-display" size={22} color={demoDrive ? '#FFFFFF' : BLUE} />
        </Pressable>
        {demoDrive && !sim.finished && (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={demoPaused ? t('dir.resume') : t('dir.pause')} onPress={() => setDemoPaused((p) => !p)} hitSlop={6} style={styles.simBtn}>
              <MaterialIcons name={demoPaused ? 'play-arrow' : 'pause'} size={22} color={BLUE} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t('demo.detour')} onPress={() => {
                // Walk back at most 75% of the way already covered, so the presenter cannot go past the start of the route.
                const here = livePos.point ? projectOnPolyline(corners, livePos.point) : undefined;
                const covered = here ? Math.floor((here.along * routeMpp * 0.75) / STRIDE_METERS) : 0;
                detourSteps.current = Math.max(3, Math.min(DEMO_DETOUR_STEPS, covered));
                setDemoPaused(false);
              }} hitSlop={6} style={styles.simBtn}>
              <MaterialIcons name="u-turn-left" size={22} color={BLUE} />
            </Pressable>
          </>
        )}
        {realWalk && !demoDrive && !sim.finished && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('walk.tapSteps')} onPress={() => livePos.addSteps(TAP_STEPS, expectedBearing)} hitSlop={6} style={styles.simBtn}>
            <Text style={styles.speedText}>{`+${TAP_STEPS}`}</Text>
          </Pressable>
        )}
        {!realWalk && !sim.finished && (
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
          accessibilityLabel={t('route3d.open')}
          onPress={() => router.push({ pathname: '/route-3d' as never, params: { to: destId, from: startNodeId, mode } })}
          hitSlop={6}
          style={styles.simBtn}>
          <MaterialIcons name="layers" size={22} color={BLUE} />
        </Pressable>
        {(!realWalk || demoDrive) && !sim.finished && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('dir.speed', { speed: SIM_SPEEDS[speedIndex] })}
            onPress={() => setSpeedIndex((index) => (index + 1) % SIM_SPEEDS.length)}
            hitSlop={6}
            style={styles.simBtn}>
            <Text style={styles.speedText}>{`${SIM_SPEEDS[speedIndex]}×`}</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('dir.restart')}
          onPress={restartWalk}
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
  floorTitle: { alignSelf: 'center', fontSize: 10, fontWeight: '700', color: '#FFFFFF', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', marginBottom: 6, maxWidth: 70, textAlign: 'center' },
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
  sensorNote: { position: 'absolute', left: 16, right: 64, top: 112, zIndex: 25, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.78)' },
  sensorNoteText: { color: '#FFFFFF', fontSize: 12, lineHeight: 17 },
  speedText: { fontSize: 13, fontWeight: '800', color: BLUE },
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
