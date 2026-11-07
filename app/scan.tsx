import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/scaled-text';
import { extractQrToken, resolveQrToken } from '@/data/venue/venue';
import { useColors, type Colors } from '@/hooks/use-colors';

// Fixed brand colours; everything else follows the light / dark palette.
const BRAND = '#1C4E9C';
const ORANGE = '#F2641E';
const SCRIM = 'rgba(11,15,25,0.62)';
const FRAME = 220;
const CORNER = 28;
const STROKE = 3.5;

export default function ScanScreen() {
  const colors = useColors();
  const { BLUE, INK, MUTED } = colors;
  const dark = useColorScheme() === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const errorColor = dark ? '#FF8A8A' : '#D64545';
  const { t } = useTranslation();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const handled = useRef(false);
  const [scanError, setScanError] = useState(false);
  const lastBad = useRef('');

  // A scanned QR that is not a SpotWay code shows an inline error for a moment.
  useEffect(() => {
    if (!scanError) return;
    const id = setTimeout(() => {
      setScanError(false);
      lastBad.current = '';
    }, 3500);
    return () => clearTimeout(id);
  }, [scanError]);

  // A QR carries a link (`...?qr=<token>`) or a bare token; the backend turns it into a position.
  const onScanned = (value: string) => {
    const token = extractQrToken(value);
    if (handled.current || !value.trim()) return;
    if (!token) {
      if (lastBad.current !== value) {
        lastBad.current = value;
        setScanError(true);
      }
      return;
    }
    void openVenue(token);
  };

  const openVenue = async (value: string) => {
    const token = extractQrToken(value);
    if (!token || handled.current) {
      if (!token) setCodeError(true);
      return;
    }
    handled.current = true;
    try {
      const where = await resolveQrToken(token);
      setManualOpen(false);
      router.replace({ pathname: '/building', params: { from: where.nodeId, floor: where.floorId, label: where.label } });
    } catch {
      // Unknown / expired token or no connection: allow another try.
      handled.current = false;
      lastBad.current = value;
      setScanError(true);
      setCodeError(true);
    }
  };

  const granted = permission?.granted === true;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topBarRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scan.back')}
            hitSlop={8}
            onPress={() => router.back()}
            style={styles.iconButton}>
            <MaterialIcons name="arrow-back" size={24} color={INK} />
          </Pressable>
          <Text style={styles.title}>{t('scan.title')}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('scan.flashlight')}
            accessibilityState={{ selected: torch }}
            onPress={() => setTorch((v) => !v)}
            style={[styles.iconButton, styles.torchButton, torch && styles.torchActive]}>
            <MaterialIcons
              name={torch ? 'flashlight-on' : 'flashlight-off'}
              size={20}
              color={torch ? '#FFFFFF' : INK}
            />
          </Pressable>
        </View>
      </SafeAreaView>

      <View style={styles.camera}>
        {granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => onScanned(data)}
          />
        ) : (
          <View style={styles.permission}>
            <MaterialIcons name="photo-camera" size={40} color="#FFFFFF" />
            <Text style={styles.permissionText}>{t('scan.permissionText')}</Text>
            {permission && !permission.granted && (
              <Pressable
                accessibilityRole="button"
                onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
                style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>
                  {t(permission.canAskAgain ? 'scan.permissionCta' : 'scan.permissionSettings')}
                </Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={() => setManualOpen(true)}>
              <Text style={styles.permissionManual}>{t('scan.manual')}</Text>
            </Pressable>
          </View>
        )}

        {/* Scrim around the scan frame only; the frame itself stays clear. */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.scrim} />
          <View style={styles.middleRow}>
            <View style={styles.scrim} />
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.scrim} />
          </View>
          <View style={[styles.scrim, styles.scrimBottom]}>
            <Text style={styles.instruction}>{t('scan.instruction')}</Text>
            <Text style={styles.instructionSub}>{t('scan.instructionSub')}</Text>
          </View>
        </View>

        <View style={styles.bannerWrap} pointerEvents="none">
          {scanError ? (
            <View style={[styles.banner, styles.bannerError]} accessibilityRole="alert">
              <MaterialIcons name="error-outline" size={17} color={errorColor} />
              <Text style={[styles.bannerText, styles.bannerErrorText]}>{t('scan.invalidCode')}</Text>
            </View>
          ) : (
            <View style={styles.banner}>
              <MaterialIcons name="info" size={17} color={BLUE} />
              <Text style={styles.bannerText}>{t('scan.banner')}</Text>
            </View>
          )}
        </View>
      </View>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <View style={styles.bottomInner}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setManualOpen(true)}
            style={({ pressed }) => [styles.manualButton, pressed && styles.manualPressed]}>
            <MaterialIcons name="keyboard" size={20} color={BLUE} />
            <Text style={styles.manualText}>{t('scan.manual')}</Text>
          </Pressable>
          <Text style={styles.help}>{t('scan.help')}</Text>
        </View>
      </SafeAreaView>

      <Modal
        visible={manualOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setManualOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setManualOpen(false)} />
          <SafeAreaView edges={['bottom']} style={styles.sheet}>
            <View style={styles.sheetBody}>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleRow}>
                  <MaterialIcons name="pin" size={22} color={BLUE} />
                  <Text style={styles.sheetTitle}>{t('scan.modalTitle')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('scan.close')}
                  onPress={() => setManualOpen(false)}
                  style={styles.closeButton}>
                  <MaterialIcons name="close" size={20} color={MUTED} />
                </Pressable>
              </View>
              <Text style={styles.sheetDesc}>{t('scan.modalDesc')}</Text>
              <TextInput
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setCodeError(false);
                }}
                placeholder={t('scan.modalPlaceholder')}
                placeholderTextColor={MUTED}
                autoCapitalize="characters"
                autoCorrect={false}
                spellCheck={false}
                maxLength={16}
                returnKeyType="done"
                onSubmitEditing={() => openVenue(code)}
                style={styles.input}
              />
              {codeError && <Text style={styles.inputError}>{t('scan.invalidCode')}</Text>}
              <Pressable
                accessibilityRole="button"
                onPress={() => openVenue(code)}
                style={({ pressed }) => [styles.confirm, pressed && styles.confirmPressed]}>
                <Text style={styles.confirmText}>{t('scan.modalConfirm')}</Text>
                <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const corner = { position: 'absolute', width: CORNER, height: CORNER, borderColor: ORANGE } as const;

