import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { elevatorOutage, endAllScenarios, powerOutage, toggleScenario, zoneClosure, ZONE_RADIUS_METERS } from '@/data/venue/scenarios';
import { announce, floorLabel, getVenue, loadVenue, trackEvent, useVenue } from '@/data/venue/venue';
import { useColors, type Colors } from '@/hooks/use-colors';
import { useIncident } from '@/hooks/use-incident';

type Place = { floorId?: string; nodeId?: string; name?: string };
type HelpKind = 'LOST' | 'WHEELCHAIR' | 'SMOKE' | 'OTHER';
const HELP_KINDS: HelpKind[] = ['LOST', 'WHEELCHAIR', 'SMOKE', 'OTHER'];
const PRESETS = ['preset1', 'preset2', 'preset3'] as const;

/** Floor chips + the places of that floor: used to say where a fire starts or which zone closes. */
function PlacePicker({ value, onChange, colors }: { value: Place; onChange: (next: Place) => void; colors: Colors }) {
  const venue = useVenue();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const floorId = value.floorId ?? venue.floors[venue.floors.length - 1]?.id ?? '';
  const pois = venue.mapsByFloorId[floorId]?.pois ?? [];
  const selectedNode = value.nodeId ?? pois[0]?.nodeId;
  return (
    <View style={styles.picker}>
      <View style={styles.chipRow}>
        {venue.floors.map((f) => (
          <Pressable key={f.id} accessibilityRole="button" accessibilityState={{ selected: floorId === f.id }} onPress={() => onChange({ floorId: f.id })} style={[styles.chip, floorId === f.id && styles.chipOn]}>
            <Text style={[styles.chipText, floorId === f.id && styles.chipTextOn]}>{floorLabel(f.id)}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.chipRow}>
        {pois.map((p) => {
          const on = selectedNode === p.nodeId;
          return (
            <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange({ floorId, nodeId: p.nodeId, name: p.name })} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
                {p.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Resolve a picker value to a concrete place of the venue (the first place of the floor when none was tapped). */
function resolve(place: Place): { floorId: string; nodeId: string; name: string } | undefined {
  const venue = getVenue();
  const floorId = place.floorId ?? venue.floors[venue.floors.length - 1]?.id;
  const poi = (floorId ? venue.mapsByFloorId[floorId]?.pois : undefined)?.find((p) => p.nodeId === place.nodeId) ?? (floorId ? venue.mapsByFloorId[floorId]?.pois[0] : undefined);
  return floorId && poi ? { floorId, nodeId: poi.nodeId, name: poi.name } : undefined;
}

export default function DemoScenariosScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();
  const venue = useVenue();
  const [incident, setIncident] = useIncident();
  const [firePlace, setFirePlace] = useState<Place>({});
  const [zonePlace, setZonePlace] = useState<Place>({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadVenue();
  }, []);

  const active = (kind: 'elevator' | 'power' | 'zone') => venue.scenarios.some((s) => s.kind === kind);
  const anyOn = venue.scenarios.length > 0 || !!incident || !!venue.announcement;

  const startFire = () => {
    const where = resolve(firePlace);
    if (where) setIncident({ floorId: where.floorId, nodeId: where.nodeId, name: where.name, type: 'fire' });
  };
  const toggleZone = () =>
    toggleScenario('zone', () => {
      const where = resolve(zonePlace);
      return where ? zoneClosure(where.nodeId, where.name) : undefined;
    });
  const sendHelp = (kind: HelpKind) => {
    trackEvent('HELP_REQUESTED', { helpKind: kind, nodeId: venue.userNodeId });
    Alert.alert(t('demo.help.sentTitle'), t('demo.help.sentBody', { need: t(`demo.help.${kind}`) }));
  };

  const Row = ({ icon, title, hint, children }: { icon: keyof typeof MaterialIcons.glyphMap; title: string; hint?: string; children?: React.ReactNode }) => (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <MaterialIcons name={icon} size={22} color={colors.BLUE} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('scan.back')} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={colors.INK} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('demo.panel.title')}</Text>
          <Text style={styles.sub}>{t('demo.panel.subtitle')}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Row icon="local-fire-department" title={t('demo.fire.title')} hint={t('demo.fire.hint')}>
          <PlacePicker value={firePlace} onChange={setFirePlace} colors={colors} />
          <Pressable accessibilityRole="button" onPress={incident ? () => setIncident(null) : startFire} style={[styles.action, incident && styles.actionEnd]}>
            <Text style={styles.actionText}>{t(incident ? 'demo.end' : 'demo.fire.start')}</Text>
          </Pressable>
        </Row>

        <Row icon="elevator" title={t('demo.elevator.title')} hint={t('demo.elevator.hint')}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t(active('elevator') ? 'demo.on' : 'demo.off')}</Text>
            <Switch value={active('elevator')} onValueChange={() => toggleScenario('elevator', elevatorOutage)} />
          </View>
        </Row>

        <Row icon="power-off" title={t('demo.power.title')} hint={t('demo.power.hint')}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{t(active('power') ? 'demo.on' : 'demo.off')}</Text>
            <Switch value={active('power')} onValueChange={() => toggleScenario('power', powerOutage)} />
          </View>
        </Row>

        <Row icon="block" title={t('demo.zone.title')} hint={t('demo.zone.hint', { meters: ZONE_RADIUS_METERS })}>
          <PlacePicker value={zonePlace} onChange={setZonePlace} colors={colors} />
          <Pressable accessibilityRole="button" onPress={toggleZone} style={[styles.action, active('zone') && styles.actionEnd]}>
            <Text style={styles.actionText}>{t(active('zone') ? 'demo.zone.reopen' : 'demo.zone.close')}</Text>
          </Pressable>
        </Row>

        <Row icon="campaign" title={t('demo.announce.title')} hint={t('demo.announce.hint')}>
          <View style={styles.chipRow}>
            {PRESETS.map((key) => (
              <Pressable key={key} accessibilityRole="button" onPress={() => setMessage(t(`demo.announce.${key}`))} style={styles.chip}>
                <Text style={styles.chipText} numberOfLines={1}>
                  {t(`demo.announce.${key}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={message} onChangeText={setMessage} placeholder={t('demo.announce.placeholder')} placeholderTextColor={colors.MUTED} style={styles.input} maxLength={120} />
          <View style={styles.actionRow}>
            <Pressable accessibilityRole="button" onPress={() => announce(message)} style={[styles.action, styles.flex]}>
              <Text style={styles.actionText}>{t('demo.announce.send')}</Text>
            </Pressable>
            {venue.announcement ? (
              <Pressable accessibilityRole="button" onPress={() => announce(undefined)} style={[styles.action, styles.actionEnd]}>
                <Text style={styles.actionText}>{t('demo.end')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Row>

        <Row icon="support-agent" title={t('demo.help.title')} hint={t('demo.help.hint')}>
          <View style={styles.chipRow}>
            {HELP_KINDS.map((kind) => (
              <Pressable key={kind} accessibilityRole="button" onPress={() => sendHelp(kind)} style={styles.chip}>
                <Text style={styles.chipText}>{t(`demo.help.${kind}`)}</Text>
              </Pressable>
            ))}
          </View>
        </Row>

        <Text style={styles.footnote}>{t('demo.safeNote')}</Text>
      </ScrollView>

      {anyOn ? (
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              endAllScenarios();
              setIncident(null);
              announce(undefined);
            }}
            style={[styles.action, styles.actionEnd]}>
            <Text style={styles.actionText}>{t('demo.endAll')}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, BG, CARD, SURFACE }: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: BG },
    header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
    headerText: { flex: 1 },
    title: { fontSize: 20, fontWeight: '800', color: INK },
    sub: { fontSize: 12, color: MUTED },
    scroll: { padding: 16, gap: 12, paddingBottom: 100 },
    card: { padding: 14, borderRadius: 16, backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, gap: 8 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardTitle: { fontSize: 16, fontWeight: '800', color: INK },
    hint: { fontSize: 13, color: MUTED, lineHeight: 18 },
    picker: { gap: 8 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: SURFACE, maxWidth: '100%' },
    chipOn: { backgroundColor: BLUE },
    chipText: { fontSize: 13, fontWeight: '600', color: INK },
    chipTextOn: { color: '#FFFFFF' },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    switchLabel: { fontSize: 14, fontWeight: '700', color: INK },
    action: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BLUE, paddingHorizontal: 16 },
    actionEnd: { backgroundColor: '#B3261E' },
    actionText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
    actionRow: { flexDirection: 'row', gap: 8 },
    flex: { flex: 1 },
    input: { height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: SURFACE, color: INK, fontSize: 14 },
    footnote: { fontSize: 12, color: MUTED, textAlign: 'center', paddingHorizontal: 12 },
    footer: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  });
