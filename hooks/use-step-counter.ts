import { Pedometer } from 'expo-sensors';
import { useEffect, useRef, useState } from 'react';

export type StepSensor = 'unknown' | 'ready' | 'unavailable' | 'denied';

/**
 * While `enabled`, reports every new step the phone's pedometer counts (as a delta since the last report).
 * `status` says whether the sensor can be used so the screen can offer the tap fallback.
 */
export function useStepCounter(enabled: boolean, onSteps: (delta: number) => void): StepSensor {
  const [status, setStatus] = useState<StepSensor>('unknown');
  const callback = useRef(onSteps);
  callback.current = onSteps;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let subscription: { remove: () => void } | undefined;
    (async () => {
      try {
        if (!(await Pedometer.isAvailableAsync())) return alive && setStatus('unavailable');
        const permission = await Pedometer.requestPermissionsAsync();
        if (!permission.granted) return alive && setStatus('denied');
        if (!alive) return;
        setStatus('ready');
        let last = 0;
        subscription = Pedometer.watchStepCount(({ steps }) => {
          const delta = steps - last;
          last = steps;
          if (delta > 0) callback.current(delta);
        });
      } catch {
        if (alive) setStatus('unavailable');
      }
    })();
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, [enabled]);

  return status;
}
