/**
 * MISC W2D (F10–F12) — the React side of `countdownFeedback`.
 *
 * Each hook is mounted ONCE per answer clock, in the controller that owns the
 * clock's projection — never in a presenter. Ranked's desktop and mobile
 * clocks render the same `TimerView`, and only the pulse (pure CSS from that
 * view) is drawn twice; the sound is decided here, once.
 */
import { useEffect, useRef } from "react";

import { mogzyAudio } from "@/lib/audio/engine";
import type { SfxEvent } from "@/lib/audio/sfx-registry";
import { useSfx } from "@/lib/audio/useSfx";
import {
  observeCountdown,
  observeServerTimeout,
  type CountdownIntensity,
  type CountdownSample,
  type CountdownWatch,
  type TimeoutSample,
  type TimeoutWatch,
} from "./countdownFeedback";

export const COUNTDOWN_SFX_EVENT: Record<CountdownIntensity, SfxEvent> = {
  warn: "quiz.countdown.tick",
  strong: "quiz.countdown.urgent",
  final: "quiz.countdown.final",
};

/**
 * ONE CLOCK OWNS THE BEAT. Two genuine clocks can be in their last seconds
 * together (a Daily Time Trial question clock inside a draining bank), and
 * their second boundaries are offset by an arbitrary phase, so a time gap
 * alone still let both knock — two knocks a second (review edge C). The first
 * clock to knock holds the beat for as long as it keeps knocking (a lease a
 * little over one second, renewed by each of its own knocks); another clock
 * may knock only once the owner has gone quiet. Both drain on the wall clock,
 * so the first clock into its final window is the one that expires first.
 */
const BEAT_LEASE_MS = 1_100;
let beatOwner: { clockKey: string; at: number } | null = null;

export function resetCountdownFeedbackForTests(): void {
  beatOwner = null;
}

function contextSuspended(): boolean {
  try {
    return mogzyAudio.getSfx()?.getSnapshot().contextState === "suspended";
  } catch {
    return false;
  }
}

export function useCountdownSfx(sample: CountdownSample): void {
  const { play } = useSfx();
  const watchRef = useRef<CountdownWatch | null>(null);
  const { clockKey, remainingSeconds, running, armed } = sample;
  useEffect(() => {
    const next = observeCountdown(watchRef.current, { clockKey, remainingSeconds, running, armed });
    watchRef.current = next.watch;
    const tick = next.tick;
    if (!tick) return;
    // A suspended context would RESUME and then render — late. A knock that
    // lands after its second is worse than none, so a beat is never queued.
    if (contextSuspended()) return;
    const now = Date.now();
    if (beatOwner && beatOwner.clockKey !== clockKey && now - beatOwner.at < BEAT_LEASE_MS) return;
    beatOwner = { clockKey: clockKey!, at: now };
    play(COUNTDOWN_SFX_EVENT[tick.intensity], { eventId: tick.eventId });
  }, [clockKey, remainingSeconds, running, armed, play]);
}

export function useServerTimeoutSfx(sample: TimeoutSample): void {
  const { play } = useSfx();
  const watchRef = useRef<TimeoutWatch | null>(null);
  const { settledKey, serverTimedOut } = sample;
  useEffect(() => {
    const next = observeServerTimeout(watchRef.current, { settledKey, serverTimedOut });
    watchRef.current = next.watch;
    if (next.announce) play("quiz.answer.timeout", { eventId: next.announce.eventId });
  }, [settledKey, serverTimedOut, play]);
}
