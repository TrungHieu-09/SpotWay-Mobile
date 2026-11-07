import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import type { StoreCategory } from '@/data/venue/places';
import { placesOf } from '@/data/venue/places';
import { loadVenue, useVenue } from '@/data/venue/venue';
import { useColors, type Colors } from '@/hooks/use-colors';

type Amenity = { key: string; icon: keyof typeof MaterialIcons.glyphMap; categories: StoreCategory[] };

const AMENITIES: Amenity[] = [
  { key: 'wc', icon: 'wc', categories: ['wc_male', 'wc_female'] },
  { key: 'elevator', icon: 'elevator', categories: ['elevator'] },
  { key: 'atm', icon: 'atm', categories: ['atm'] },
  { key: 'exit', icon: 'exit-to-app', categories: ['exit'] },
];

export default function BuildingScreen() {
  const colors = useColors();
  const { BLUE, INK } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { from, label } = useLocalSearchParams<{ from?: string; floor?: string; label?: string }>();
  const code = label ?? null;

  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);

  const { placeCount, amenityCounts } = useMemo(() => {
    const all = placesOf(venue);
    return {
      placeCount: all.length,
      amenityCounts: AMENITIES.map((a) => all.filter((p) => p.category !== 'poi' && a.categories.includes(p.category)).length),
    };
  }, [venue]);

  const rows = [
    { icon: 'layers' as const, label: t('building.floors'), value: t('building.floorsValue', { count: venue.floors.length }) },
    { icon: 'storefront' as const, label: t('building.stores'), value: t('building.storesValue', { count: placeCount }) },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.back')}
          hitSlop={8}
          onPress={() => router.replace('/scan')}
          style={styles.back}>
          <MaterialIcons name="arrow-back" size={24} color={INK} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('building.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.logo}>
            <MaterialIcons name="apartment" size={30} color="#FFFFFF" />
          </View>
          <Text style={styles.name}>{venue.buildingName}</Text>
          {code && (
            <View style={styles.codeChip}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
          )}
        </View>

        <View style={styles.group}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
              <MaterialIcons name={r.icon} size={22} color={BLUE} />
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue}>{r.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('building.amenities')}</Text>
        <View style={styles.amenityGrid}>
          {AMENITIES.map((a, i) => (
            <View key={a.key} style={styles.amenity}>
              <MaterialIcons name={a.icon} size={22} color={BLUE} />
              <Text style={styles.amenityCount}>{amenityCounts[i]}</Text>
              <Text style={styles.amenityLabel} numberOfLines={1}>
                {t(`map.category.${a.key}`)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace({ pathname: '/map', params: from ? { from } : {} })}
          style={styles.cta}>
          <Text style={styles.ctaText}>{t('building.enter')}</Text>
          <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.hint}>{t('building.hint')}</Text>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, CANVAS, CARD, TINT }: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: CANVAS },
    header: {
      height: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', paddingRight: 40, fontSize: 17, fontWeight: '700', color: INK },
    content: { padding: 16, gap: 16 },
    hero: { alignItems: 'center', gap: 10, paddingVertical: 12 },
    logo: {
      width: 64,
      height: 64,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#1C4E9C',
    },
    name: { fontSize: 24, fontWeight: '800', color: INK, textAlign: 'center' },
    codeChip: {
      paddingHorizontal: 12,
      height: 28,
      borderRadius: 14,
      justifyContent: 'center',
      backgroundColor: TINT,
    },
    codeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.8, color: BLUE },
    group: {
      borderRadius: 14,
      backgroundColor: CARD,
      borderWidth: 1,
      borderColor: BORDER,
      overflow: 'hidden',
    },
    row: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: BORDER,
    },
    rowLast: { borderBottomWidth: 0 },
    rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
    rowValue: { fontSize: 15, color: MUTED },
    sectionTitle: {
      marginBottom: -8,
      marginLeft: 4,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: MUTED,
    },
    amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    amenity: {
      flexGrow: 1,
      flexBasis: '22%',
      minWidth: 72,
      alignItems: 'center',
      gap: 4,
      paddingVertical: 12,
      paddingHorizontal: 6,
      borderRadius: 14,
      backgroundColor: CARD,
      borderWidth: 1,
      borderColor: BORDER,
    },
    amenityCount: { fontSize: 18, fontWeight: '800', color: INK },
    amenityLabel: { fontSize: 12, color: MUTED, textAlign: 'center' },
    footer: { paddingHorizontal: 16, paddingTop: 12, gap: 8, backgroundColor: CANVAS },
    cta: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      backgroundColor: '#1C4E9C',
    },
    ctaText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    hint: { fontSize: 12, color: MUTED, textAlign: 'center' },
  });
