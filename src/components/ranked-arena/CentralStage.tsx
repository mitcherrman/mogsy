/**
 * THE HEADER'S FOCAL DISPLAY (RM1 Pass 2B).
 *
 * One box in the middle of the match header, showing one of three faces:
 *
 *   the clock            0:08
 *   the viewer's result  CORRECT / +2 POINTS
 *   the next module      CHAMPION MASTERY
 *
 * and turning between them.
 *
 * IT IS THE HEADLINE, NOT THE RECORD. The strip's result plate is still here
 * and still persists after its beat, deliberately: POINT1 made it the
 * PREVIOUS-module summary so a player who looked away still sees what the last
 * module was worth, and a display that hands the centre back to the clock
 * after ~1.5s cannot be that. So the plate was demoted rather than deleted —
 * small and quiet, at the strip's right end — and this carries the loud,
 * momentary version of the same fact. Two surfaces with two lifetimes, which
 * is why they do not share an id.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT OWNS ALMOST NO TIME, AND THAT IS DELIBERATE
 * ─────────────────────────────────────────────────────────────────────────
 * Two of the three faces are decided by the mode and not here:
 *
 *   * `result` is non-null for exactly the settlement beat — the mode's
 *     `revealHold`, already sized and already lengthened for a level-up or a
 *     piece of evidence. This component neither starts nor ends it.
 *   * `timer` is the live clock, which the backend owns end to end.
 *
 * The module-name face is the one beat with no existing window, so it holds
 * ONE timeout (`MODULE_TITLE_MS`) and nothing else. It is edge-triggered on
 * the round number — a round opens exactly once, so the id is monotonic — and
 * recorded in a REF, which is what makes it immune to the thing that would
 * otherwise break it: a poll re-render, a reconnect, or a backfill landing
 * mid-beat must not replay a face that has already played.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RESULT CANNOT BE SHOWN TWICE
 * ─────────────────────────────────────────────────────────────────────────
 * `result` is projected from the REVEAL-GATED feedback, so it is null outside
 * the beat by construction rather than by a rule applied here; and the module
 * face is gated on a round number this component has not seen before. Neither
 * can be re-entered by re-rendering, and neither reads the settlement ledger
 * that a reconnect backfills.
 *
 * There is no `LOCKED IN` face. Locking is stated by the duelist columns'
 * answer chips, which is where it belongs — it is a fact about a player, not
 * about the match's clock.
 */
import { useEffect, useRef, useState } from "react";
import { MODULE_TITLE_MS } from "@/lib/ranked-core/centralStage";
import type { CentralStageView } from "@/lib/ranked-core/centralStage";
import type { TimerView } from "@/lib/ranked-core/viewTypes";

