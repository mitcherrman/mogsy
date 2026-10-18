/**
 * MISC-W2C (F04) — newly earned question cards on a Daily result.
 *
 * "I earned knowledge by playing" applies to a Daily stage as much as to a
 * Ranked match: a Daily stage IS a canonical match (host `daily_challenge`,
 * which collects), so the backend already records what it discovered and
 * serves it from the same participant + terminal gated read Ranked uses. This
 * slot reuses that whole path — `useMatchDiscoveries` for the one read and
 * `DiscoveryReveal` for the ceremony. Nothing here queries, counts or derives
 * a discovery.
 *
 * WHICH MATCH
 * ───────────
 * The id comes from the STAGE THE RESULT IS ABOUT (`stage.childMatchId`, which
 * the backend keeps on a completed stage), never from `currentStage` or the
 * run's active child: by the time a result is on screen the run has already
 * moved on to the next stage, so a "current" pointer names the wrong match.
 *
 * ONLY WHEN SETTLED, ONLY WHEN EARNED
 * ───────────────────────────────────
 * The read is enabled once the result is settled (the parent has seen the
 * child's terminal result, so the child is final). Everything short of "the
 * server named at least one new question" renders NOTHING — no skeleton, no
 * quiet "no new questions" strip, no error plate — so a guest (401), an
 * anonymous session (403), a missing match (404), a transport failure and a
 * stage that simply discovered nothing all leave the result exactly as it was,
 * and the Continue action never waits on this slot.
 *
 * NO LAYOUT JUMP
 * ──────────────
 * The result frames reserve height for everything known before it arrives
 * (DRS1); what a stage discovered is not known until the read returns. The
 * slot therefore opens by growing from zero height (a `grid-template-rows`
 * transition, with a negative margin cancelling the parent's flex gap while
 * closed) rather than appearing at full height, so the content around it eases
 * aside instead of snapping. Reduced motion skips the ease and the hold.
 *
 * SEQUENCED AFTER THE SCORE
 * ─────────────────────────
 * The card ceremony waits `holdMs` after the settle so the completion sting,
 * the score count-up and the score cue have finished; the panel's own cue then
 * sounds under the SAME event id Ranked uses (`ranked:<matchId>:discovery`),
 * so the engine's dedupe — not a second guard here — keeps a re-render,
 * StrictMode or a second mount in one session from replaying it. Mute and
 * unlock are the engine's, as for every other cue.
 */
import { useEffect, useState } from "react";
import { DiscoveryReveal } from "@/components/ranked-arena/DiscoveryReveal";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { MatchDiscoveriesView } from "@/lib/ranked-public/contracts";
import type { DailyStage } from "@/lib/daily-challenge/run/contracts";
import { useMatchDiscoveries } from "@/lib/ranked-core/flow/useMatchDiscoveries";
import { DISCOVERY_PANEL_DENSITY, RESULT_GAP_CANCEL } from "./dailyResultDensity";

/** Stage kinds that can mint a new card. A Review replays the day's misses,
 *  which are already owned by definition, so it never asks. */
export function stageCanDiscover(stage: Pick<DailyStage, "kind">): boolean {
  return stage.kind !== "review";
}

/** Did the server name anything new? The ONLY thing that opens the slot. */
export function hasEarnedDiscoveries(view: MatchDiscoveriesView | null): boolean {
  return view !== null && view.newCount > 0;
}

/** How long a settled result holds before its cards arrive, by surface. */
export const DAILY_DISCOVERY_HOLD_MS = {
  /** After the score has landed (800 ms) and the snapshot has entered (900 ms). */
  mainResult: 1200,
  /** A stage result has no count-up; clear the completion sting (~520 ms). */
  stageResult: 600,
} as const;

export function DailyDiscoveries({
  stage, settled, holdMs, onReview,
}: {
  /** The stage the result is about. */
  stage: DailyStage;
  /** The result is final (the parent has stated it). The read waits for this. */
  settled: boolean;
  holdMs: number;
  /** Into REVIEW → OWNED. Owned by the page, as every other navigation is. */
  onReview: () => void;
}) {
  const reducedMotion = useReducedMotionPreference();
  const matchId = settled && stage.status === "completed" && stageCanDiscover(stage)
    ? stage.childMatchId : null;
  const { view } = useMatchDiscoveries(matchId ?? "", matchId !== null);

  // The hold runs from the settle, not from the answer, so a fast read does
  // not land its cards on top of the score and a slow one adds no extra wait.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (matchId === null) { setHeld(false); return; }
    if (reducedMotion || holdMs <= 0) { setHeld(true); return; }
    setHeld(false);
    const timer = window.setTimeout(() => setHeld(true), holdMs);
    return () => window.clearTimeout(timer);
  }, [matchId, holdMs, reducedMotion]);

  const open = held && hasEarnedDiscoveries(view);

  // Mount closed, open on the next frame, so the grow is a transition and not
  // a first paint. Skipped under reduced motion.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!open) { setExpanded(false); return; }
    if (reducedMotion) { setExpanded(true); return; }
    const frame = window.requestAnimationFrame(() => setExpanded(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open, reducedMotion]);

  if (!open || view === null) return null;
  return (
    <div
      data-testid="daily-discoveries"
      data-match-id={view.matchId}
      data-expanded={expanded ? "true" : "false"}
      className={`grid transition-[grid-template-rows,margin,opacity] duration-300 ease-out
        motion-reduce:transition-none ${DISCOVERY_PANEL_DENSITY} ${expanded
          ? "grid-rows-[1fr] opacity-100" : `${RESULT_GAP_CANCEL} grid-rows-[0fr] opacity-0`}`}
    >
      <div className="min-h-0 overflow-hidden">
        <DiscoveryReveal view={view} ceremony onReview={onReview} />
      </div>
    </div>
  );
}
