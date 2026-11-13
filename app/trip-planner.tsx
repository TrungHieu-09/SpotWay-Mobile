import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { planMultiStop } from '@/data/venue/multistop';
import { placesOf, type Place } from '@/data/venue/places';
import { defaultStartNodeId, destinationById, loadVenue, nodeById, trackEvent, useVenue } from '@/data/venue/venue';
import { useAccessibilityMode } from '@/hooks/use-accessibility-mode';
import { useColors, type Colors } from '@/hooks/use-colors';

const MAX_STOPS = 6;
/** Walking speed used for the time estimate (m/s). */
const WALK_MPS = 1.2;

export default function TripPlannerScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const venue = useVenue();
  const [accessible] = useAccessibilityMode();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    loadVenue();
  }, []);

  const startNodeId = useMemo(
    () => (from && nodeById(from) ? from : defaultStartNodeId()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, venue.status],
  );

  const places = useMemo(() => placesOf(venue).filter((p) => p.category !== 'exit'), [venue]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return places.filter((p) => !q || p.name.toLowerCase().includes(q));
  }, [places, query]);

  const plan = useMemo(
    () => (startNodeId && picked.length > 0 ? planMultiStop(startNodeId, picked, { wheelchair: accessible }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startNodeId, picked, accessible, venue.blockedEdgeIds, venue.status],
  );

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : current.length >= MAX_STOPS ? current : [...current, id]));

  const start = () => {
    if (!plan) return;
    const [first, ...rest] = plan.order;
    trackEvent('ROUTE_STARTED', { targetId: first });
    router.push({ pathname: '/directions', params: { to: first, from: startNodeId, queue: rest.join(',') } });
  };

  const saved = plan && plan.naiveMeters > plan.totalMeters ? plan.naiveMeters - plan.totalMeters : 0;
  const minutes = plan ? Math.max(1, Math.round(plan.totalMeters / WALK_MPS / 60)) : 0;

  const renderPlace = ({ item }: { item: Place }) => {
    const on = picked.includes(item.id);
    return (
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(item.id)} style={[styles.row, on && styles.rowOn]}>
        <MaterialIcons name={on ? 'check-box' : 'check-box-outline-blank'} size={22} color={on ? colors.BLUE : colors.MUTED} />
        <View style={styles.rowBody}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowSub}>{t('map.floor', { floor: item.floor })}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.INK} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('multi.title')}</Text>
          <Text style={styles.sub}>{t('multi.subtitle', { max: MAX_STOPS })}</Text>
        </View>
      </View>

      <View style={styles.searchBox}>
        <MaterialIcons name="search" size={18} color={colors.MUTED} />
        <TextInput value={query} onChangeText={setQuery} placeholder={t('map.searchPlaceholder')} placeholderTextColor={colors.MUTED} style={styles.input} />
      </View>

      <FlatList data={results} keyExtractor={(p) => p.id} renderItem={renderPlace} contentContainerStyle={{ paddingBottom: 260 + insets.bottom }} keyboardShouldPersistTaps="handled" />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {plan ? (
          <>
            <Text style={styles.sheetTitle}>
              {t('multi.summary', { meters: plan.totalMeters, minutes })}
            </Text>
            {saved > 0 ? <Text style={styles.saved}>{t('multi.saved', { meters: saved })}</Text> : null}
            {plan.order.map((id, index) => (
              <View key={id} style={styles.orderRow}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{index + 1}</Text>
                </View>
                <Text style={styles.orderName} numberOfLines={1}>
                  {destinationById(id)?.name}
                </Text>
                <Text style={styles.orderMeters}>{t('multi.meters', { count: plan.legMeters[index] })}</Text>
              </View>
            ))}
            {plan.unreachable.length > 0 ? <Text style={styles.warn}>{t('multi.unreachable', { count: plan.unreachable.length })}</Text> : null}
            <Pressable accessibilityRole="button" onPress={start} style={styles.cta}>
              <MaterialIcons name="near-me" size={22} color="#FFFFFF" />
              <Text style={styles.ctaText}>{t('multi.start')}</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.hint}>{t(picked.length ? 'multi.noRoute' : 'multi.hint')}</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, BG, CARD, SURFACE, ACTIVE_BG }: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '800', color: INK },
    sub: { fontSize: 13, color: MUTED },
    searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: SURFACE },
    input: { flex: 1, height: 44, color: INK, fontSize: 15 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
    rowOn: { backgroundColor: ACTIVE_BG },
    rowBody: { flex: 1 },
    rowName: { fontSize: 15, fontWeight: '600', color: INK },
    rowSub: { fontSize: 12, color: MUTED },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 8, backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: BORDER },
    sheetTitle: { fontSize: 16, fontWeight: '800', color: INK },
    saved: { fontSize: 13, fontWeight: '700', color: '#2E9E5B' },
    orderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE },
    badgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
    orderName: { flex: 1, fontSize: 14, color: INK },
    orderMeters: { fontSize: 12, color: MUTED },
    warn: { fontSize: 12, color: '#B3261E' },
    hint: { fontSize: 14, color: MUTED, textAlign: 'center', paddingVertical: 8 },
    cta: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, borderRadius: 14, backgroundColor: BLUE },
    ctaText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  });
