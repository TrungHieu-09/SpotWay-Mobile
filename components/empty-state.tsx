import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/scaled-text';
import { useColors, type Colors } from '@/hooks/use-colors';

type Props = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Centered icon + message + optional button, for empty and error states. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <MaterialIcons name={icon} size={28} color={colors.BLUE} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const makeStyles = ({ BLUE, INK, MUTED, TINT }: Colors) =>
  StyleSheet.create({
    wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: TINT,
    },
    title: { marginTop: 4, fontSize: 16, fontWeight: '700', color: INK, textAlign: 'center' },
    message: { fontSize: 14, lineHeight: 20, color: MUTED, textAlign: 'center' },
    button: {
      marginTop: 8,
      height: 40,
      paddingHorizontal: 18,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: BLUE,
    },
    buttonText: { fontSize: 14, fontWeight: '700', color: BLUE },
  });
