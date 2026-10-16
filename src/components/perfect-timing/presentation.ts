/**
 * PERFECT TIMING — presentation helpers. Pure functions over the view model:
 * copy, number formatting and the reveal rail's geometry.
 *
 * NOTHING HERE GRADES. Every tier, every point and every error is read from
 * the server's reveal; these functions only decide how to print it. There is
 * deliberately no tolerance band and no points curve in this file — those
 * constants live in the backend's `scoring.py`, and a copy here would go stale
 * the first time the owner tunes them.
 */
import type { PtPhase, PtRevealView, PtRoundView, PtRunSummary, PtTier } from "@/lib/perfect-timing/viewModel";

// ------------------------------------------------------------------ tiers

export const TIER_WORD: Record<PtTier, string> = {
  perfect: "Perfect",
  great: "Great",
  good: "Good",
  miss: "Miss",
};

/** A miss is the only tier the product treats as "not landed". */
export const tierIsHit = (tier: PtTier): boolean => tier !== "miss";

/** The one of the two existing verdict cues a tier plays (handoff §4.4). */
export const tierSfx = (tier: PtTier): "ranked.answer.correct" | "ranked.answer.incorrect" =>
  tierIsHit(tier) ? "ranked.answer.correct" : "ranked.answer.incorrect";

// --------------------------------------------------------------- numbers

/** Milliseconds as seconds with two places: 6830 → "6.83 s". */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

/** An integer millisecond count: 170 → "170 ms". */
export function formatMs(ms: number): string {
  return `${Math.round(Math.abs(ms)).toLocaleString()} ms`;
}

export type ErrorDirection = "early" | "late" | "exact";

export function errorDirection(errorMs: number): ErrorDirection {
  if (errorMs < 0) return "early";
  if (errorMs > 0) return "late";
  return "exact";
}

/** "170 ms early" · "40 ms late" · "Exact". */
export function signedErrorText(errorMs: number): string {
  const dir = errorDirection(errorMs);
  return dir === "exact" ? "Exact" : `${formatMs(errorMs)} ${dir}`;
}

// ------------------------------------------------------------------ copy

/** "Rank 2 / 3", or "Any rank" for a rank-invariant ability. */
export function rankText(rank: number | null, rankCount: number): string {
  return rank === null ? "Any rank" : `Rank ${rank} / ${rankCount}`;
}

/** The reveal's rank, which has no count beside it: "rank 3", or "any rank". */
export function revealRankText(rank: number | null): string {
  return rank === null ? "any rank" : `rank ${rank}`;
}

/** "Ahri R · Spirit Rush" */
export function roundLabel(round: PtRoundView): string {
  return `${round.championName} ${round.slot} · ${round.abilityName}`;
}

export function patchSourceLabel(source: string): string {
  switch (source) {
    case "patch_operations": return "Patch Ops";
    case "patch_notes_ingestion_fallback": return "patch-notes fallback";
    case "unknown": return "source unknown";
    default: return source;
  }
}

/** The data line the results screen must show: label WITH its source. */
export function dataLabelText(patchLabel: string | null, patchSource: string): string {
  const source = patchSourceLabel(patchSource);
  return patchLabel ? `Data: ${patchLabel} (${source})` : `Data: patch unknown (${source})`;
}

/**
 * What the seal and the status line say in each phase. No word here carries a
 * digit, so the stage stays digit-free while the clock is running; the only
 * number on the stage is the rank, which the round plate prints itself.
 */
export interface PhaseFace {
  /** The seal's word, in Cinzel. */
  word: string;
  /** The small line under the word. */
  sub: string;
  /** The status line under the seal. */
  status: string;
  /** Colour intent for the status line. */
  tone: "plain" | "warn";
}

export const PHASE_FACE: Record<PtPhase, PhaseFace> = {
  loading: { word: "Dealing", sub: "the archive is choosing", status: "Dealing the next ability.", tone: "plain" },
  armed: { word: "Cast", sub: "press to cast", status: "Press to cast. Then feel the cooldown run.", tone: "plain" },
  running: { word: "Cooldown", sub: "press when it is back", status: "Press the moment the ability is back up.", tone: "plain" },
  stopped: { word: "Locked", sub: "your stop is in", status: "Locked. Checking the archive.", tone: "plain" },
  submitting: { word: "Locked", sub: "checking the archive", status: "Locked. Checking the archive.", tone: "plain" },
  revealed: { word: "Revealed", sub: "the archive has spoken", status: "", tone: "plain" },
  interrupted: { word: "Voided", sub: "run interrupted", status: "Run interrupted. This round is voided.", tone: "warn" },
  error: { word: "Halted", sub: "something went wrong", status: "The round could not be recorded.", tone: "warn" },
  complete: { word: "Complete", sub: "the run is over", status: "Run complete.", tone: "plain" },
};