const makeStyles = (
  { BLUE, INK, MUTED, BORDER, CANVAS, CARD, TINT, SURFACE, ACTIVE_BG, EVAC_BG }: Colors,
  dark: boolean,
) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: CANVAS },
  topBar: { backgroundColor: CARD },
  topBarRow: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  torchButton: { borderRadius: 20, borderWidth: 1, borderColor: BORDER },
  torchActive: { backgroundColor: BRAND, borderColor: BRAND },
  title: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: INK },

  camera: { flex: 1, backgroundColor: '#0B0F19' },
  permission: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  permissionText: { color: '#FFFFFF', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  permissionButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: BRAND },
  permissionButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },

  scrim: { flex: 1, backgroundColor: SCRIM },
  scrimBottom: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 24, gap: 6 },
  middleRow: { height: FRAME, flexDirection: 'row' },
  frame: { width: FRAME, height: FRAME },
  corner: { ...corner },
  cornerTL: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 12 },
  cornerTR: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 12 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 12 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 12 },
  instruction: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  instructionSub: { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 340 },

  bannerWrap: { position: 'absolute', top: 16, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16 },
  banner: {
    maxWidth: 340,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: TINT,
  },
  bannerError: { backgroundColor: EVAC_BG },
  bannerErrorText: { color: dark ? '#FF8A8A' : '#D64545' },
  permissionManual: { fontSize: 14, fontWeight: '600', color: '#FFFFFF', textDecorationLine: 'underline' },
  bannerText: { flexShrink: 1, fontSize: 13, fontWeight: '500', color: BLUE, textAlign: 'center' },

  bottom: {
    backgroundColor: CARD,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  bottomInner: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, gap: 12, alignItems: 'center' },
  inputError: { marginTop: 8, fontSize: 13, color: dark ? '#FF8A8A' : '#D64545' },
  manualButton: {
    width: '100%',
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BLUE,
    backgroundColor: CARD,
  },
  manualPressed: { backgroundColor: ACTIVE_BG },
  manualText: { fontSize: 15, fontWeight: '600', color: BLUE },
  help: { fontSize: 12.5, color: MUTED, textAlign: 'center' },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetBody: { padding: 24, gap: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: INK },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TINT,
  },
  sheetDesc: { fontSize: 12, lineHeight: 18, color: MUTED },
  input: {
    height: 48,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: SURFACE,
    color: INK,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  confirm: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    backgroundColor: '#00377C',
  },
  confirmPressed: { backgroundColor: BRAND },
  confirmText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
});
