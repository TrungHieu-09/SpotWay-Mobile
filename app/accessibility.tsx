import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { floorLabel, loadVenue, useVenue } from '@/data/venue/venue';
import {
  useAccessibilityMode,
  useHighContrast,
  useTextSize,
  useThemeMode,
  type TextSize,
  type ThemeMode,
} from '@/hooks/use-accessibility-mode';
import { useIncident } from '@/hooks/use-incident';

import { useColors, type Colors } from '@/hooks/use-colors';
const DANGER = '#D64545';
const HAZARD_TYPES = ['fire', 'maintenance'] as const;

const TEXT_SIZES: TextSize[] = ['small', 'medium', 'large'];
const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export default function AccessibilityScreen() {
  const colors = useColors();
  const { BLUE, INK, MUTED } = colors;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const [enabled, setEnabled] = useAccessibilityMode();
  const [incident, setIncident] = useIncident();
  const [demoOpen, setDemoOpen] = useState(false);
  const venue = useVenue();
  useEffect(() => {
    loadVenue();
  }, []);
  // The simulated incident is anchored at a point (POI) of the real building.
  const [draft, setDraft] = useState<{ floorId?: string; nodeId?: string; name?: string; type: 'fire' | 'maintenance' }>(
    incident ?? { type: 'fire' },
  );
  const draftFloorId = draft.floorId ?? venue.floors[venue.floors.length - 1]?.id ?? '';
  const draftPois = venue.mapsByFloorId[draftFloorId]?.pois ?? [];
  const startDemo = () => {
    const poi = draftPois.find((p) => p.nodeId === draft.nodeId) ?? draftPois[0];
    if (!poi) return;
    setIncident({ floorId: draftFloorId, nodeId: poi.nodeId, name: poi.name, type: draft.type });
    setDemoOpen(false);
  };
  const [textSize, setTextSize] = useTextSize();
  const [highContrast, setHighContrast] = useHighContrast();
  const [themeMode, setThemeMode] = useThemeMode();

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('scan.back')}
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.back}>
          <MaterialIcons name="arrow-back-ios-new" size={22} color={INK} />
        </Pressable>
        <Text style={styles.title}>{t('access.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{t('access.sec.access')}</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <MaterialIcons name="accessible" size={22} color={BLUE} />
            <Text style={styles.rowText}>{t('access.priority')}</Text>
            <Switch
              accessibilityLabel={t('access.priority')}
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: '#CBD5E1', true: BLUE }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <MaterialIcons name="contrast" size={22} color={BLUE} />
            <Text style={styles.rowText}>{t('access.highContrast')}</Text>
            <Switch
              accessibilityLabel={t('access.highContrast')}
              value={highContrast}
              onValueChange={setHighContrast}
              trackColor={{ false: '#CBD5E1', true: BLUE }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
        <Text style={styles.groupDesc}>{t('access.groupDesc')}</Text>

        <Text style={styles.sectionTitle}>{t('access.sec.display')}</Text>
        <View style={styles.group}>
          <View style={[styles.row, styles.rowWrap]}>
            <Text style={[styles.rowText, styles.rowLabelWrap]}>{t('access.textSize')}</Text>
            <View style={styles.seg}>
              {TEXT_SIZES.map((size) => (
                <Pressable
                  key={size}
                  accessibilityRole="button"
                  accessibilityState={{ selected: textSize === size }}
                  onPress={() => setTextSize(size)}
                  style={[styles.segBtn, textSize === size && styles.segBtnOn]}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.segText, textSize === size && { color: '#FFFFFF' }]}>
                    {t(`access.size.${size}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={[styles.row, styles.rowWrap, styles.rowLast]}>
            <Text style={[styles.rowText, styles.rowLabelWrap]}>{t('access.theme')}</Text>
            <View style={styles.seg}>
              {THEME_MODES.map((mode) => (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: themeMode === mode }}
                  onPress={() => setThemeMode(mode)}
                  style={[styles.segBtn, themeMode === mode && styles.segBtnOn]}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.segText, themeMode === mode && { color: '#FFFFFF' }]}>
                    {t(`access.theme.${mode}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.sectionGap} />
        <Text style={styles.sectionTitle}>{t('access.sec.demo')}</Text>
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('evac.demoOpen')}
            onPress={() => setDemoOpen(true)}
            style={[styles.row, styles.rowLast]}>
            <MaterialIcons name="warning-amber" size={22} color={DANGER} />
            <Text style={styles.rowText}>{t('access.demoRow')}</Text>
            <MaterialIcons name="chevron-right" size={22} color={MUTED} />
          </Pressable>
        </View>
        {incident && (
          <Text style={[styles.groupDesc, { color: DANGER }]}>
            {t('evac.banner', {
              type: t(`hazard.type.${incident.type}`),
              floor: floorLabel(incident.floorId),
              zone: incident.name,
            })}
          </Text>
        )}

        <Modal visible={demoOpen} transparent animationType="fade" onRequestClose={() => setDemoOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setDemoOpen(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <Text style={styles.demoTitle}>{t('evac.demoTitle')}</Text>
              <Text style={styles.desc}>{t('evac.demoDesc')}</Text>

              <Text style={styles.modalLabel}>{t('evac.demoFloor')}</Text>
              <View style={styles.demoFloors}>
                {venue.floors.map((fl) => (
              <Pressable
                key={fl.id}
                accessibilityRole="button"
                accessibilityState={{ selected: draftFloorId === fl.id }}
                onPress={() => setDraft({ ...draft, floorId: fl.id, nodeId: undefined, name: undefined })}
                style={[styles.demoFloor, draftFloorId === fl.id && styles.demoFloorOn]}>
                <Text style={[styles.demoFloorText, draftFloorId === fl.id && { color: '#FFFFFF' }]}>{fl.floorNumber}</Text>
              </Pressable>
                ))}
              </View>

              <Text style={styles.modalLabel}>{t('evac.demoZone')}</Text>
              <View style={styles.demoFloors}>
                {draftPois.map((poi) => {
                  const on = (draft.nodeId ?? draftPois[0]?.nodeId) === poi.nodeId;
                  return (
              <Pressable
                key={poi.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setDraft({ ...draft, floorId: draftFloorId, nodeId: poi.nodeId, name: poi.name })}
                style={[styles.demoFloor, on && styles.demoFloorOn]}>
                <Text style={[styles.demoFloorText, on && { color: '#FFFFFF' }]}>{poi.name}</Text>
              </Pressable>
                  );
                })}
              </View>

              <Text style={styles.modalLabel}>{t('evac.demoType')}</Text>
              <View style={styles.demoFloors}>
                {HAZARD_TYPES.map((ty) => (
              <Pressable
                key={ty}
                accessibilityRole="button"
                accessibilityState={{ selected: draft.type === ty }}
                onPress={() => setDraft({ ...draft, type: ty })}
                style={[styles.demoFloor, draft.type === ty && styles.demoFloorOn]}>
                <Text style={[styles.demoFloorText, draft.type === ty && { color: '#FFFFFF' }]}>{t(`hazard.type.${ty}`)}</Text>
              </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setIncident(null);
                    setDemoOpen(false);
                  }}>
                  <Text style={styles.demoOff}>{t('evac.demoOff')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={startDemo}
                  style={styles.demoBtn}>
                  <Text style={styles.demoBtnText}>{t('evac.demoOn')}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, TINT, BG, CARD }: Colors) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    paddingRight: 40,
    fontSize: 17,
    fontWeight: '700',
    color: INK,
  },
  content: { padding: 16, paddingBottom: 24 },
  sectionTitle: {
    marginBottom: 6,
    marginLeft: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: MUTED,
  },
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
  rowWrap: { flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  rowLast: { borderBottomWidth: 0 },
  sectionGap: { height: 16 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', color: INK },
  groupDesc: { marginTop: 6, marginLeft: 4, marginBottom: 16, fontSize: 12, lineHeight: 16, color: MUTED },
  rowLabelWrap: { flexGrow: 1, flexShrink: 0 },
  seg: { flexDirection: 'row', width: 250, maxWidth: '100%', marginLeft: 'auto', padding: 2, gap: 2, borderRadius: 10, backgroundColor: TINT },
  segBtn: {
    flex: 1,
    minHeight: 28,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBtnOn: { backgroundColor: BLUE },
  segText: { fontSize: 12, fontWeight: '700', color: BLUE },
  desc: { marginTop: 12, paddingLeft: 4, fontSize: 14, lineHeight: 22, color: MUTED },
  demoTitle: { fontSize: 16, fontWeight: '700', color: DANGER },
  demoFloors: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  demoFloor: {
    minWidth: 44,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: DANGER,
  },
  demoFloorOn: { backgroundColor: DANGER },
  demoFloorText: { fontSize: 14, fontWeight: '700', color: DANGER },
  demoStatus: { marginTop: 12, fontSize: 14, fontWeight: '700', color: DANGER },
  demoBtn: {
    marginTop: 14,
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: DANGER,
  },
  demoBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(20,33,61,0.4)' },
  modalCard: { padding: 20, borderRadius: 20, backgroundColor: CARD },
  modalLabel: { marginTop: 16, fontSize: 13, fontWeight: '700', color: INK },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  demoOff: { marginTop: 14, fontSize: 14, fontWeight: '700', color: MUTED },
  footnote: { marginTop: 16, textAlign: 'center', paddingHorizontal: 16, fontSize: 13, color: MUTED },
});
