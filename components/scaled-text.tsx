import { StyleSheet, Text as RNText, type TextProps, type TextStyle } from 'react-native';

import { useHighContrast, useTextScale } from '@/hooks/use-accessibility-mode';
import { useColors } from '@/hooks/use-colors';

// Muted greys used across the screens (light and dark); high contrast turns them to the strongest ink.
const MUTED_COLORS = new Set(['#5B6B88', '#9AA9C4', '#737782', '#8A8F98', '#434751']);

/**
 * Drop-in replacement for react-native's Text that follows the accessibility settings
 * (text size, high contrast) and the light / dark appearance.
 */
export function Text({ style, ...props }: TextProps) {
  const scale = useTextScale();
  const [highContrast] = useHighContrast();
  const colors = useColors();
  const flat = StyleSheet.flatten(style) ?? {};
  const next: { -readonly [K in keyof TextStyle]: TextStyle[K] } = { ...flat };
  if (scale !== 1) {
    const size = flat.fontSize ?? 14;
    next.fontSize = size * scale;
    if (flat.lineHeight) next.lineHeight = flat.lineHeight * scale;
  }
  if (highContrast && (flat.color === undefined || MUTED_COLORS.has(String(flat.color)))) {
    next.color = colors.STRONG;
  } else if (flat.color === undefined && colors.CANVAS !== '#FFFFFF') {
    next.color = colors.INK;
  }
  return <RNText {...props} style={next} />;
}
