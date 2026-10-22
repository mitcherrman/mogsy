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
import type { CountInBeat } from "@/lib/perfect-timing/countIn";
import type { PtPhase, PtRevealView, PtRoundView, PtRunSummary, PtSliceKind, PtTier } from "@/lib/perfect-timing/viewModel";

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
 * digit. PT5.2: the chronometer prints the elapsed time itself; `word` is its
 * state plate (CAST / PRESS TO STOP / LOCKED / VOIDED).
 */
export interface PhaseFace {
  /** The seal's word. */
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
  armed: { word: "Cast", sub: "press to cast", status: "Press to cast. Stop the clock when the ability is back up.", tone: "plain" },
  countdown: { word: "Get ready", sub: "the game casts it", status: "Get ready. It casts on its own — stop the clock when the ability is back up.", tone: "plain" },
  running: { word: "Press to stop", sub: "press when it is back", status: "Press the moment the ability is back up.", tone: "plain" },
  stopped: { word: "Locked", sub: "your stop is in", status: "Locked. Checking the archive.", tone: "plain" },
  submitting: { word: "Locked", sub: "checking the archive", status: "Locked. Checking the archive.", tone: "plain" },
  revealed: { word: "Revealed", sub: "the archive has spoken", status: "", tone: "plain" },
  interrupted: { word: "Voided", sub: "run interrupted", status: "Run interrupted. This round is voided.", tone: "warn" },
  error: { word: "Halted", sub: "something went wrong", status: "The round could not be recorded.", tone: "warn" },
  complete: { word: "Complete", sub: "the run is over", status: "Run complete.", tone: "plain" },
};

/**
 * PT5.2: the status line once stopped, with the time the player locked (the
 * engine's submitted integer, printed exactly as the reveal's "You" is). The
 * same text while stopped and submitting, so it is announced once.
 */
export function lockedStatusText(elapsedMs: number): string {
  return `Locked at ${formatSeconds(elapsedMs)}. Checking the archive.`;
}

/**
 * PT5.2: the frozen chronometer stays on screen at least this long after the
 * stop before the reveal replaces it, so the lock reads. Presentation only.
 */
export const LOCK_HOLD_MS = 420;

// --------------------------------------------------------- PT5.3 blind flow

/**
 * PT5.3: the blind flow's own words where they differ from `PHASE_FACE`. The
 * chronometer shows no elapsed time while the round runs, so nothing here (or
 * anywhere on the running stage) is a number.
 */
export const BLIND_FACE: Partial<Record<PtPhase, PhaseFace>> = {
  countdown: PHASE_FACE.countdown,
  running: { word: "Press to stop", sub: "press when it is back", status: "Press the moment the ability is back up.", tone: "plain" },
};

/** PT5.3: a count-in the player put on hold (between attempts only). */
export const HELD_FACE: PhaseFace = {
  word: "Held", sub: "on hold", status: "On hold. Resume when you are ready — the count-in starts again from 3.", tone: "plain",
};

/** PT5.3: what the centre of the blind instrument shows (count-in beat, pause, still face, locked time, voided). */
export type BlindReadout = "idle" | "count" | "held" | "blind" | "locked" | "halted";

export function blindReadoutFor(phase: PtPhase, held: boolean, countIn: CountInBeat | null, elapsedMs: number | null): BlindReadout {
  if (phase === "countdown") return held ? "held" : countIn !== null ? "count" : "idle";
  if (phase === "running") return "blind";
  if ((phase === "stopped" || phase === "submitting" || phase === "error") && elapsedMs !== null) return "locked";
  if (phase === "interrupted" || phase === "error") return "halted";
  return "idle";
}

/** The word the instrument flashes as the game starts the round. */
export const CAST_WORD = "Cast";

/**
 * PT5.3 pacing (initial playtest values, handoff PT53 §A — tune here only).
 * The reveal moves on by itself this long AFTER its choreography has settled
 * (≈ 1.7 s), so a result stays readable for the whole dwell; a Mastery Slice
 * transition moves on this long after its entrance is ready (≈ 0.9 s).
 * The count-in itself is `COUNT_IN_MS` (lib/perfect-timing/countIn.ts).
 */
export const REVEAL_DWELL_MS = 2_500;
export const TRANSITION_DWELL_MS = 1_500;

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

// ------------------------------------------------------------ PT5 slices

