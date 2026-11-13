import { useEffect } from 'react';

import { claimExit } from '@/data/venue/venue';

const INTERVAL_MS = 5000;

/** While an evacuation route is on screen, tells the backend which exit this phone is heading to (renders nothing). */
export function ExitClaimer({ exitNodeId }: { exitNodeId?: string }) {
  useEffect(() => {
    if (!exitNodeId) return;
    claimExit(exitNodeId);
    const timer = setInterval(() => claimExit(exitNodeId), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [exitNodeId]);
  return null;
}
