/**
 * PERFECT TIMING — the view-model contract between the presentational layer
 * (PT1, `src/components/perfect-timing/**`), the timing engine (PT2,
 * `useTimingEngine`) and the page that orchestrates both (PT4).
 *
 * The shapes in §1 are the agreed interfaces from
 * `docs/perfect-timing/PERFECT_TIMING_HANDOFF.md` §4.2, verbatim. They are
 * the only thing PT1 consumes: nothing here knows a URL, a contract string or
 * a clock. Every number in a reveal is the SERVER's — the client never grades.
 *
 * §2 is PT1's additive presentation surface (flank content, the arena wrapper's
 * stage model). PT4 fills it from the same wire payloads; nothing in it is
 * required, and every absent field renders nothing.
 */
import type React from "react";

// ---------------------------------------------------------------------------
// §1 — agreed contracts (handoff §4.2). Do not change without updating the
// handoff in the same PR.
// ---------------------------------------------------------------------------

export type PtPhase =
  | "loading"
  | "armed"
  | "running"
  | "stopped"
  | "submitting"
  | "revealed"
  | "interrupted"
  | "error"
  | "complete";

export type PtSlot = "Q" | "W" | "E" | "R";

export type PtTier = "perfect" | "great" | "good" | "miss";

export interface PtRoundView {
  roundId: string;
  championName: string;
  abilityName: string;
  slot: PtSlot;
  /** Null when the ability is rank-invariant: the UI says "any rank". */
  rank: number | null;
  rankCount: number;
  /** PT4 fills via `getAbilityIconUrl()`; null draws the slot monogram. */
  iconUrl: string | null;
  /** PT4.4: the champion's splash art from Mogzy's asset manifest; null/absent draws the ability icon alone. */
  splashUrl?: string | null;
  /** 1-based position in the run. */
  index: number;
  total: number;
}

export interface PtRevealView {
  elapsedMs: number;
  targetMs: number;
  /** `elapsedMs - targetMs`. Negative means early. */
  errorMs: number;
  absErrorMs: number;
  relativeError: number;
  tier: PtTier;
  /** 0..100, the server's. */
  points: number;
  /** False when the server's window could not contain this elapsed time. */
  plausible: boolean;
  /** The authority's own progression text, e.g. "7 / 7 / 7 / 7 / 7". */
  cooldownRaw: string;
  rank: number | null;
}

/**
 * Produced by PT2's hook and spread onto ONE element — the press surface.
 * PT1 never adds a second handler for the same gesture.
 */
export interface PtPressSurfaceProps {
  onPointerDown: React.PointerEventHandler;
  onKeyDown: React.KeyboardEventHandler;
  tabIndex: 0;
  role: "button";
  "aria-label": string;
  "aria-disabled": boolean;
}

export interface PtRunSummary {
  rounds: { round: PtRoundView; reveal: PtRevealView | null }[];
  totalPoints: number;
  patchLabel: string | null;
  /** `patch_operations | patch_notes_ingestion_fallback | unknown`. */
  patchSource: string;
}

// ---------------------------------------------------------------------------
// §2 — PT1 presentation extras (additive; PT4 fills, nothing is required).
// ---------------------------------------------------------------------------

/**
 * What the arena's flanks and round rail say about the run so far. Everything
 * here is a fact PT4 already holds (the dealt rounds, the settled reveals);
 * nothing is computed by the stage.
 */
export interface PtRunHud {
  /** Points settled so far, or null before the first reveal. */
  pointsSoFar: number | null;
  /**
   * One entry per round in deal order: the settled tier, `"voided"` for an
   * interrupted or expired round, or null while unplayed.
   */
  outcomes: (PtTier | "voided" | null)[];
  patchLabel: string | null;
  patchSource: string;
}

/**
 * The lab arena's stage model — everything the arena's viewport draws. The
 * page owns every value; the arena only reads it.
 */
export interface PtStageModel {
  /** Null while the first deal is in flight. */
  round: PtRoundView | null;
  phase: PtPhase;
  press: PtPressSurfaceProps;
  /** Overrides the phase's default status line (an error message, say). */
  statusText?: string | null;
  /** Non-null exactly while `phase === "revealed"`. */
  reveal: PtRevealView | null;
  /** Advance past the reveal. `"key"` when Space/Enter did it (PT4.4: the page then guards the next round's keys briefly). */
  onNext: (source?: "key") => void;
  /** Flank and round-rail content; absent flanks draw the quiet defaults. */
  hud?: PtRunHud | null;
}
