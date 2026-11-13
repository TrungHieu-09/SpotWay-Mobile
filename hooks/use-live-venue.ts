import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshIncident, refreshMaps } from '@/data/venue/venue';

const INTERVAL_MS = 5000;

/** Polls the backend while the screen is mounted and the app is in the foreground. */
export function useLiveVenue() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer) return;
      const tick = () => {
        void refreshIncident();
        void refreshMaps();
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
