import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Text } from '@/components/scaled-text';
import { placesOf, type PlaceCategory } from '@/data/venue/places';
import { defaultStartNodeId, loadVenue, nodeById, plainRoute, useVenue } from '@/data/venue/venue';

import { useColors, type Colors } from '@/hooks/use-colors';
import { useFavorites } from '@/hooks/use-favorites';
import { addRecent } from '@/hooks/use-recent';
const ICONS: Record<PlaceCategory, keyof typeof MaterialIcons.glyphMap> = {
  poi: 'place',
  fashion: 'checkroom',
  coffee: 'local-cafe',
  books: 'menu-book',
  food: 'restaurant',
  wc_male: 'wc',
  wc_female: 'wc',
  elevator: 'elevator',
  escalator: 'stairs',
  atm: 'atm',
  electronics: 'smartphone',
  beauty: 'spa',
  supermarket: 'shopping-cart',
  pharmacy: 'local-pharmacy',
  exit: 'exit-to-app',
  rest: 'event-seat',
};

export default function StoreDetailScreen() {
  const colors = useColors();
  const { BLUE, INK, MUTED } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, from } = useLocalSearchParams<{
    id?: string;
    from?: string;
  }>();

  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  const store = useMemo(() => placesOf(venue).find((p) => p.id === id) ?? null, [venue, id]);
  const floor = store?.floor ?? '';
  const meters = useMemo(() => {
    const start = from && nodeById(from) ? from : defaultStartNodeId();
    if (!store || !start) return null;
    const route = plainRoute(start, store.nodeId);
    return route ? Math.round(route.totalDistance) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, from, venue.status]);

  const { isFavorite, toggleFavorite } = useFavorites();
  const storeId = store?.id;
  const storeFloorId = store?.floorId;
  useEffect(() => {
    if (storeId && storeFloorId) addRecent({ id: storeId, floor: storeFloorId });
  }, [storeId, storeFloorId]);

  const goBack = () => router.back();

  if (!store) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} onPress={goBack} style={styles.backFlat} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={INK} />
        </Pressable>
        <EmptyState
          icon="storefront"
          title={t('store.notFound')}
          actionLabel={t('error.backToMap')}
          onAction={() => router.dismissTo({ pathname: '/map', params: { from } })}
        />
      </SafeAreaView>
    );
  }

  const icon = ICONS[store.category];
  const fav = isFavorite({ id: store.id, floor: store.floorId });
  const category = t(`map.category.${store.category}`);
  const meta = [
    category,
    t('map.floor', { floor }),
    meters !== null ? `${meters}m` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <View style={styles.hero}>
          <MaterialIcons name={icon} size={120} color="rgba(255,255,255,0.16)" />
          <View style={styles.heroShade} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scan.back')}
            onPress={goBack}
            style={[styles.back, { top: insets.top + 12 }]}>
            <MaterialIcons name="arrow-back" size={22} color={INK} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(fav ? 'store.favoriteRemove' : 'store.favoriteAdd')}
            accessibilityState={{ selected: fav }}
            onPress={() => toggleFavorite({ id: store.id, floor: store.floorId })}
            style={[styles.back, styles.heart, { top: insets.top + 12 }]}>
            <MaterialIcons name={fav ? 'favorite' : 'favorite-border'} size={22} color={fav ? '#D64545' : INK} />
          </Pressable>
        </View>

        <View style={styles.logoWrap}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner}>
              <MaterialIcons name={icon} size={28} color={BLUE} />
            </View>
          </View>
        </View>

        <View style={styles.block}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {store.name}
            </Text>
          </View>
          <Text style={styles.meta}>{meta}</Text>
        </View>

        <View style={[styles.block, styles.grid]}>
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <MaterialIcons name="layers" size={17} color={MUTED} />
              <Text style={styles.cardLabel}>{t('map.floor', { floor: '' }).trim()}</Text>
            </View>
            <Text style={styles.cardValue}>{floor}</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.cardLabelRow}>
              <MaterialIcons name="category" size={17} color={MUTED} />
              <Text style={styles.cardLabel}>{t('store.type')}</Text>
            </View>
            <Text style={styles.cardValue}>{category}</Text>
          </View>
        </View>

      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.dismissTo({
              pathname: '/map',
              params: { from, dest: store.id, floor: store.floorId, ts: String(Date.now()) },
            })
          }
          style={styles.cta}>
          <MaterialIcons name="near-me" size={22} color="#FFFFFF" />
          <Text style={styles.ctaText}>{t('store.startDirections')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, BG, CARD, SURFACE, OPEN_BG, OPEN_FG }: Colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  hero: {
    height: 275,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroShade: {
    ...StyleSheet.absoluteFill,
    top: '55%',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  back: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  heart: { left: undefined, right: 16 },
  backFlat: { padding: 16 },
  logoWrap: { paddingHorizontal: 24 },
  logoOuter: {
    marginTop: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    padding: 2,
    backgroundColor: CARD,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  logoInner: {
    flex: 1,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE,
  },
  block: { paddingHorizontal: 24, marginTop: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: INK },
  openBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: OPEN_BG,
  },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3C5D9D' },
  openText: { fontSize: 11, fontWeight: '800', color: OPEN_FG },
  meta: { fontSize: 14, color: '#434751', marginTop: 6 },
  grid: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: SURFACE },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  cardLabel: { fontSize: 11, fontWeight: '800', color: '#434751' },
  cardValue: { fontSize: 16, fontWeight: '800', color: INK },
  desc: { fontSize: 14, lineHeight: 22, color: '#434751' },
  empty: { padding: 24, textAlign: 'center', color: MUTED },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  cta: {
    height: 56,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BLUE,
  },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
