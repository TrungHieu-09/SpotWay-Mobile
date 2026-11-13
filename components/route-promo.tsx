import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { promotionsAlong, useVenue } from '@/data/venue/venue';

type Props = { routeNodeIds: string[] | null; destStoreId?: string; from?: string };

/** "Offer near you": the closest store with a running promotion along the route. Tap opens the store. */
export function RoutePromo({ routeNodeIds, destStoreId, from }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const venue = useVenue();
  const [closed, setClosed] = useState<string>();
  const promo = useMemo(
    () => (routeNodeIds ? promotionsAlong(routeNodeIds, destStoreId)[0] : undefined),
    // venue.promotions drives the memo: promotionsAlong reads the venue store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeNodeIds, destStoreId, venue.promotions, venue.mapsByFloorId],
  );
  if (!promo || closed === promo.id) return null;

  return (
    <View style={[styles.wrap, { top: insets.top + 64 }]} pointerEvents="box-none">
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/store', params: { id: promo.storeId, from } })}
        style={styles.card}>
        <MaterialIcons name="local-offer" size={22} color="#FFFFFF" />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {t('promo.near', { store: promo.storeName })}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {promo.title} · {t('promo.meters', { count: promo.meters })}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t('promo.close')} hitSlop={10} onPress={() => setClosed(promo.id)}>
          <MaterialIcons name="close" size={20} color="#FFFFFF" />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 20 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#E8590C', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  body: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.92)', fontSize: 13 },
});
