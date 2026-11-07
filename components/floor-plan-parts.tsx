import { G, Path } from 'react-native-svg';

import type { StoreCategory } from '@/data/venue/places';
import { useColors } from '@/hooks/use-colors';

const EXIT_GREEN = '#2E9E5B';

/** Icon paths drawn in a 16x16 box centred on (0,0). */
const ICONS: Partial<Record<StoreCategory, { d: string; fill?: boolean; color?: string }[]>> = {
  coffee: [
    { d: 'M-5 -3 H3 V2 a3 3 0 0 1 -3 3 H-2 a3 3 0 0 1 -3 -3 Z' },
    { d: 'M3 -2 H4.5 a1.8 1.8 0 0 1 0 3.6 H3' },
    { d: 'M-3 -6 V-5 M0 -6 V-5' },
  ],
  fashion: [{ d: 'M-3 -6 L-7 -3 L-5 0 L-3 -1 V6 H3 V-1 L5 0 L7 -3 L3 -6 Q0 -3 -3 -6 Z' }],
  books: [{ d: 'M-7 -5 H0 V6 H-7 Z M0 -5 H7 V6 H0 Z M-5 -2 H-2 M2 -2 H5' }],
  food: [{ d: 'M-4 -6 V6 M-6 -6 V-2 a2 2 0 0 0 4 0 V-6 M4 -6 V6 M4 -6 C1 -4 1 0 4 1' }],
  wc_male: [
    { d: 'M0 -2 V3 M-3 0 H3 M0 3 L-2.5 7 M0 3 L2.5 7' },
    { d: 'M-1.8 -5 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0 Z' },
  ],
  wc_female: [
    { d: 'M0 -2 L-3.5 5 H3.5 Z M-1.5 5 V7 M1.5 5 V7' },
    { d: 'M-1.8 -5 a1.8 1.8 0 1 0 3.6 0 a1.8 1.8 0 1 0 -3.6 0 Z' },
  ],
  elevator: [
    { d: 'M-6 -7 H6 V7 H-6 Z' },
    { d: 'M0 -5 L-2.5 -1.5 H2.5 Z', fill: true },
    { d: 'M0 5 L-2.5 1.5 H2.5 Z', fill: true },
  ],
  escalator: [
    { d: 'M-7 6 H-3 V2 H1 V-2 H5 V-6 H7' },
    { d: 'M-4 -3 L0 -7 M-4 -3 H-1', },
  ],
  atm: [{ d: 'M-7 -4 H7 V4 H-7 Z M-7 -1 H7 M-5 2 H-1' }],
  electronics: [{ d: 'M-4 -7 H4 V7 H-4 Z M-1 5 H1' }],
  beauty: [{ d: 'M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z' }],
  supermarket: [
    { d: 'M-7 -5 H-4 L-2 3 H5 L6.5 -3 H-4.5' },
    { d: 'M-1 6 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M4 6 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0' },
  ],
  exit: [
    { d: 'M-1 -7 H6 V7 H-1', color: EXIT_GREEN },
    { d: 'M-7 0 H2 M-1 -3 L2 0 L-1 3', color: EXIT_GREEN },
  ],
  pharmacy: [{ d: 'M-2 -6 H2 V-2 H6 V2 H2 V6 H-2 V2 H-6 V-2 H-2 Z' }],
};

export function StoreIcon({ category, x, y }: { category: StoreCategory; x: number; y: number }) {
  const { INK } = useColors();
  const paths = ICONS[category];
  if (!paths) return null;
  return (
    <G transform={`translate(${x}, ${y}) scale(0.9)`}>
      {paths.map((p, i) => (
        <Path
          key={i}
          d={p.d}
          fill={p.fill ? INK : 'none'}
          stroke={p.color ?? INK}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </G>
  );
}

/** Split a label into at most two short lines so it fits inside a small cell. */
export function wrapLabel(name: string, max = 11): string[] {
  if (name.length <= max) return [name];
  const words = name.split(' ');
  let best = [name];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const score = Math.max(a.length, b.length);
    if (score < bestScore) {
      bestScore = score;
      best = [a, b];
    }
  }
  return best.map((l) => (l.length > max + 2 ? l.slice(0, max + 1) + '…' : l));
}

