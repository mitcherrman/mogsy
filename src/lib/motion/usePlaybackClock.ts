/**
 * Interactive playback clock — the ONLY place wall time exists.
 *
 * requestAnimationFrame advances an explicit playback-time value using the
 * callback-timestamp delta (never "one tick per frame"), so playback speed
 * is correct on 60/120/144 Hz alike. Hidden tabs: rAF suspends and the
 * delta is clamped on resume, so hidden wall-clock time is simply not
 * counted (the documented v1 policy — no accidental catch-up burst).
 *
 * React state holds only interactive inputs (playing/speed/timeMs); frame
 * state is derived per render from the pure engine.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Longest single step we accept from one rAF delta (ms). */
const MAX_STEP_MS = 100;

export interface PlaybackClock {
  timeMs: number;
  playing: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  restart: () => void;
  setSpeed: (s: number) => void;
  seekTimeMs: (t: number) => void;
}

export function usePlaybackClock(totalMs: number): PlaybackClock {
  const [timeMs, setTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last !== null) {
        const dt = Math.min(MAX_STEP_MS, Math.max(0, ts - last)) * speed;
        setTimeMs((t) => {
          const next = Math.min(totalMs, t + dt);
          if (next >= totalMs) setPlaying(false);
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed, totalMs]);

  const play = useCallback(() => {
    setTimeMs((t) => (t >= totalMs ? 0 : t));
    setPlaying(true);
  }, [totalMs]);
  const pause = useCallback(() => setPlaying(false), []);
  const restart = useCallback(() => {
    setTimeMs(0);
    setPlaying(true);
  }, []);
  const seekTimeMs = useCallback(
    (t: number) => setTimeMs(Math.max(0, Math.min(totalMs, t))),
    [totalMs],
  );

  return { timeMs, playing, speed, play, pause, restart, setSpeed, seekTimeMs };
}
