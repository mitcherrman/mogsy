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
  /** PT5: present only in a Mastery Slice — the stage, and what changed since the last one. */
  slice?: PtSliceStageView | null;
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
  /** PT5: present only in a Mastery Slice — the comparison and the haste arithmetic. */
  slice?: PtSliceRevealView | null;
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

// ---------------------------------------------------------------------------
// §3 — PT5 Mastery Slice extras (additive; absent in a Random Run).
// ---------------------------------------------------------------------------

export type PtSliceKind = "foundation" | "rank_up" | "equipped";

/** The equipment stage's item, as the deal names it (canonical name, id, haste). */
export interface PtSliceItemView {
  itemId: number;
  name: string;
  abilityHaste: number;
  /** Mogzy's item art (`assets/items/{id}.png`); null draws the name alone. */
  iconUrl: string | null;
}

/** What the stage plate says about the slice before the stop. No duration. */
export interface PtSliceStageView {
  kind: PtSliceKind;
  /** 1-based. */
  stage: number;
  total: number;
  abilityHaste: number;
  item: PtSliceItemView | null;
  /** The previous stage's public inputs (rank, item), so the change can be named. Null on the first stage. */
  previous: { kind: PtSliceKind; rank: number; item: PtSliceItemView | null } | null;
}

/** What a slice reveal adds: the server's arithmetic and the change from the last stage. */
export interface PtSliceRevealView {
  kind: PtSliceKind;
  stage: number;
  /** The rank's base cooldown (ms), from the release. */
  baseCooldownMs: number;
  abilityHaste: number;
  /** The exact reduced value, as the server prints it ("4545.4545"). */
  exactMs: string;
  item: PtSliceItemView | null;
  /**
   * The previous stage's TRUE cooldown — only when that stage was legitimately
   * revealed (locked). A voided previous stage leaves this null.
   */
  previous: { kind: PtSliceKind; rank: number; targetMs: number } | null;
  /** The scenario the slice states, e.g. "no_cooldown_refunds". */
  assumption: string;
}
