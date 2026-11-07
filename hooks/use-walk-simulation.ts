import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Point } from '@/data/venue/plan';

const WALK_SPEED_MPS = 1.2;

/** Demo speed-up over real walking speed, so the whole route is watchable in seconds. */
export const SIM_SPEED_FACTOR = 2.5;
/** Simulated walking speed in map pixels per second for a floor scale (metres per pixel). */
export const simSpeed = (metersPerPixel: number) => (WALK_SPEED_MPS / metersPerPixel) * SIM_SPEED_FACTOR;

const FRAME_MS = 33;

export type WalkSimulation = {
  position: Point;
  /** Degrees, 0 = up, clockwise; follows the current leg. */
  heading: number;
  segmentIndex: number;
  /** 0..1 along the current leg. */
  progress: number;
  playing: boolean;
  finished: boolean;
  play: () => void;
  pause: () => void;
  restart: () => void;
  /** Jump to the start of a leg (the last index means arrival). */
  seekToSegment: (index: number) => void;
};

/** Moves a marker along a polyline at constant speed, so corners do not cause jumps. */
export function useWalkSimulation(corners: Point[], speed: number): WalkSimulation {
  const [dist, setDist] = useState(0);
  const [playing, setPlaying] = useState(true);

  const { starts, total } = useMemo(() => {
    const s: number[] = [0];
    for (let i = 1; i < corners.length; i++) {
      s.push(s[i - 1] + Math.hypot(corners[i].x - corners[i - 1].x, corners[i].y - corners[i - 1].y));
    }
    return { starts: s, total: s[s.length - 1] ?? 0 };
  }, [corners]);

  useEffect(() => {
    setDist(0);
    setPlaying(true);
  }, [corners]);

  const finished = dist >= total;
  const running = playing && !finished;

  const lastTick = useRef(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    lastTick.current = Date.now();
    const tick = () => {
      const now = Date.now();
      if (now - lastTick.current >= FRAME_MS) {
        const dt = (now - lastTick.current) / 1000;
        lastTick.current = now;
        setDist((d) => Math.min(total, d + dt * speed));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, total]);

  const legCount = Math.max(0, corners.length - 1);
  let segmentIndex = 0;
  while (segmentIndex < legCount && dist >= starts[segmentIndex + 1]) segmentIndex++;

  const origin = corners[0] ?? { x: 0, y: 0 };
  let position = origin;
  let progress = 1;
  let heading = 0;
  if (legCount > 0) {
    const leg = Math.min(segmentIndex, legCount - 1);
    const a = corners[leg];
    const b = corners[leg + 1];
    const len = starts[leg + 1] - starts[leg];
    progress = len > 0 ? Math.min(1, Math.max(0, (dist - starts[leg]) / len)) : 1;
    position = { x: a.x + (b.x - a.x) * progress, y: a.y + (b.y - a.y) * progress };
    heading = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
  }

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const restart = useCallback(() => {
    setDist(0);
    setPlaying(true);
  }, []);
  const seekToSegment = useCallback(
    (index: number) => setDist(starts[Math.min(Math.max(index, 0), starts.length - 1)] ?? 0),
    [starts],
  );

  return { position, heading, segmentIndex, progress, playing, finished, play, pause, restart, seekToSegment };
}
