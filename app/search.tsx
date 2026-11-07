import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/empty-state';
import { Text } from '@/components/scaled-text';
import { placesOf, type Place, type PlaceCategory, type StoreCategory } from '@/data/venue/places';
import { loadVenue, useVenue } from '@/data/venue/venue';
import { useColors, type Colors } from '@/hooks/use-colors';
import type { StoreRef } from '@/hooks/persisted-list';
import { useFavorites } from '@/hooks/use-favorites';
import { useRecent } from '@/hooks/use-recent';


type Group = 'all' | 'wc' | 'atm' | 'lift' | 'exit';

const GROUPS: Record<Group, StoreCategory[] | null> = {
  all: null,
  wc: ['wc_male', 'wc_female'],
  atm: ['atm'],
  lift: ['elevator', 'escalator'],
  exit: ['exit'],
};

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

export default function SearchScreen() {
  const colors = useColors();
  const { BLUE, INK, MUTED } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<Group>('all');
  const { recent, clearRecent } = useRecent();
  const { favorites } = useFavorites();

  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  const places = useMemo(() => placesOf(venue), [venue]);

  // Saved refs that no longer exist in the data are dropped.
  const resolve = (refs: StoreRef[]) =>
    refs.flatMap((r) => {
      const place = places.find((x) => x.id === r.id);
      return place ? [place] : [];
    });
  const recentItems = resolve(recent);
  const favoriteItems = resolve(favorites);
  const showSaved = query.trim() === '' && group === 'all';

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const allowed = GROUPS[group];
    return places
      .filter((p) => !allowed || (p.category !== 'poi' && allowed.includes(p.category)))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || t(`map.category.${p.category}`).toLowerCase().includes(q));
  }, [places, query, group, t]);

  const renderRow = (item: Place, key?: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      style={styles.row}
      onPress={() =>
        router.push({
          pathname: '/store',
          params: { id: item.id, from },
        })
      }>
      <View style={styles.rowIcon}>
        <MaterialIcons name={ICONS[item.category]} size={20} color={BLUE} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowText} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {t(`map.category.${item.category}`)}
        </Text>
      </View>
      <Text style={styles.rowFloor}>{t('map.floor', { floor: item.floor })}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.back')}
          hitSlop={8}
          onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={INK} />
        </Pressable>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={t('map.searchPlaceholder')}
          placeholderTextColor={MUTED}
          style={styles.input}
        />
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {(Object.keys(GROUPS) as Group[]).map((g) => {
            const active = g === group;
            return (
              <Pressable
                key={g}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setGroup(g)}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {t(`map.category.${g}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={results}
        keyExtractor={(s) => s.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={results.length === 0 ? { flexGrow: 1 } : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="search-off"
            title={query.trim() ? t('search.emptyQuery', { query: query.trim() }) : t('search.emptyGroup')}
            actionLabel={t('search.clearFilters')}
            onAction={() => {
              setQuery('');
              setGroup('all');
            }}
          />
        }
        ListHeaderComponent={
          showSaved && (recentItems.length > 0 || favoriteItems.length > 0) ? (
            <View>
              {recentItems.length > 0 && (
                <View>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>{t('search.recent')}</Text>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={clearRecent}>
                      <Text style={styles.sectionAction}>{t('search.clearRecent')}</Text>
                    </Pressable>
                  </View>
                  {recentItems.map((s) => renderRow(s, `r:${s.id}`))}
                </View>
              )}
              {favoriteItems.length > 0 && (
                <View>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>{t('search.favorites')}</Text>
                  </View>
                  {favoriteItems.map((s) => renderRow(s, `f:${s.id}`))}
                </View>
              )}
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>{t('search.allStores')}</Text>
              </View>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => renderRow(item)}
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, ACTIVE_BG, CANVAS, CARD }: Colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: CANVAS },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  input: { flex: 1, height: 40, fontSize: 15, color: INK },
  chipsWrap: { borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 10 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    justifyContent: 'center',
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { fontSize: 13, fontWeight: '600', color: INK },
  chipTextActive: { color: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACTIVE_BG,
  },
  rowBody: { flex: 1 },
  rowText: { fontSize: 15, fontWeight: '600', color: INK },
  rowMeta: { fontSize: 13, color: MUTED, marginTop: 2 },
  rowFloor: { fontSize: 13, color: MUTED },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: MUTED },
  sectionAction: { fontSize: 13, fontWeight: '600', color: BLUE },
  empty: { padding: 24, textAlign: 'center', color: MUTED },
});
