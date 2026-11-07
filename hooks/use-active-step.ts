import { useSyncExternalStore } from 'react';

// Which step of a route the walker is on. Shared by the map and the step list so both agree.
let state = { key: '', step: 0 };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useActiveStep(key: string): [number, (step: number) => void] {
  const step = useSyncExternalStore(
    subscribe,
    () => (state.key === key ? state.step : 0),
    () => 0,
  );
  const setStep = (next: number) => {
    state = { key, step: next };
    listeners.forEach((l) => l());
  };
  return [step, setStep];
}
