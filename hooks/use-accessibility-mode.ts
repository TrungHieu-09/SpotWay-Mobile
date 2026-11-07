import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { Appearance } from 'react-native';

export type TextSize = 'small' | 'medium' | 'large';
export type ThemeMode = 'system' | 'light' | 'dark';

/** Multiplier applied to text in the main screens for each size. */
export const TEXT_SCALE: Record<TextSize, number> = { small: 0.9, medium: 1, large: 1.2 };

// Tiny shared stores so the map and the settings screen always agree.
function createPersistedStore<T>(key: string, initial: T, parse: (raw: string) => T | null) {
  let value = initial;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  AsyncStorage.getItem(key)
    .then((saved) => {
      const next = saved === null ? null : parse(saved);
      if (next !== null && next !== value) {
        value = next;
        emit();
      }
    })
    .catch(() => {});

  return {
    get: () => value,
    set: (next: T) => {
      if (next === value) return;
      value = next;
      AsyncStorage.setItem(key, String(next)).catch(() => {});
      emit();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const accessible = createPersistedStore<boolean>('spotway.accessibleRoutes', false, (r) => r === 'true');
const textSize = createPersistedStore<TextSize>('spotway.textSize.v2', 'medium', (r) =>
  r === 'small' || r === 'medium' || r === 'large' ? r : null,
);
const contrast = createPersistedStore<boolean>('spotway.highContrast', false, (r) => r === 'true');

const themeMode = createPersistedStore<ThemeMode>('spotway.themeMode', 'system', (r) =>
  r === 'system' || r === 'light' || r === 'dark' ? r : null,
);
// Native appearance follows the saved choice, so useColorScheme() reflects it everywhere.
themeMode.subscribe(() => {
  const mode = themeMode.get();
  Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
});

export const setAccessibilityMode = accessible.set;

/** Light / dark / follow-the-system appearance. */
export function useThemeMode(): [ThemeMode, (value: ThemeMode) => void] {
  const value = useSyncExternalStore(themeMode.subscribe, themeMode.get, themeMode.get);
  return [value, themeMode.set];
}

/** Whether step-free / lift-first routing is preferred. */
export function useAccessibilityMode(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(accessible.subscribe, accessible.get, accessible.get);
  return [value, accessible.set];
}

export function useTextSize(): [TextSize, (value: TextSize) => void] {
  const value = useSyncExternalStore(textSize.subscribe, textSize.get, textSize.get);
  return [value, textSize.set];
}

/** Current text multiplier (0.9 / 1 / 1.2). */
export function useTextScale(): number {
  return TEXT_SCALE[useTextSize()[0]];
}

export function useHighContrast(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(contrast.subscribe, contrast.get, contrast.get);
  return [value, contrast.set];
}
