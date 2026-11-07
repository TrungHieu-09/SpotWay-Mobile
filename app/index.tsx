import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components/scaled-text';
import { useColors, type Colors } from '@/hooks/use-colors';
import { setLanguage } from '@/i18n';

// Fixed brand colours (logo, button); text and surfaces follow the light / dark palette.
const BRAND = '#1C4E9C';
const ORANGE = '#F2641E';

export default function WelcomeScreen() {
  const colors = useColors();
  const { BLUE } = colors;
  const dark = useColorScheme() === 'dark';
  const styles = useMemo(() => makeStyles(colors, dark), [colors, dark]);
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const isVi = i18n.language === 'vi';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <Text style={styles.brand}>SpotWay</Text>
              <View style={styles.brandDot} />
            </View>
            <Text style={styles.tagline}>{t('welcome.tagline')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('welcome.changeLanguage')}
            onPress={() => setLanguage(isVi ? 'en' : 'vi')}
            style={({ pressed }) => [styles.langButton, pressed && styles.langPressed]}>
            <View style={styles.langDot} />
            <Text style={styles.langText}>{isVi ? 'VN' : 'EN'}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.logoBox}>
            <Svg width={96} height={96} viewBox="0 0 96 96" fill="none">
              <Path
                d="M29 67C29 67 27 50 48 45C69 40 67 23 67 23"
                stroke="#FFFFFF"
                strokeWidth={7.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <Circle cx={29} cy={67} r={4.5} fill="#FFFFFF" />
              <Circle cx={67} cy={23} r={6.5} fill={ORANGE} stroke="#FFFFFF" strokeWidth={2} />
            </Svg>
          </View>

          <View style={styles.copy}>
            <Text style={styles.headline}>{t('welcome.headline')}</Text>
            <Text style={styles.desc}>{t('welcome.desc')}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <View style={styles.noteRow}>
            <MaterialIcons name="verified-user" size={15} color={BLUE} />
            <Text style={styles.note}>{t('welcome.note')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/scan')}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
            <Text style={styles.ctaText}>{t('welcome.cta')}  →</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, BORDER, CANVAS, BG }: Colors, dark: boolean) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: dark ? CANVAS : '#F9F9FF' },
  container: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  brand: { fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.7, color: BLUE },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ORANGE, transform: [{ translateY: -2 }] },
  tagline: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '500', color: MUTED },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: BG,
  },
  langPressed: { backgroundColor: BORDER },
  langDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE },
  langText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, color: INK },
  hero: { flex: 1, justifyContent: 'center', gap: 40 },
  logoBox: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 20,
    backgroundColor: BRAND,
    overflow: 'hidden',
    shadowColor: BRAND,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  copy: { gap: 12 },
  headline: { fontSize: 32, lineHeight: 37, fontWeight: '900', letterSpacing: -0.6, color: INK },
  desc: { maxWidth: 325, fontSize: 15, lineHeight: 22, color: MUTED },
  actions: { gap: 12, paddingTop: 24, paddingBottom: 8 },
  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  note: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: MUTED },
  cta: { height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND },
  ctaPressed: { backgroundColor: '#123A78' },
  ctaText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
