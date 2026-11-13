import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Text } from '@/components/scaled-text';
import { floorLabel, loadVenue, refreshPromotions, useVenue } from '@/data/venue/venue';
import { useColors, type Colors } from '@/hooks/use-colors';

export default function OffersScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const venue = useVenue();
  const [floor, setFloor] = useState<string | null>(null);

  useEffect(() => {
    loadVenue();
    void refreshPromotions();
  }, []);

  const floorsWithOffers = useMemo(() => [...new Set(venue.promotions.map((p) => p.floorId))], [venue.promotions]);
  const list = useMemo(() => venue.promotions.filter((p) => !floor || p.floorId === floor), [venue.promotions, floor]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.INK} />
        </Pressable>
        <Text style={styles.title}>{t('offers.title')}</Text>
      </View>

      {floorsWithOffers.length > 1 ? (
        <View style={styles.chips}>
          {[null, ...floorsWithOffers].map((id) => (
            <Pressable key={id ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: floor === id }} onPress={() => setFloor(id)} style={[styles.chip, floor === id && styles.chipOn]}>
              <Text style={[styles.chipText, floor === id && styles.chipTextOn]}>{id ? t('map.floor', { floor: floorLabel(id) }) : t('search.allStores')}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={<EmptyState icon="local-offer" title={t('offers.empty')} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.store}>{item.storeName}</Text>
            <Text style={styles.promo}>{item.title}</Text>
            {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
            <Text style={styles.meta}>
              {t('map.floor', { floor: floorLabel(item.floorId) })} · {t('store.promoUntil', { date: new Date(item.endAt).toLocaleDateString() })}
            </Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/store', params: { id: item.storeId, from } })} style={styles.secondary}>
                <Text style={styles.secondaryText}>{t('offers.viewStore')}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/directions', params: { to: item.storeId, from } })} style={styles.primary}>
                <MaterialIcons name="near-me" size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>{t('offers.go')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, BG, CARD, SURFACE, OPEN_BG, OPEN_FG }: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    title: { fontSize: 20, fontWeight: '800', color: INK },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: SURFACE },
    chipOn: { backgroundColor: BLUE },
    chipText: { fontSize: 13, fontWeight: '600', color: INK },
    chipTextOn: { color: '#FFFFFF' },
    card: { padding: 16, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, gap: 4 },
    store: { fontSize: 13, fontWeight: '700', color: MUTED },
    promo: { fontSize: 18, fontWeight: '800', color: OPEN_FG, backgroundColor: OPEN_BG, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: 'hidden' },
    desc: { fontSize: 14, color: MUTED, marginTop: 4 },
    meta: { fontSize: 12, color: MUTED, marginTop: 4 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
    primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 20, backgroundColor: BLUE },
    primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
    secondary: { paddingHorizontal: 16, height: 40, borderRadius: 20, borderWidth: 1, borderColor: BLUE, alignItems: 'center', justifyContent: 'center' },
    secondaryText: { color: BLUE, fontWeight: '700', fontSize: 14 },
  });
