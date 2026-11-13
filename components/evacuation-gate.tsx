import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { getVenue, useVenue } from '@/data/venue/venue';
import { useLiveVenue } from '@/hooks/use-live-venue';

const DANGER = '#B3261E';
const VIBRATION = [0, 600, 250, 600, 250, 600];

/**
 * Keeps the app in sync with the building (polling) and, the moment the staff raise a fire alarm, takes over the screen
 * with an evacuation prompt wherever the user is. Dismissing it leaves the banner on the map.
 */
export function EvacuationGate() {
  useLiveVenue();
  const { t } = useTranslation();
  const router = useRouter();
  const incident = useVenue().remoteIncident;
  const [dismissedId, setDismissedId] = useState<string>();

  useEffect(() => {
    if (incident && incident.id !== dismissedId) Vibration.vibrate(VIBRATION);
    return () => Vibration.cancel();
  }, [incident, dismissedId]);

  const styles = useMemo(() => makeStyles(), []);
  if (!incident) return null;

  const evacuate = () => {
    setDismissedId(incident.id);
    router.push({ pathname: '/directions', params: { mode: 'evac', from: getVenue().userNodeId } });
  };

  return (
    <Modal visible={incident.id !== dismissedId} animationType="fade" statusBarTranslucent onRequestClose={() => setDismissedId(incident.id)}>
      <SafeAreaView style={styles.root} accessibilityViewIsModal>
        <View style={styles.body} accessibilityRole="alert" accessibilityLiveRegion="assertive">
          <MaterialIcons name="local-fire-department" size={96} color="#FFFFFF" />
          <Text style={styles.title}>{t('evac.gateTitle')}</Text>
          <Text style={styles.message}>{incident.message ?? t('evac.gateBody')}</Text>
          <Text style={styles.hint}>{t('evac.gateHint')}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={evacuate} style={styles.primary}>
            <MaterialIcons name="exit-to-app" size={24} color={DANGER} />
            <Text style={styles.primaryText}>{t('evac.nowBtn')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setDismissedId(incident.id)} style={styles.secondary}>
            <Text style={styles.secondaryText}>{t('evac.gateDismiss')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: DANGER, padding: 24 },
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    title: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', textAlign: 'center' },
    message: { color: '#FFFFFF', fontSize: 18, textAlign: 'center', lineHeight: 26 },
    hint: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
    actions: { gap: 12 },
    primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFFFFF', borderRadius: 16, paddingVertical: 18 },
    primaryText: { color: DANGER, fontSize: 18, fontWeight: '800' },
    secondary: { alignItems: 'center', paddingVertical: 14 },
    secondaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  });