const format = (totalSeconds: number): string => {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

export interface CentralStageProps {
  timer: TimerView | null;
  /** The viewer's settled result. Non-null for exactly the reveal beat. */
  result: { verdict: string; points: string } | null;
  /** The name of the round now in play, or null when it published no topic. */
  moduleTitle: string | null;
  /**
   * The round the title names. The module face plays once per NEW value, which
   * is what makes a re-render, a re-poll or a reconnect unable to replay it.
   */
  moduleEventId: number | null;
  /** Accessible name for the region. */
  label?: string;
  /**
   * ARENA1 Step 5's two copy seams, carried forward unchanged.
   *
   * The defaults describe a SHARED PvP round ("of 0:30 shared round", "waiting
   * for the round to resolve"), which is true of a duel and false of a solo
   * run. The Daily Challenge overrides both — it has no opponent to wait for,
   * and telling a player otherwise is the exact fiction that mode is built to
   * avoid. A display that ignored them would have put an opponent back on the
   * Daily's screen, silently.
   */
  durationNote?: (duration: string) => string;
  expiredNote?: string;
}

/**
 * Which face is up. Exported for its own test: the ordering rule — a result
 * outranks a module name, which outranks the clock — is the whole of the
 * sequence and is worth fixing independently of how it is drawn.
 */
export function useCentralStage({
  result, moduleTitle, moduleEventId,
}: Pick<CentralStageProps, "result" | "moduleTitle" | "moduleEventId">): CentralStageView {
  // The round whose title has already had its turn. A REF, not state: writing
  // it must not re-run the effect that schedules the face, which is the same
  // trap `useEntrySting` documents next door.
  const playedFor = useRef<number | null>(null);
  const [titleFor, setTitleFor] = useState<number | null>(null);

  useEffect(() => {
    // A title face is owed when a NEW round has arrived with a name, and the
    // beat that precedes it is over. Holding it back until `result` clears is
    // what keeps the two faces in sequence instead of racing.
    if (result) return;
    if (moduleEventId === null || moduleTitle === null) return;
    if (moduleEventId === playedFor.current) return;
    playedFor.current = moduleEventId;
    setTitleFor(moduleEventId);
    const id = window.setTimeout(() => setTitleFor(null), MODULE_TITLE_MS);
    return () => window.clearTimeout(id);
  }, [result, moduleEventId, moduleTitle]);

  // Precedence, and the reason it is written once: the result is the news, the
  // module name is orientation, the clock is the default.
  if (result) return { kind: "result", verdict: result.verdict, points: result.points };
  if (titleFor !== null && moduleTitle !== null) {
    return { kind: "module", title: moduleTitle };
  }
  return { kind: "timer" };
}

export function CentralStage({
  timer, result, moduleTitle, moduleEventId, label = "Round timer",
  durationNote, expiredNote = "Time's up",
}: CentralStageProps) {
  const stage = useCentralStage({ result, moduleTitle, moduleEventId });
  const expired = timer !== null && timer.remainingSeconds <= 0;
  const urgent = timer?.urgent ?? false;
  return (
    // A FIXED box. Every face is drawn inside the same reserved width and
    // height, so turning between them cannot move the header, the strip's
    // reserved min-height, or anything in the arena below it.
    <section
      aria-label={label}
      // `timer-display` and `timer-value` below are the ids the arena header's
      // clock has always carried. RM1 Pass 2B changed which COMPONENT draws
      // that clock, not that the header has one — and the Daily Challenge,
      // which renders through this same arena, finds its window by them. So
      // the ids travel with the role.
      //
      // `data-stage` is the new fact: this element is a display with more than
      // one face, and which face is up is observable without reading text.
      data-testid="timer-display"
      data-stage={stage.kind}
      className="relative flex h-[4.25rem] min-w-[9rem] flex-col items-center
        justify-center text-center sm:min-w-[11rem] min-[1500px]:h-[5rem]"
    >
      {/* ONE WINDOW, THREE FACES, AND THE SAME TWO LINES EACH.
          The faces used to differ in SHAPE and not only in content: the clock
          was one 48px line with a small note hung underneath the face box, the
          result was a 30px verdict over a 20px award INSIDE it, and the module
          name was a single 20px line with nothing beneath it at all. So the
          display's visual mass collapsed and expanded as it turned — which is
          what read as the header shifting, even though its reserved height
          never moved.

          Now every face is a PRIMARY line and a SECONDARY line in two fixed
          sub-slots. The timer keeps the largest primary, because it is still
          the most important state; the other two are close enough in mass that
          turning between them is a change of content and not of size.

          `key` on the face is the whole of the turn: a new face remounts this
          node, which replays the one-shot flip keyframes in
          `.ranked-stage-face`. Those are transform and opacity, and do not lay
          out — so the animation happens strictly inside this window. */}
      <div key={stage.kind === "result" ? `result:${stage.verdict}` : stage.kind}
        className="ranked-stage-face flex h-full w-full flex-col items-center
          justify-center leading-none">
        {/* PRIMARY — fixed height at every breakpoint, so the tallest glyph any
            face can produce still cannot grow it. */}
        <div className="flex h-12 w-full items-center justify-center
          min-[1500px]:h-[3.75rem]">
          {stage.kind === "timer" && timer && (
            <div
              // `aria-live="off"`: ticking digits would flood a screen reader.
              aria-live="off"
              aria-label={`Time remaining ${format(timer.remainingSeconds)}`}
              data-testid="timer-value"
              data-timer-state={timer.paused ? "paused"
                : expired ? "zero" : urgent ? "urgent" : "running"}
              className={`font-mono text-4xl font-black tabular-nums leading-none
                sm:text-5xl min-[1500px]:text-6xl ${
                expired || urgent ? "text-destructive" : "text-foreground"}`}
            >
              {format(timer.remainingSeconds)}
            </div>
          )}
          {stage.kind === "result" && (
            <span aria-hidden data-testid="central-result-verdict"
              className="truncate text-2xl font-black uppercase tracking-[0.12em]
                sm:text-3xl min-[1500px]:text-4xl">
              {stage.verdict}
            </span>
          )}
          {stage.kind === "module" && (
            <span aria-hidden data-testid="central-module-title"
              className="truncate text-2xl font-black uppercase tracking-[0.14em]
                text-[#e8c97a] sm:text-3xl min-[1500px]:text-4xl">
              {stage.title}
            </span>
          )}
        </div>
        {/* SECONDARY — the same reserved strip on every face, so the line under
            the primary is always in the same place whatever it says. */}
        <div className="flex h-5 w-full items-center justify-center text-center">
          {stage.kind === "timer" && timer && (
            <span className="text-[10px] leading-tight tabular-nums text-muted-foreground">
              {/* PAUSED moved into this slot from a Badge that used to sit
                  UNDER the clock. The badge was the last thing in the display
                  that added its own height when it appeared — a paused round
                  grew the face by a row. It is a state of the clock, so it
                  belongs on the clock's own line. */}
              {timer.paused
                ? <span data-testid="timer-paused">Paused</span>
                : expired
                ? <span role="status" data-testid="central-timer-expired">{expiredNote}</span>
                : durationNote
                  ? durationNote(format(timer.durationSeconds))
                  : `of ${format(timer.durationSeconds)} shared round`}
            </span>
          )}
          {stage.kind === "result" && (
            // `role="status"` announces the result once, as one sentence: the
            // verdict and the award are one fact. It carries the accessible
            // name for BOTH lines, which is why the primary is aria-hidden.
            <span role="status" data-testid="central-result"
              aria-label={`${stage.verdict}, ${stage.points}`}
              className="text-xs font-black tabular-nums tracking-[0.16em] text-[#e8c97a]">
              <span aria-hidden data-testid="central-result-points">{stage.points}</span>
            </span>
          )}
          {stage.kind === "module" && (
            <span aria-hidden
              className="text-[10px] font-bold uppercase tracking-[0.2em]
                text-muted-foreground/70">
              Next module
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
