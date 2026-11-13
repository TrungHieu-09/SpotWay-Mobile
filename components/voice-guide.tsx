import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STORAGE_KEY = 'spotway.voiceGuidance';

type Props = {
  /** Changes whenever a new instruction should be spoken (not when only the remaining distance changes). */
  speakKey: string;
  text: string;
};

/** Speaks each new instruction aloud (and taps the phone) while walking; a button turns it off. */
export function VoiceGuide({ speakKey, text }: Props) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => alive && value !== null && setEnabled(value === '1'))
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !enabled || !text) return;
    Speech.stop();
    Speech.speak(text, { language: i18n.language === 'vi' ? 'vi-VN' : 'en-US', rate: 0.95 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    // Only a new instruction (speakKey) triggers speech; text is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakKey, enabled, loaded, i18n.language]);

  useEffect(() => () => void Speech.stop(), []);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    if (!next) void Speech.stop();
    void AsyncStorage.setItem(STORAGE_KEY, next ? '1' : '0').catch(() => undefined);
  };

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled }}
      accessibilityLabel={t(enabled ? 'voice.on' : 'voice.off')}
      onPress={toggle}
      style={[styles.button, { top: insets.top + 12 }]}>
      <MaterialIcons name={enabled ? 'volume-up' : 'volume-off'} size={22} color="#1F2A44" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    zIndex: 30,
  },
});
