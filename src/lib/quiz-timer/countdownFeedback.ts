/**
 * MISC W2D (F10–F12) — THE ANSWER CLOCK'S FINAL-SECONDS FEEDBACK.
 *
 * One pure observer shared by every genuine answer clock (Ranked's header
 * timer, which also carries every hosted Daily stage, and the Daily Time
 * Trial bank). It decides two things and nothing else:
 *
 *   * F10/F11 — whether a displayed second of a RUNNING clock is a countdown
 *     beat (5, 4, 3, 2, 1) that should sound and pulse now;
 *   * F12    — whether a SERVER-settled timeout should be announced now.
 *
 * It never decides that time ran out. A local zero is a display value: the
 * backend settles every timeout, and a TIME'S UP is announced only from the
 * settlement field a caller hands in. An answer the server accepted (or that
 * is still in flight) therefore cannot produce one — the server will settle
 * it as an answer, not as a timeout.
 *
 * DEDUPE, AND WHY IT IS SHAPED THIS WAY
 * ─────────────────────────────────────
 * Every beat carries a stable `eventId` — `quiz-countdown:<clock>:<second>` —
 * and the SFX engine renders an id at most once per page session. That is
 * the guarantee against a duplicate sound from a remount, a StrictMode double
 * effect, a skew correction that moves the digit back up a second, or a
 * second rendered presenter. This observer adds the two rules the engine
 * cannot know:
 *
 *   * the FIRST sample of a clock is a baseline. Mounting, reconnecting or
 *     resuming onto a clock that is already at 3 is history, not a beat;
 *   * only the CURRENT second sounds. A long task or a backgrounded tab that
 *     jumps 5 → 2 sounds 2 once — never a burst of 4, 3, 2.
 */

/** The final seconds that tick. */
export const COUNTDOWN_BEAT_SECONDS = [5, 4, 3, 2, 1] as const;
export type CountdownBeat = typeof COUNTDOWN_BEAT_SECONDS[number];

/** Escalation: 5–4 warn, 3–2 strong, 1 final (the largest). */
export type CountdownIntensity = "warn" | "strong" | "final";

export function countdownBeat(remainingSeconds: number | null | undefined): CountdownBeat | null {
  if (remainingSeconds === null || remainingSeconds === undefined) return null;
  return remainingSeconds >= 1 && remainingSeconds <= 5 && Number.isInteger(remainingSeconds)
    ? remainingSeconds as CountdownBeat : null;
}

export function countdownIntensity(beat: CountdownBeat): CountdownIntensity {
  return beat === 1 ? "final" : beat <= 3 ? "strong" : "warn";
}

export interface CountdownSample {
  /**
   * Identity of ONE answer clock: a round, a per-card child, a pooled Journey
   * budget, a Daily bank. Null when no clock is live. Two cards of one module
   * must have different keys; a pooled budget that pauses between cards keeps
   * ONE key, so a remainder resumed after a reveal never re-sounds.
   */
  clockKey: string | null;
  /** The displayed whole seconds (ceiling); null when nothing is shown. */
  remainingSeconds: number | null;
  /** The server says this clock is spending now (not paused, not held). */
  running: boolean;
  /**
   * The viewer can still answer on this clock. False once their own answer is
   * submitted or in flight: the final seconds are a call to act, and a player
   * who has acted is not urged on (the digits keep counting for the round).
   */
  armed: boolean;
}

export interface CountdownWatch {
  clockKey: string | null;
  lastSeconds: number | null;
}

export interface CountdownTick {
  second: CountdownBeat;
  intensity: CountdownIntensity;
  eventId: string;
}

export function countdownEventId(clockKey: string, second: number): string {
  return `quiz-countdown:${clockKey}:${second}`;
}

/** Observe one sample; at most one beat per call, and only the current one. */
export function observeCountdown(
  previous: CountdownWatch | null,
  sample: CountdownSample,
): { watch: CountdownWatch; tick: CountdownTick | null } {
  const watch: CountdownWatch = { clockKey: sample.clockKey, lastSeconds: sample.remainingSeconds };
  if (sample.clockKey === null || sample.remainingSeconds === null) return { watch, tick: null };
  // A new clock (or the first sample after mount) is a baseline only.
  if (!previous || previous.clockKey !== sample.clockKey || previous.lastSeconds === null) {
    return { watch, tick: null };
  }
  const beat = countdownBeat(sample.remainingSeconds);
  const crossed = sample.remainingSeconds < previous.lastSeconds;
  if (!beat || !crossed || !sample.running || !sample.armed) return { watch, tick: null };
  return {
    watch,
    tick: {
      second: beat,
      intensity: countdownIntensity(beat),
      eventId: countdownEventId(sample.clockKey, beat),
    },
  };
}

/**
 * The visual beat for a displayed clock: which second's pulse to draw, or
 * null. Visual only and stateless — every presenter of the same `TimerView`
 * draws the same beat, so two presenters can never disagree, and none of them
 * owns a sound.
 */
export type CountdownClockLike = { remainingSeconds: number; paused: boolean } | null | undefined;

export function countdownVisualBeat(timer: CountdownClockLike): CountdownBeat | null {
  if (!timer || timer.paused) return null;
  return countdownBeat(timer.remainingSeconds);
}

/** The clock element's beat attributes (spread onto it); empty off-beat. */
export function countdownDataAttrs(timer: CountdownClockLike): Record<string, string> {
  const beat = countdownVisualBeat(timer);
  return beat === null ? {} : {
    "data-countdown": String(beat),
    "data-countdown-intensity": countdownIntensity(beat),
  };
}

// ── F12 — the server-settled timeout ─────────────────────────────────────

export interface TimeoutSample {
  /**
   * Identity of the settled thing the timeout belongs to — a round, a card, a
   * Daily stage. Null when nothing is settled.
   */
  settledKey: string | null;
  /** The SERVER's word for the viewer on that settlement is a timeout. */
  serverTimedOut: boolean;
}

export interface TimeoutWatch {
  seen: readonly string[];
  baselined: boolean;
}

const MAX_TIMEOUT_KEYS = 64;

export function timeoutEventId(settledKey: string): string {
  return `quiz-timeout:${settledKey}`;
}

/**
 * Announce a timeout exactly once per settled key, and only one that arrived
 * while this observer was watching: the first sample (a reload, a History
 * revisit, a reconnect onto an already-settled round) is a baseline.
 */
export function observeServerTimeout(
  previous: TimeoutWatch | null,
  sample: TimeoutSample,
): { watch: TimeoutWatch; announce: { eventId: string } | null } {
  const key = sample.serverTimedOut ? sample.settledKey : null;
  if (!previous || !previous.baselined) {
    return { watch: { seen: key ? [key] : [], baselined: true }, announce: null };
  }
  if (!key || previous.seen.includes(key)) return { watch: previous, announce: null };
  const seen = [...previous.seen, key].slice(-MAX_TIMEOUT_KEYS);
  return { watch: { seen, baselined: true }, announce: { eventId: timeoutEventId(key) } };
}
