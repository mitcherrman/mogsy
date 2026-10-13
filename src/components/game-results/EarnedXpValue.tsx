/**
 * MPE — THE EARNED-XP FIGURE: a settled Academy XP gain, counted up and landed.
 *
 * WHAT MAY BE PASSED HERE
 * ───────────────────────
 * `amount` is a GAIN the adapter stated explicitly (`ResultProgressItem.delta`
 * on an `xp` item, greater than zero). It is never an account total, never
 * the in-match level XP, and never a difference the client worked out between
 * two totals — `isEarnedXp` in `ResultProgress` is the one predicate that
 * decides, and the adapters (`sessionResults`, `rankedResultsModel`) are what
 * decide whether they can say it at all. Ranked currently cannot (only
 * per-round XP exists in a log that may have gaps) and so never does; a
 * practice session can, from the per-answer awards the backend settled.
 *
 * WHAT IT DOES
 * ────────────
 * Counts from 0 to `amount` in ~640 ms after `delayMs`, prints the adapter's
 * own `value` string verbatim once the count lands, bumps once on landing
 * (CSS, `data-landed`), and plays the earned-XP cue as the count begins so
 * the sound's confirmation note (at ~0.6 s) lands with the number. Reduced
 * motion prints the final value at once. A screen reader hears the final
 * value only, never the intermediate ticks.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import { useSfx } from "@/lib/audio/useSfx";
import { useCountUp } from "./useCountUp";

export const EARNED_XP_COUNT_MS = 640;

export function EarnedXpValue({ amount, value, delayMs = 0, soundEventId, className = "" }: {
  /** The settled gain, as the adapter stated it. The caller guarantees > 0. */
  amount: number;
  /** The adapter's final text ("+80 XP"), printed verbatim once the count lands. */
  value: string;
  /** When the count (and the cue) begins, relative to mount. */
  delayMs?: number;
  /**
   * A stable identity for the cue when the caller has one; the engine renders
   * an id at most once per session. Without one, the registry's replay window
   * still absorbs StrictMode's double mount.
   */
  soundEventId?: string;
  className?: string;
}) {
  const reducedMotion = useReducedMotionPreference();
  const count = useCountUp(amount, {
    durationMs: EARNED_XP_COUNT_MS, delayMs, animate: !reducedMotion,
  });
  const sfx = useSfx();
  const sounded = useRef(false);
  useEffect(() => {
    if (!count.started || sounded.current) return;
    sounded.current = true;
    sfx.play("reward.xp.earned", soundEventId ? { eventId: soundEventId } : undefined);
  }, [count.started, sfx, soundEventId]);

  const running = `${amount > 0 ? "+" : ""}${count.value.toLocaleString()} XP`;
  return (
    <span
      data-earned-xp="true"
      data-landed={count.done ? "true" : "false"}
      className={`reward-xp-value ${className}`}
    >
      {/* Width is reserved for the final text, so the row does not shift as
          the digits grow. */}
      <span aria-hidden className="reward-xp-value__figure text-right tabular-nums"
        style={{ minWidth: `${value.length}ch` } as CSSProperties}>
        {count.done ? value : running}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