/** The stage's name on the plate, the reveal and the results. */
export const SLICE_STAGE_WORD: Record<PtSliceKind, string> = {
  foundation: "Foundation",
  rank_up: "Rank up",
  equipped: "Equipped",
};

/** Milliseconds as seconds with three places, for the haste arithmetic: 4545 → "4.545 s", 4545.4545 → "4.545 s". */
export function formatSecondsExact(ms: number): string {
  return `${(Math.round(ms) / 1000).toFixed(3)} s`;
}

/**
 * A slice duration at the precision the server graded it: two places when the
 * millisecond count is a multiple of ten (5000 → "5.00 s"), three when it is
 * not (4545 → "4.545 s"). Integer arithmetic, so 4545 can never print as
 * "4.54" (`(4.545).toFixed(2)` rounds the binary value down).
 */
export function formatSliceSeconds(ms: number): string {
  const n = Math.round(Math.abs(ms));
  const whole = Math.trunc(n / 1000);
  const frac = String(n % 1000).padStart(3, "0");
  return `${ms < 0 ? "−" : ""}${whole}.${n % 10 === 0 ? frac.slice(0, 2) : frac} s`;
}

/** A change between two server durations, signed: −500 → "−0.50 s", −455 → "−0.455 s". */
export function deltaSecondsText(fromMs: number, toMs: number): string {
  const d = toMs - fromMs;
  const sign = d < 0 ? "−" : d > 0 ? "+" : "±";
  return `${sign}${formatSliceSeconds(Math.abs(d))}`;
}

/** "+10 Ability Haste" (or "+10 AH" short). */
export function hasteText(haste: number, short = false): string {
  const n = Number.isInteger(haste) ? String(haste) : haste.toFixed(1);
  return short ? `+${n} AH` : `+${n} Ability Haste`;
}

/** The slice's stated scenario, as one quiet phrase. */
export function assumptionText(assumption: string): string {
  return assumption === "no_cooldown_refunds" ? "cast without cooldown refunds" : assumption.replace(/_/g, " ");
}

/** The slice's lesson in one line, from revealed truths only. Null when nothing was revealed to compare. */
export function sliceStory(summary: PtRunSummary): string | null {
  const [f, r, e] = summary.rounds;
  const parts: string[] = [];
  // Rank 3's base: stage 2's truth, or stage 3's released base when stage 2 was voided.
  const rank3 = r?.reveal?.targetMs ?? e?.reveal?.slice?.baseCooldownMs ?? null;
  if (f?.reveal && rank3 !== null) parts.push(`Rank 1 → ${r?.round.rank ?? 3}: ${deltaSecondsText(f.reveal.targetMs, rank3)}`);
  const item = e?.reveal?.slice?.item;
  if (e?.reveal && item) parts.push(`${item.name} ${hasteText(item.abilityHaste, true)}: ${deltaSecondsText(e.reveal.slice!.baseCooldownMs, e.reveal.targetMs)}`);
  return parts.length ? parts.join(" · ") : null;
}

// --------------------------------------------------- PT5.1 stage transitions

/** The between-stage headline: the ability ranked up, or an item was equipped. */
export const TRANSITION_TITLE: Record<Exclude<PtSliceKind, "foundation">, string> = {
  rank_up: "Rank up",
  equipped: "Item equipped",
};

/**
 * What the transition says happened to the cooldown. "Reduced" only when the
 * stage's item brings ability haste (positive haste always shortens the
 * cooldown); a rank step is only "changed", because the certified progression
 * does not promise a direction and the transition names no number.
 */
export function cooldownChangeText(kind: PtSliceKind, abilityHaste: number): string {
  return kind === "equipped" && abilityHaste > 0 ? "Cooldown reduced" : "Cooldown changed";
}

export const ADJUST_TIMING_TEXT = "Adjust your timing";

/** How long the transition's entrance takes to show the headline and the change, with motion allowed. */
export const TRANSITION_READY_MS = 900;
/** Under reduced motion the frame is complete at once; a key-up still has to pass. */
export const TRANSITION_READY_REDUCED_MS = 250;

/** The stage kinds that have a transition: the two that change an input. */
export function hasTransition(kind: PtSliceKind | undefined): kind is "rank_up" | "equipped" {
  return kind === "rank_up" || kind === "equipped";
}

/** "Rank 1 → Rank 3". */
export function rankStepText(from: number, to: number): string {
  return `Rank ${from} → Rank ${to}`;
}
