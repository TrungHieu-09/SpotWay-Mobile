import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

export type HeadingSensor = 'unknown' | 'ready' | 'denied' | 'unavailable';

/** Smoothing of the compass (0..1, higher follows the sensor faster): enough to hide the jitter indoors. */
const SMOOTHING = 0.3;

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/**
 * Compass heading of the phone in degrees (0 = north, clockwise), low-pass filtered on the circle.
 * Returned as a getter (a ref) so step handlers always read the latest value without re-rendering every sensor tick.
 */
export function useCompassHeading(enabled: boolean): { getHeading: () => number | null; status: HeadingSensor } {
  const heading = useRef<number | null>(null);
  const [status, setStatus] = useState<HeadingSensor>('unknown');

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return alive && setStatus('denied');
        subscription = await Location.watchHeadingAsync((reading) => {
          const raw = reading.trueHeading >= 0 ? reading.trueHeading : reading.magHeading;
          if (raw < 0 || !Number.isFinite(raw)) return;
          const previous = heading.current;
          if (previous === null) {
            heading.current = norm(raw);
          } else {
            // Average on the circle so 359 -> 1 does not swing through 180.
            const delta = ((raw - previous + 540) % 360) - 180;
            heading.current = norm(previous + delta * SMOOTHING);
          }
        });
        if (alive) setStatus('ready');
        else subscription.remove();
      } catch {
        if (alive) setStatus('unavailable');
      }
    })();
    return () => {
      alive = false;
      subscription?.remove();
      heading.current = null;
    };
  }, [enabled]);

  return { getHeading: () => heading.current, status };
}
