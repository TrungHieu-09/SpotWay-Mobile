import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, useWindowDimensions, Platform, Alert, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Circle } from 'react-native-svg';

import { AnimatedCircle, AnimatedPolyline, FloorCanvas, markerScale } from '@/components/floor-canvas';
import { EmptyState } from '@/components/empty-state';
import { poiIcon } from '@/data/venue/places';
import { tripFromRoute, tripMinutes } from '@/data/venue/plan';
import {
  computeRoute,
  defaultStartNodeId,
  floorById,
  floorLabel,
  loadVenue,
  nodeById,
  plainRoute,
  useVenue,
} from '@/data/venue/venue';
import { useAccessibilityMode } from '@/hooks/use-accessibility-mode';
import { useIncident } from '@/hooks/use-incident';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

import { useColors, type Colors } from '@/hooks/use-colors';
const DANGER = '#D64545';

// Bottom navigation bar: floating controls sit above it by this height plus the safe-area inset.
const TAB_BAR_HEIGHT = 56;
const FLOAT_GAP = 16;


/** Room reserved for the destination card under the top controls, so selecting a place never resizes the map. */
const DEST_CARD_HEIGHT = 66;
const ZOOM_BUTTON = 40;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

/** Quick "nearest ..." shortcuts: the icon a POI is drawn with decides which chip it belongs to. */
const NEAREST_CHIPS: {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  match: string[];
}[] = [
  { key: 'wc', icon: 'wc', match: ['wc_male', 'wc_female'] },
  { key: 'atm', icon: 'atm', match: ['atm'] },
  { key: 'elevator', icon: 'elevator', match: ['elevator'] },
];

const DASH = [8, 4, 2, 4];
const DASH_LENGTH = DASH.reduce((a, b) => a + b, 0);

