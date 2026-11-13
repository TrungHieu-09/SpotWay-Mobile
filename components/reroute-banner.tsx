import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';

const VISIBLE_MS = 4500;

/** Brief "you went off route, path recalculated" message; `at` is the time of the last reroute (0 = never). */
export function RerouteBanner({ at }: { at: number }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [visibleFor, setVisibleFor] = useState(0);

  useEffect(() => {
    if (!at) return;
    setVisibleFor(at);
    const timer = setTimeout(() => setVisibleFor((current) => (current === at ? 0 : current)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [at]);

  if (!at || visibleFor !== at) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.wrap, { top: insets.top + 64 }]}>
      <View style={styles.card}>
        <MaterialIcons name="alt-route" size={20} color="#FFFFFF" />
        <Text style={styles.text}>{t('walk.rerouted')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 72, zIndex: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E8590C' },
  text: { flex: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
