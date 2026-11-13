import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/scaled-text';
import { useColors, type Colors } from '@/hooks/use-colors';
import { useVenue } from '@/data/venue/venue';

const VISIBLE_MS = 6000;

/** Short banner shown when the building staff block or re-open a path while the user is on the map. */
export function LiveNotice() {
  const { t } = useTranslation();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const notice = useVenue().notice;
  const [shownId, setShownId] = useState<number>();

  useEffect(() => {
    if (!notice) return;
    setShownId(notice.id);
    const timer = setTimeout(() => setShownId((current) => (current === notice.id ? undefined : current)), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice || shownId !== notice.id) return null;
  const blocked = notice.kind === 'blocked';
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View style={[styles.card, blocked && styles.cardBlocked]}>
        <MaterialIcons name={blocked ? 'warning' : 'check-circle'} size={20} color={blocked ? '#B3261E' : colors.BLUE} />
        <Text style={styles.text}>{t(blocked ? 'live.blocked' : 'live.reopened')}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50, alignItems: 'center' },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: c.CARD,
      borderWidth: 1,
      borderColor: c.BORDER,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    cardBlocked: { backgroundColor: c.EVAC_BG, borderColor: '#B3261E' },
    text: { flexShrink: 1, color: c.INK, fontSize: 14, fontWeight: '600' },
  });
