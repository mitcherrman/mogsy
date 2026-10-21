/**
 * Playback controller for one theater script.
 *
 * Wall time lives only in `usePlaybackClock` (rAF timestamp deltas, so the
 * playback rate is correct at any refresh rate). Everything the stage shows
 * is a pure function of (script, clock time, pinned beat):
 *
 *   selectedIndex = pinned ?? beatIndexAt(script, time)
 *   state         = stateAfterBeat(script, selectedIndex)
 *
 * "Pinning" is how Previous / Next / click-to-select work: they pause, seek
 * the clock to the beat's own instant and pin that index so a run of
 * same-instant beats (the 2v2 fixture fires four at t = 0) can be stepped
 * through one at a time. Playing or scrubbing clears the pin, after which the
 * selection follows the clock again. Scrubbing backward never "undoes"
 * anything — it re-evaluates the prefix.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePlaybackClock } from "@/lib/motion/usePlaybackClock";
import {
  beatIndexAt,
  stateAfterBeat,
  stepBeatIndex,
  type TheaterBeat,
  type TheaterScript,
  type TheaterState,
} from "./theater";

export const THEATER_SPEEDS = [0.25, 0.5, 1, 2] as const;
export type TheaterSpeed = (typeof THEATER_SPEEDS)[number];

export type TheaterController = {
  time: number;
  playing: boolean;
  speed: number;
  selectedIndex: number;
  selected: TheaterBeat | null;
  state: TheaterState;
  atEnd: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  restart: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  selectBeat: (index: number) => void;
  setSpeed: (speed: number) => void;
};

/**
 * @param initialBeatIndex beat to open on, pinned and paused. `null` (the
 *   default) opens on the pre-fight state (index -1): the first beat usually
 *   fires at t = 0, so following the clock from 0 would already show it.
 */
export function useTheaterController(script: TheaterScript, initialBeatIndex: number | null = null): TheaterController {
  const totalMs = Math.max(1, Math.round(script.duration * 1000));
  const clock = usePlaybackClock(totalMs);
  const [pinned, setPinned] = useState<number | null>(() =>
    initialBeatIndex === null ? -1 : Math.max(-1, Math.min(script.beats.length - 1, initialBeatIndex))
  );

  // Seat the clock on the initial pin's own instant (once per script).
  const { seekTimeMs } = clock;
  useEffect(() => {
    const beat = initialBeatIndex !== null ? script.beats[initialBeatIndex] : undefined;
    seekTimeMs(beat ? beat.time * 1000 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const time = clock.timeMs / 1000;
  const selectedIndex = pinned ?? beatIndexAt(script, time);
  const state = useMemo(() => stateAfterBeat(script, selectedIndex), [script, selectedIndex]);
  const selected = selectedIndex >= 0 ? script.beats[selectedIndex] ?? null : null;

  // Live mirror of the selection for step handlers: several key presses can
  // arrive before React re-renders, and each must step from the latest one.
  const selectedRef = useRef(selectedIndex);
  selectedRef.current = selectedIndex;

  const play = useCallback(() => {
    setPinned(null);
    clock.play();
  }, [clock]);

  const pause = useCallback(() => clock.pause(), [clock]);

  const toggle = useCallback(() => {
    if (clock.playing) clock.pause();
    else play();
  }, [clock, play]);

  const restart = useCallback(() => {
    setPinned(null);
    clock.restart();
  }, [clock]);

  const selectBeat = useCallback(
    (index: number) => {
      if (index < 0) {
        clock.pause();
        clock.seekTimeMs(0);
        setPinned(-1);
        selectedRef.current = -1;
        return;
      }
      const beat = script.beats[index];
      if (!beat) return;
      clock.pause();
      clock.seekTimeMs(beat.time * 1000);
      setPinned(index);
      selectedRef.current = index;
    },
    [clock, script]
  );

  const next = useCallback(() => {
    if (script.beats.length === 0) return;
    selectBeat(stepBeatIndex(script, selectedRef.current, 1));
  }, [script, selectBeat]);

  const prev = useCallback(() => {
    if (script.beats.length === 0 || selectedRef.current < 0) return;
    selectBeat(stepBeatIndex(script, selectedRef.current, -1));
  }, [script, selectBeat]);

  const seek = useCallback(
    (seconds: number) => {
      setPinned(null);
      clock.seekTimeMs(seconds * 1000);
    },
    [clock]
  );

  return {
    time,
    playing: clock.playing,
    speed: clock.speed,
    selectedIndex,
    selected,
    state,
    atEnd: clock.timeMs >= totalMs,
    play,
    pause,
    toggle,
    restart,
    next,
    prev,
    seek,
    selectBeat,
    setSpeed: clock.setSpeed,
  };
}