/** The press surface accepts input only in these phases. Presentation only: PT2's hook is the authority. */
export const PRESS_LIVE_PHASES: ReadonlySet<PtPhase> = new Set<PtPhase>(["armed", "running"]);

// ------------------------------------------------------------------ rail

/** Candidate rail ends, in seconds. The rail runs 0 → the first one past the data. */
const DOMAIN_STEPS_S = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240, 300, 450, 600];
/** Candidate notch spacings, in seconds. */
const TICK_STEPS_S = [0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30, 60, 120];

export interface RailGeometry {
  /** The rail's right end, in ms. */
  domainMs: number;
  /** Notch spacing, in ms. */
  tickMs: number;
  /** Notches as a share of the rail (0..100), excluding the ends. */
  tickPcts: number[];
  /** 0..100 — where the true cooldown sits. */
  truePct: number;
  /** 0..100 — where the player's stop sits. Always inside: the rail ends past the longer duration. */
  youPct: number;
  /** The rail's end as a label: "10 s". */
  endLabel: string;
}

/**
 * The reveal rail runs from zero to a round number just past the longer of
 * the two durations, so the true cooldown always sits inside the picture and
 * the stop is never drawn off the edge for an ordinary miss.
 */
export function railGeometry(reveal: Pick<PtRevealView, "targetMs" | "elapsedMs">): RailGeometry {
  const longest = Math.max(reveal.targetMs, reveal.elapsedMs, 1);
  const rawEndS = (longest * 1.12) / 1000;
  const endS = DOMAIN_STEPS_S.find((s) => s >= rawEndS) ?? Math.ceil(rawEndS);
  const domainMs = endS * 1000;
  const tickS = TICK_STEPS_S.find((t) => endS / t <= 8) ?? endS;
  const tickMs = tickS * 1000;
  const tickPcts: number[] = [];
  for (let t = tickMs; t < domainMs - 1; t += tickMs) tickPcts.push((t / domainMs) * 100);
  const pct = (ms: number) => Math.min(100, Math.max(0, (ms / domainMs) * 100));
  return {
    domainMs,
    tickMs,
    tickPcts,
    truePct: pct(reveal.targetMs),
    youPct: pct(reveal.elapsedMs),
    endLabel: `${Number.isInteger(endS) ? endS : endS.toFixed(1)} s`,
  };
}

// ---------------------------------------------------------------- summary

export interface RunStats {
  /** Rounds dealt. */
  dealt: number;
  /** Rounds with a server reveal. */
  played: number;
  /** Rounds with no reveal (interrupted, expired). */
  voided: number;
  perfect: number;
  /** Tier other than miss. */
  hits: number;
  /** Sum of the reveals' points — the one sum the results component makes. */
  totalPoints: number;
  maxPoints: number;
  /** Mean absolute error over played rounds, or null when none were played. */
  meanAbsErrorMs: number | null;
  /** Smallest absolute error, or null. */
  bestAbsErrorMs: number | null;
}

export function runStats(summary: PtRunSummary): RunStats {
  const reveals = summary.rounds.map((r) => r.reveal).filter((r): r is PtRevealView => r !== null);
  const played = reveals.length;
  const totalPoints = reveals.reduce((sum, r) => sum + r.points, 0);
  const absErrors = reveals.map((r) => r.absErrorMs);
  return {
    dealt: summary.rounds.length,
    played,
    voided: summary.rounds.length - played,
    perfect: reveals.filter((r) => r.tier === "perfect").length,
    hits: reveals.filter((r) => tierIsHit(r.tier)).length,
    totalPoints,
    maxPoints: summary.rounds.length * 100,
    meanAbsErrorMs: played ? Math.round(absErrors.reduce((a, b) => a + b, 0) / played) : null,
    bestAbsErrorMs: played ? Math.min(...absErrors) : null,
  };
}

/** A round end for the results ladder's shared error scale, in ms. */
export function ladderScaleMs(summary: PtRunSummary): number {
  const worst = Math.max(0, ...summary.rounds.map((r) => r.reveal?.absErrorMs ?? 0));
  const steps = [100, 250, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000, 60000];
  return steps.find((s) => s >= worst) ?? Math.max(worst, 1);
}
