import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshIncident, refreshMaps, refreshPromotions } from '@/data/venue/venue';

const INTERVAL_MS = 5000;
/** Promotions change rarely: refresh them every 12th tick (about a minute). */
const PROMO_EVERY = 12;

/** Polls the backend while the screen is mounted and the app is in the foreground. */
export function useLiveVenue() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let ticks = 0;
    const start = () => {
      if (timer) return;
      const tick = () => {
        void refreshIncident();
        void refreshMaps();
        if (ticks++ % PROMO_EVERY === 0) void refreshPromotions();
      };
      tick();
      timer = setInterval(tick, INTERVAL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (next) => (next === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, []);
}