export default function FloorMapScreen() {
  const colors = useColors();
  const { BLUE, INK, MUTED } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { from, dest, floor: floorParam, ts } = useLocalSearchParams<{
    from?: string;
    dest?: string;
    floor?: string;
    ts?: string;
  }>();

  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  const { floors, mapsByFloorId, destinations } = venue;

  // Where the user stands: a scanned QR node, otherwise the main door of the lowest floor.
  const startNodeId = useMemo(
    () => (from && nodeById(from) ? from : defaultStartNodeId()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, venue.status],
  );
  const startNode = startNodeId ? nodeById(startNodeId) : undefined;

  const [floorId, setFloorId] = useState<string | null>(floorParam ?? null);
  useEffect(() => {
    if (!floorId && startNode) setFloorId(startNode.floorId);
  }, [floorId, startNode]);
  const floorObj = floors.find((f) => f.id === floorId) ?? null;
  const floor = floorId ? floorLabel(floorId) : '';
  const map = floorId ? mapsByFloorId[floorId] : undefined;

  const [destId, setDestId] = useState<string | null>(dest ?? null);
  const [navigating, setNavigating] = useState(true);
  const [detailOpen, setDetailOpen] = useState(false);
  const [accessible] = useAccessibilityMode();
  const [incident] = useIncident();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const floatBottom = TAB_BAR_HEIGHT + insets.bottom + FLOAT_GAP;
  // The map sits between the measured top controls and the zoom buttons / tab bar.
  const [topControlsH, setTopControlsH] = useState(0);
  const [floorMenuOpen, setFloorMenuOpen] = useState(false);
  const [floorMenuPos, setFloorMenuPos] = useState({ top: 0, right: 16 });
  const floorBtnRef = useRef<React.ComponentRef<typeof View>>(null);
  const openFloorMenu = () => {
    floorBtnRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => {
      setFloorMenuPos({ top: y + h + 4, right: Math.max(8, windowWidth - (x + w)) });
      setFloorMenuOpen(true);
    });
  };
  const mapBottom = floatBottom + ZOOM_BUTTON + FLOAT_GAP;

  // A destination picked on the search screen replaces the current one.
  useEffect(() => {
    if (!dest) return;
    if (floorParam) setFloorId(floorParam);
    setDestId(dest);
    setNavigating(true);
  }, [dest, floorParam, ts]);

  const destination = useMemo(() => destinations.find((d) => d.id === destId) ?? null, [destinations, destId]);
  const store = destination;
  const changeFloor = (id: string) => {
    if (id === floorId) return;
    setFloorId(id);
  };

  // Route from the user to the picked place, computed on the phone by the routing engine.
  const result = useMemo(
    () =>
      startNodeId && destination
        ? computeRoute(startNodeId, destination.nodeId, { wheelchair: accessible })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startNodeId, destination, accessible, venue.fireNodeIds, venue.status],
  );
  const path = useMemo(
    () =>
      result?.route && destination
        ? tripFromRoute(result.route, destination.name, {
            evacuation: result.effectiveMode === 'EVACUATION',
            destinationCancelled: result.destinationCancelled,
            warningCode: result.warningCode,
          })
        : null,
    [result, destination],
  );
  const routePoints = useMemo(() => {
    if (!path || !floorId) return null;
    const pts = path.legs.filter((l) => l.floorId === floorId).flatMap((l) => l.corners);
    return pts.length > 1 ? pts.map((p) => `${p.x},${p.y}`).join(' ') : null;
  }, [path, floorId]);

  const meters = path ? Math.round(path.totalMeters) : 0;
  const minutes = path ? tripMinutes(path) : 0;

  const origin = startNode;
  // The "you are here" dot only shows on the floor of the start node.
  const onUserFloor = !!startNode && startNode.floorId === floorId;

  // The map starts right under the controls; the destination card pushes it down smoothly.
  const cardVisible = !!store && !!path;
  const topPad = useSharedValue(0);
  const mapTopTarget = topControlsH + 4 + (cardVisible ? DEST_CARD_HEIGHT + 8 : 0);
  useEffect(() => {
    topPad.value = withTiming(mapTopTarget, { duration: 200 });
  }, [mapTopTarget, topPad]);
  const areaStyle = useAnimatedStyle(() => ({ top: topPad.value }));

  // Blinking alert button while a simulated incident is on (static when motion is reduced).
  const reduceMotion = useReduceMotion();
  const alertBlink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!incident || reduceMotion) {
      alertBlink.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(alertBlink, { toValue: 0.4, duration: 450, useNativeDriver: true }),
        Animated.timing(alertBlink, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [incident, reduceMotion, alertBlink]);
  const [alertOpen, setAlertOpen] = useState(false);

  // Pulse ring around the current location.
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
  const flow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(flow, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [flow]);
  const dashOffset = flow.interpolate({ inputRange: [0, 1], outputRange: [0, -DASH_LENGTH * (floorObj ? markerScale(floorObj) : 1)] });
  const k = floorObj ? markerScale(floorObj) : 1;
  const pulseR = pulse.interpolate({ inputRange: [0, 1], outputRange: [6 * k, 22 * k] });
  const pulseOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  // Pan + pinch-to-zoom: the whole map layer is transformed on the UI thread.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const box = useSharedValue({ w: 0, h: 0 });

  const gesture = useMemo(() => {
    const clampPan = (v: number, size: number, s: number) => {
      'worklet';
      const max = (size * (s - 1)) / 2 + 60;
      return Math.min(max, Math.max(-max, v));
    };
    const pan = Gesture.Pan()
      .maxPointers(2)
      .onUpdate((e) => {
        tx.value = clampPan(savedTx.value + e.translationX, box.value.w, scale.value);
        ty.value = clampPan(savedTy.value + e.translationY, box.value.h, scale.value);
      })
      .onEnd(() => {
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, savedScale.value * e.scale));
        tx.value = clampPan(tx.value, box.value.w, scale.value);
        ty.value = clampPan(ty.value, box.value.h, scale.value);
      })
      .onEnd(() => {
        savedScale.value = scale.value;
        savedTx.value = tx.value;
        savedTy.value = ty.value;
      });
    return Gesture.Simultaneous(pan, pinch);
  }, [box, savedScale, savedTx, savedTy, scale, tx, ty]);

  const mapStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const zoomBy = (delta: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale.value + delta));
    scale.value = withTiming(next);
    savedScale.value = next;
    if (next === MIN_ZOOM) {
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      savedTx.value = 0;
      savedTy.value = 0;
    }
  };

  const openSearch = () => router.push({ pathname: '/search', params: { from } });
  // First tap selects a place as destination; tapping the selected place again opens its details.
  const onStorePress = (id: string) => {
    if (id === destId) {
      setDetailOpen(true);
      return;
    }
    setDestId(id);
    setNavigating(true);
  };
  // Start turn-by-turn guidance for the selected destination.
  const startGuidance = () => {
    if (!destId) return;
    setNavigating(true);
    router.push({ pathname: '/directions', params: { to: destId, from: startNodeId } });
  };
  const startFromDetail = () => {
    setDetailOpen(false);
    startGuidance();
  };
  const goNearest = (match: string[]) => {
    let best: { id: string; length: number } | null = null;
    if (startNodeId) {
      for (const d of destinations) {
        const poi = mapsByFloorId[d.floorId]?.pois.find((p) => p.id === d.id);
        const icon = poi ? poiIcon(poi) : null;
        if (!icon || !match.includes(icon)) continue;
        const route = plainRoute(startNodeId, d.nodeId, { wheelchair: accessible });
        if (route && (!best || route.totalDistance < best.length)) best = { id: d.id, length: route.totalDistance };
      }
    }
    if (!best) {
      const msg = t('map.nearest.notFound');
      if (Platform.OS === 'android') ToastAndroid.show(msg, ToastAndroid.SHORT);
      else Alert.alert(msg);
      return;
    }
    router.push({ pathname: '/directions', params: { to: best.id, from: startNodeId } });
  };
  const startEvacuation = () => {
    Alert.alert(t('evac.confirmTitle'), t('evac.confirmMsg'), [
      { text: t('evac.cancel'), style: 'cancel' },
      {
        text: t('evac.confirmGo'),
        style: 'destructive',
        onPress: () => router.push({ pathname: '/directions', params: { mode: 'evac', from: startNodeId } }),
      },
    ]);
  };
  const clearDestination = () => {
    setDestId(null);
    setNavigating(false);
    setDetailOpen(false);
  };

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Reanimated.View
          style={[styles.mapArea, { bottom: mapBottom }, areaStyle, mapStyle]}
          onLayout={(e) => {
            box.value = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
          }}>
        {floorObj ? (
          <FloorCanvas
            floor={floorObj}
            map={map}
            selectedPoiId={destId}
            onPoiPress={(poi) => onStorePress(poi.id)}
            fireNodeIds={incident && incident.floorId === floorObj.id ? [incident.nodeId] : []}>
            {navigating && routePoints && (
              <AnimatedPolyline
                points={routePoints}
                fill="none"
                stroke={BLUE}
                strokeWidth={3 * k}
                strokeDasharray={DASH.map((d) => d * k)}
                strokeDashoffset={dashOffset}
                strokeLinejoin="round"
              />
            )}
            {onUserFloor && origin && (
              <>
                <AnimatedCircle cx={origin.x} cy={origin.y} r={pulseR} fill={BLUE} opacity={pulseOpacity} />
                <Circle cx={origin.x} cy={origin.y} r={7 * k} fill={BLUE} stroke="#FFFFFF" strokeWidth={3 * k} />
              </>
            )}
          </FloorCanvas>
        ) : null}
        </Reanimated.View>
      </GestureDetector>

      <View
        style={[styles.overlay, { paddingTop: insets.top + 12 }]}
        pointerEvents="box-none"
        onLayout={(e) => setTopControlsH(e.nativeEvent.layout.height)}>
        {incident && (
          <Pressable
            accessibilityRole="alert"
            onPress={startEvacuation}
            style={styles.incidentBanner}>
            <MaterialIcons name="warning" size={22} color="#FFFFFF" />
            <View style={styles.incidentBody}>
              <Text style={styles.incidentText}>
                {t('evac.banner', {
                  type: t(`hazard.type.${incident.type}`),
                  floor: floorLabel(incident.floorId),
                  zone: incident.name,
                })}
              </Text>
              <Text style={styles.incidentCta}>{t('evac.bannerCta')}</Text>
            </View>
          </Pressable>
        )}
        <View style={styles.titleRow}>
          <Text style={styles.building} numberOfLines={1}>
            {venue.buildingName}
          </Text>
        </View>

        <View style={styles.searchRow}>
          <Pressable
            accessibilityRole="search"
            accessibilityLabel={t('map.searchPlaceholder')}
            onPress={openSearch}
            style={styles.searchBox}>
            <MaterialIcons name="search" size={18} color={MUTED} />
            <Text style={styles.searchText} numberOfLines={1}>
              {t('map.searchPlaceholder')}
            </Text>
          </Pressable>
          <Pressable
            ref={floorBtnRef}
            accessibilityRole="button"
            accessibilityLabel={t('map.floorPick', { floor })}
            accessibilityState={{ expanded: floorMenuOpen }}
            onPress={openFloorMenu}
            style={styles.floorBtn}>
            <Text style={styles.floorBtnText}>{t('map.floor', { floor })}</Text>
            <MaterialIcons name="keyboard-arrow-down" size={18} color={MUTED} />
            {incident && <View style={styles.floorDot} />}
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('evac.button')}
            onPress={startEvacuation}
            style={[styles.chip, styles.chipEvac]}>
            <MaterialIcons name="exit-to-app" size={16} color="#FFFFFF" />
            <Text style={[styles.chipText, styles.chipEvacText]} numberOfLines={1}>
              {t('evac.button')}
            </Text>
          </Pressable>
          {NEAREST_CHIPS.map((c) => (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              onPress={() => goNearest(c.match)}
              style={styles.chip}>
              <MaterialIcons name={c.icon} size={16} color={BLUE} />
              <Text style={styles.chipText} numberOfLines={1}>
                {t(`map.nearest.${c.key}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

      </View>

      <Modal visible={floorMenuOpen} transparent animationType="fade" onRequestClose={() => setFloorMenuOpen(false)}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('evac.cancel')}
          onPress={() => setFloorMenuOpen(false)}>
          <View style={[styles.floorMenu, { top: floorMenuPos.top, right: floorMenuPos.right }]}>
            <ScrollView>
            {floors.map((fl) => {
              const f = fl.id;
              const label = floorLabel(fl.id);
              const active = f === floorId;
              return (
                <Pressable
                  key={f}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('map.floor', { floor: label })}
                  onPress={() => {
                    setFloorMenuOpen(false);
                    changeFloor(f);
                  }}
                  style={[styles.floorMenuItem, active && styles.floorMenuItemActive]}>
                  <Text maxFontSizeMultiplier={1.15} style={[styles.floorMenuText, active && { color: BLUE }]}>{t('map.floor', { floor: label })}</Text>
                  {incident?.floorId === f && <View style={styles.floorMenuDot} />}
                  {active && <MaterialIcons name="check" size={16} color={BLUE} />}
                </Pressable>
              );
            })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <View style={[styles.cardSlot, { top: topControlsH + 4 }]} pointerEvents="box-none">
          {store && (path || !onUserFloor) && (
            <View style={styles.destCard}>
              <MaterialIcons name="alt-route" size={20} color={BLUE} />
              <View style={styles.destBody}>
                <Text style={styles.destName} numberOfLines={1}>
                  {store.name}
                </Text>
                {onUserFloor && (
                  <Text style={styles.destMeta}>{t('map.walkTime', { meters, minutes })}</Text>
                )}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('map.details')}
                hitSlop={8}
                onPress={() => setDetailOpen(true)}>
                <MaterialIcons name="info-outline" size={18} color={MUTED} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('map.cancelRoute')}
                hitSlop={8}
                onPress={clearDestination}>
                <MaterialIcons name="close" size={18} color={MUTED} />
              </Pressable>
            </View>
          )}
      </View>

      <Modal
        visible={detailOpen && !!store}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDetailOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            {store && floorById(store.floorId) && (
              <Text style={styles.modalCategory}>{t('map.floor', { floor: floorLabel(store.floorId) })}</Text>
            )}
            <Text style={styles.modalName}>{store?.name}</Text>
            <View style={styles.modalFooter}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('map.close')}
                hitSlop={8}
                onPress={() => setDetailOpen(false)}>
                <Text style={styles.modalClose}>{t('map.close')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  setDetailOpen(false);
                  if (store) {
                    router.push({ pathname: '/store', params: { id: store.id, from: startNodeId } });
                  }
                }}>
                <Text style={styles.modalLink}>{t('map.details')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('map.directions')}
                onPress={startFromDetail}
                style={styles.modalGo}>
                <MaterialIcons name="directions" size={24} color="#FFFFFF" />
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={[styles.tabBarWrap, { paddingBottom: insets.bottom }]}>
        <View style={styles.tabBar}>
          <View style={styles.tab}>
            <View style={styles.tabIndicator} />
            <MaterialIcons name="map" size={22} color={BLUE} />
            <Text style={[styles.tabText, styles.tabTextActive]}>{t('map.tab.map')}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={openSearch} style={styles.tab}>
            <MaterialIcons name="search" size={22} color={MUTED} />
            <Text style={styles.tabText}>{t('map.tab.search')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: accessible }}
            onPress={() => router.push('/accessibility')}
            style={[styles.tab, accessible && styles.tabAccessible]}>
            <MaterialIcons name="accessible" size={22} color={accessible ? BLUE : MUTED} />
            <Text style={[styles.tabText, accessible && { color: BLUE }]}>
              {t('map.tab.accessibility')}
            </Text>
          </Pressable>
        </View>
      </View>

      {incident && (
        <Animated.View style={[styles.alertWrap, { bottom: floatBottom, opacity: alertBlink }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('evac.alertButton')}
            onPress={() => setAlertOpen(true)}
            style={styles.alertBtn}>
            <MaterialIcons name="warning" size={22} color="#FFFFFF" />
          </Pressable>
        </Animated.View>
      )}

      <Modal visible={alertOpen && !!incident} transparent animationType="fade" onRequestClose={() => setAlertOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAlertOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={[styles.modalCategory, { color: DANGER }]}>{t('evac.alertTitle')}</Text>
            {incident && (
              <Text style={styles.modalName}>
                {t('evac.banner', {
                  type: t(`hazard.type.${incident.type}`),
                  floor: floorLabel(incident.floorId),
                  zone: incident.name,
                })}
              </Text>
            )}
            <View style={styles.modalFooter}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setAlertOpen(false)}>
                <Text style={styles.modalClose}>{t('map.close')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setAlertOpen(false);
                  router.push({ pathname: '/directions', params: { mode: 'evac', from: startNodeId } });
                }}
                style={styles.alertGo}>
                <Text style={styles.alertGoText}>{t('evac.nowBtn')}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {venue.status !== 'ready' && (
        <View style={styles.statusOverlay}>
          {venue.status === 'error' ? (
            <EmptyState
              icon="cloud-off"
              title={t('error.loadFailed')}
              message={venue.error}
              actionLabel={t('error.retry')}
              onAction={() => loadVenue(true)}
            />
          ) : (
            <ActivityIndicator size="large" color={BLUE} />
          )}
        </View>
      )}

      <View style={[styles.zoom, { bottom: floatBottom }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.zoomIn')}
          onPress={() => zoomBy(ZOOM_STEP)}
          style={styles.zoomBtn}>
          <MaterialIcons name="add" size={22} color={INK} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.zoomOut')}
          onPress={() => zoomBy(-ZOOM_STEP)}
          style={styles.zoomBtn}>
          <MaterialIcons name="remove" size={22} color={INK} />
        </Pressable>
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: '#14213D',
  shadowOpacity: 0.12,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 4,
} as const;

const makeStyles = ({ BLUE, INK, MUTED, BORDER, CANVAS, CARD, ACTIVE_BG, TINT }: Colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: CANVAS },
  statusOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: CANVAS },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  building: { flex: 1, fontSize: 14, fontWeight: '700', color: INK },
  floorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  floorBtnText: { fontSize: 13, fontWeight: '700', color: INK },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchBox: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchText: { flex: 1, fontSize: 13, color: MUTED },
  floorMenu: {
    position: 'absolute',
    width: 124,
    maxHeight: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  floorMenuItem: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  floorMenuItemActive: { backgroundColor: ACTIVE_BG },
  floorMenuText: { flex: 1, fontSize: 14, fontWeight: '600', color: INK },
  floorMenuDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: DANGER },
  alertWrap: { position: 'absolute', right: 116 },
  alertBtn: {
    width: ZOOM_BUTTON,
    height: ZOOM_BUTTON,
    borderRadius: ZOOM_BUTTON / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DANGER,
    ...shadow,
  },
  alertGo: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DANGER,
  },
  alertGoText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  mapArea: { position: 'absolute', left: 0, right: 0 },
  cardSlot: { position: 'absolute', left: 16, right: 16 },
  chipRow: { gap: 8, alignItems: 'center', paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: TINT,
    borderWidth: 1,
    borderColor: `${BLUE}55`,
  },
  chipEvac: { backgroundColor: DANGER, borderColor: DANGER },
  chipText: { fontSize: 12.5, fontWeight: '600', color: BLUE },
  chipEvacText: { fontWeight: '800', color: '#FFFFFF' },
  incidentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: DANGER,
    ...shadow,
  },
  incidentBody: { flex: 1, gap: 4 },
  incidentText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  incidentCta: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textDecorationLine: 'underline' },
  floorDot: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: DANGER,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  destCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: CARD,
    ...shadow,
  },
  destBody: { flex: 1 },
  destName: { fontSize: 15, fontWeight: '700', color: INK },
  destMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(20,33,61,0.4)',
  },
  modalCard: { padding: 20, borderRadius: 20, backgroundColor: CARD, ...shadow },
  modalCategory: { fontSize: 12, fontWeight: '700', color: BLUE, textTransform: 'uppercase' },
  modalName: { fontSize: 20, fontWeight: '800', color: INK, marginTop: 4 },
  modalDesc: { fontSize: 14, color: MUTED, marginTop: 6 },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalLink: { fontSize: 14, fontWeight: '700', color: BLUE },
  modalClose: { fontSize: 14, fontWeight: '600', color: MUTED },
  modalGo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BLUE,
  },
  zoom: { position: 'absolute', right: 16, flexDirection: 'row', gap: 8 },
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  tabBar: { flexDirection: 'row', height: TAB_BAR_HEIGHT },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 36,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: BLUE,
  },
  tabAccessible: {},
  tabText: { fontSize: 12, fontWeight: '700', color: MUTED },
  tabTextActive: { color: BLUE },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    ...shadow,
  },
});
