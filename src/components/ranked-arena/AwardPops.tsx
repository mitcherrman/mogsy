/**
 * THE TRANSIENT POINT AWARDS (RM1 Pass 2B).
 *
 * The floating `+2` — and, a moment later, the separate `+1` when the server
 * awarded a speed bonus — that rise through a duelist banner when a module
 * pays out. They are FEEDBACK, not record: they appear, they rise, they are
 * gone. The durable statement is the history bubble, which is still there
 * after the animation has finished.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO POPS AND NOT ONE, FOR THE REASON THE BUBBLE PRINTS ONLY THE BASE
 * ─────────────────────────────────────────────────────────────────────────
 * The base is what knowing the answer earned; the bonus is what being quick
 * added. A single `+3` erases which half the player has any control over, and
 * the whole of RP1's product sentence is that they are different things. So
 * the base lands first and loudest, and the bonus follows it as a smaller,
 * later, visually secondary mark.
 *
 * NOTHING HERE ADDS THEM UP, and nothing here reads a score. The numbers are
 * `basePoints` and `speedBonusPoints` off the settlement, and the total the
 * column shows is `scoreAfter` from the same settlement — the engine's own
 * figure, which this component neither derives nor checks.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT CANNOT DOUBLE-COUNT, AND WHY THAT IS A REF AND NOT STATE
 * ─────────────────────────────────────────────────────────────────────────
 * Every pop carries an `id` that names the EVENT it belongs to, not the value
 * it shows: a module's award is `award:<playerId>:<roundNumber>` and a Meta
 * Reflex card is `card:<blockKey>:<challengeIndex>`. A round settles once and a
 * card settles once, so both are stable and monotonic.
 *
 * The ids already played are kept in a ref. That is what makes this safe under
 * the three things that would otherwise replay an award:
 *
 *   * an ordinary poll re-render, which produces the same award object again;
 *   * a RECONNECT, where the resume path re-reads the match;
 *   * a BACKFILL, which inserts settled rounds this client never watched —
 *     and which deliberately sets no `lastResolved` and starts no reveal hold,
 *     so it never reaches this component at all.
 *
 * A ref and not state because recording "I have played this" must not itself
 * re-render, and must not be a dependency of the effect that schedules the
 * pop — the same trap `useEntrySting` documents.
 */
import { useEffect, useRef, useState } from "react";
import { Zap } from "lucide-react";

/** One payout, as the settlement stated it. */
export interface AwardEvent {
  /** Names the settled EVENT. A round/card settles once, so it is stable. */
  id: string;
  /** What correctness earned. Shown first. */
  basePoints: number;
  /** What the SERVER awarded for speed. 0 is the common case. */
  speedBonusPoints: number;
  /** Suppress the base pop — it has already been paid out incrementally. */
  baseAlreadyShown?: boolean;
}

/**
 * How long one pop lives. Short: it is a beat, not a scene.
 *
 * Sized against the settlement hold it plays inside (`REVEAL_HOLD_MS`, ~1.5s):
 * the base runs 0–900ms and the bonus 380–1180ms, so the whole payout has
 * finished before the next question opens. A pop still on screen when the
 * clock restarts would be labelling the wrong module.
 */
export const POP_MS = 900;
/** How long after the base the bonus follows it. */
export const BONUS_DELAY_MS = 380;

interface ActivePop { key: string; kind: "base" | "bonus"; points: number }

/**
 * Turn a stream of settled awards into the pops currently on screen.
 *
 * Exported for its own test: "an award plays exactly once, whatever the caller
 * re-renders" is the property that matters here, and it is a property of this
 * function rather than of the markup.
 */
export function useAwardPops(event: AwardEvent | null): ActivePop[] {
  const played = useRef(new Set<string>());
  const [pops, setPops] = useState<ActivePop[]>([]);

  useEffect(() => {
    if (!event) return;
    if (played.current.has(event.id)) return;
    played.current.add(event.id);

    const timers: number[] = [];
    const add = (pop: ActivePop) => {
      setPops((current) => [...current, pop]);
      timers.push(window.setTimeout(
        () => setPops((c) => c.filter((p) => p.key !== pop.key)), POP_MS));
    };

    // The base. Suppressed only when this column has ALREADY been paid it out
    // card by card — a Meta Reflex block, where five `+1`s have run — because
    // popping the block's `+4` after them would show the same points twice.
    if (!event.baseAlreadyShown) {
      add({ key: `${event.id}:base`, kind: "base", points: event.basePoints });
    }
    // The premium, and ONLY when the server awarded one. `> 0` is the server's
    // own answer; no timing comparison is made here or anywhere in this file.
    if (event.speedBonusPoints > 0) {
      const bonus: ActivePop = {
        key: `${event.id}:bonus`, kind: "bonus", points: event.speedBonusPoints,
      };
      timers.push(window.setTimeout(() => add(bonus),
        event.baseAlreadyShown ? 0 : BONUS_DELAY_MS));
    }
    return () => { for (const t of timers) window.clearTimeout(t); };
  }, [event]);

  return pops;
}

export function AwardPops({
  event, playerId, mirrored,
}: {
  event: AwardEvent | null;
  playerId: string;
  /** The opponent's pops rise on the opponent's side of its own banner. */
  mirrored: boolean;
}) {
  const pops = useAwardPops(event);
  return (
    // ABSOLUTELY POSITIONED, and that is load-bearing: a pop that took layout
    // would shove the history strip and the verdict row on every settled
    // module of a ten-module match. `pointer-events: none` so the column stays
    // as clickable as it was — the mascot below is interactive.
    //
    // It occupies the banner's open middle — the space Pass 2A deliberately
    // left between the history strip and the status row — so the awards have
    // somewhere to travel that is not over the top of anything.
    <div aria-hidden data-testid={`award-pops-${playerId}`}
      className={`pointer-events-none absolute inset-x-2 bottom-16 z-20 flex flex-col
        ${mirrored ? "items-end" : "items-start"}`}>
      {pops.map((pop) => (
        <span key={pop.key} data-testid={`award-pop-${pop.kind}-${playerId}`}
          data-points={String(pop.points)}
          className={pop.kind === "base"
            // The base: loud, gold, the size of news.
            ? "ranked-award-pop absolute text-3xl font-black tabular-nums text-[#e8c97a]"
            // The premium: smaller, carrying its own bolt, and visibly a
            // second thing rather than part of the first.
            : "ranked-award-pop ranked-award-pop--bonus absolute inline-flex items-center gap-0.5 rounded bg-[#e8c97a]/15 px-1 text-base font-black tabular-nums text-[#e8c97a]"}
        >
          {pop.kind === "bonus" && <Zap aria-hidden className="h-3 w-3 shrink-0" />}
          {`+${pop.points}`}
        </span>
      ))}
    </div>
  );
}
