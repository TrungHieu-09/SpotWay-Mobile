import { useColorScheme } from 'react-native';

const light = {
  BLUE: '#1C4E9C',
  INK: '#14213D',
  MUTED: '#5B6B88',
  BORDER: '#E4E8F0',
  WALL: '#8A8F98',
  ACTIVE_BG: '#E6EDF8',
  TINT: '#E0EDFF',
  BG: '#F5F7FB',
  /** Page background behind the map and plain screens. */
  CANVAS: '#FFFFFF',
  /** Cards, pills and bars floating above the page. */
  CARD: '#FFFFFF',
  STORE_FILL: '#F9F9F9',
  SELECTED_FILL: '#D3D7DE',
  /** Tinted panel (store detail). */
  SURFACE: '#F0F3FF',
  OPEN_BG: '#E7EEFF',
  OPEN_FG: '#244886',
  EVAC_BG: '#FDECEC',
  /** Strongest text colour, used by high contrast. */
  STRONG: '#0B1220',
};

export type Colors = typeof light;

const dark: Colors = {
  BLUE: '#4C86E0',
  INK: '#EAF0FB',
  MUTED: '#9AA9C4',
  BORDER: '#2A3650',
  WALL: '#7C879B',
  ACTIVE_BG: '#1F2F4D',
  TINT: '#1F2F4D',
  BG: '#0E1424',
  CANVAS: '#0E1424',
  CARD: '#182036',
  STORE_FILL: '#222C45',
  SELECTED_FILL: '#3A4766',
  SURFACE: '#1E2A44',
  OPEN_BG: '#223255',
  OPEN_FG: '#A9C4F5',
  EVAC_BG: '#3A1E24',
  STRONG: '#FFFFFF',
};

/** Palette for the current light / dark appearance (follows the Theme setting). */
export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}
