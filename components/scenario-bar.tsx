import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { announce, useVenue, type Scenario } from '@/data/venue/venue';

const ICON: Record<Scenario['kind'], keyof typeof MaterialIcons.glyphMap> = { elevator: 'elevator', power: 'power-off', zone: 'block' };
const ANNOUNCEMENT_MS = 15_000;

/**
 * Compact pills at the top of every screen: the closures in force (lift out of service, power cut, zone closed) and the
 * latest message of the building. They sit in the status-bar gap so they never cover a screen's own controls.
 */
export function ScenarioBar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { scenarios, announcement } = useVenue();
  const [hiddenId, setHiddenId] = useState<number>();

  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => announce(undefined), ANNOUNCEMENT_MS);
    return () => clearTimeout(timer);
  }, [announcement]);

  const showAnnouncement = announcement && hiddenId !== announcement.id;
  if (scenarios.length === 0 && !showAnnouncement) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: Math.max(insets.top - 22, 2) }]}>
      {showAnnouncement ? (
        <Pressable accessibilityRole="alert" onPress={() => setHiddenId(announcement.id)} style={[styles.pill, styles.info]}>
          <MaterialIcons name="campaign" size={16} color="#FFFFFF" />
          <Text style={styles.text} numberOfLines={2}>
            {announcement.text}
          </Text>
        </Pressable>
      ) : null}
      {scenarios.map((s) => (
        <View key={s.kind} accessibilityRole="alert" style={[styles.pill, styles.warn]}>
          <MaterialIcons name={ICON[s.kind]} size={16} color="#FFFFFF" />
          <Text style={styles.text} numberOfLines={1}>
            {t(`scenario.${s.kind}`, { zone: s.zoneName ?? '' })}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, zIndex: 100, alignItems: 'center', gap: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '92%', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  warn: { backgroundColor: '#C2410C' },
  info: { backgroundColor: '#1C4E9C' },
  text: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
