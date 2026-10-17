/**
 * PGM1 — THE REUSABLE LAUNCH CONTRACT: what a mode card may offer, decided once.
 *
 * `resolveModeAction(entry, daily)` is the ONE place a More Challenges card
 * learns whether it may draw a Play button and where that button goes. Cards
 * render the answer and decide nothing. A Play action exists only when the
 * server published a launch this client can carry out AND the player's own
 * state allows it; an approved mode with no public launch is `coming_soon`.
 *
 * Phase 1 carries out one launch kind:
 *
 *   daily_stage   Time Trial / Survival are stages of today's Daily run (plan
 *                 v5+: after the main Standard). Play continues the run into
 *                 that stage through the existing Daily page, which owns the
 *                 run, the match and its result. The stages play in the
 *                 server's frozen order, so a stage that is not the run's
 *                 current one says what it waits for instead of offering Play.
 *
 * Phase 2 adds `ranked_match` and `session` here (a public start route each,
 * answering a match id or a session), and nothing on the cards changes.
 */
import type { DailyRun } from "@/lib/daily-challenge/run/contracts";
import { currentStage, hasMainDaily, isMainDailyComplete } from "@/lib/daily-challenge/run/contracts";
import { DAILY_CONTINUE_STATE, DAILY_START_STATE } from "@/lib/daily-challenge/run/entry";
import { stageIdentity } from "@/lib/daily-challenge/run/stageIdentity";
import type { PublicModeEntry, PublicModeId } from "./contracts";

export const MORE_CHALLENGES_ROUTE = "/quiz/more-challenges";
export const DAILY_CHALLENGE_ROUTE = "/quiz/daily-challenge";

/** PGM2 — the public page of a specialized-session mode. */
export const sessionModeRoute = (id: PublicModeId) => `${MORE_CHALLENGES_ROUTE}/${id}`;

/**
 * PGM2 — router state the catalog's Play puts beside a bonus game's match id
 * when it hands the match to `/quiz/ranked` (the Journey Library pattern).
 * The persisted host (`bonus_game`) decides once the match reports it.
 */
export const BONUS_GAME_ORIGIN_ID = "bonus_game";

/** Where the catalog was opened from (telemetry only; changes nothing shown). */
export type MoreChallengesSource = "daily" | "leaguecraft" | "direct";

/** Router state a way in carries, naming where the player came from. */
export function moreChallengesState(source: Exclude<MoreChallengesSource, "direct">) {
  return { moreChallengesSource: source };
}

export function readMoreChallengesSource(state: unknown): MoreChallengesSource {
  const s = (state as { moreChallengesSource?: unknown } | null)?.moreChallengesSource;
  return s === "daily" || s === "leaguecraft" ? s : "direct";
}

/** The player's Daily, as far as the page has read it. */
export type DailyContext =
  | { state: "loading" }
  | { state: "ready"; run: DailyRun | null }
  /** The read failed (or the visitor has no session): treated as no run. */
  | { state: "error" };

/**
 * MC-UX1 — WHY an action is what it is, decided here beside the action so a
 * card never reads it back out of a label. Presentation only: the action's
 * kind, label and destination are unchanged by it.
 *
 *   play     ready        Play plays this mode now.
 *            daily_first  Play goes to today's Daily first (it unlocks after).
 *   blocked  waiting      An earlier bonus stage of today's Daily is up first.
 *            paused       The owner paused new starts.
 *            unavailable  Not available right now (or not in today's Daily).
 *   done     played       Played today.
 *            closed       Closed for today without a result.
 */
export type PlayGate = "ready" | "daily_first";
export type BlockedGate = "waiting" | "paused" | "unavailable";
export type DoneGate = "played" | "closed";

export type ModeAction =
  | { kind: "play"; label: string; to: string; state: unknown; note: string | null; gate: PlayGate }
  /** PGM2 — start (or get back) a Ranked-backed bonus game; the page POSTs. */
  | { kind: "start"; label: string; modeId: PublicModeId; note: string | null }
  /** Still reading the player's Daily; draw a placeholder, not a button. */
  | { kind: "checking" }
  /** Already played today. */
  | { kind: "done"; label: string; note: string | null; gate: DoneGate }
  /** Cannot be started right now, and the reason is stated. */
  | { kind: "blocked"; label: string; note: string | null; gate: BlockedGate }
  /** Approved, with no public launch yet. */
  | { kind: "coming_soon" };

const UNLOCKS_AFTER_DAILY = "Unlocks after today's Daily Challenge.";

export function resolveModeAction(entry: PublicModeEntry, daily: DailyContext): ModeAction {
  const { availability, launch } = entry;
  if (!launch) {
    if (availability.status === "coming_soon") return { kind: "coming_soon" };
    if (availability.status === "paused") {
      return { kind: "blocked", label: "Paused", note: availability.message, gate: "paused" };
    }
    return { kind: "blocked", label: "Unavailable right now", note: availability.message, gate: "unavailable" };
  }
  // PGM2 — a bonus game: repeatable, unrated, open to guests. Play starts it
  // (or hands back a game already running).
  if (launch.kind !== "daily_stage") {
    return launch.kind === "ranked_match"
      ? { kind: "start", label: "Play", modeId: entry.id, note: null }
      : { kind: "play", label: "Play", to: sessionModeRoute(entry.id), state: null, note: null, gate: "ready" };
  }
  if (daily.state === "loading") return { kind: "checking" };
  const run = daily.state === "ready" ? daily.run : null;

  if (!run) {
    if (availability.status === "paused") {
      return { kind: "blocked", label: "Paused", note: availability.message, gate: "paused" };
    }
    return { kind: "play", label: "Start Today's Daily", to: DAILY_CHALLENGE_ROUTE,
      state: DAILY_START_STATE, note: UNLOCKS_AFTER_DAILY, gate: "daily_first" };
  }
  // A legacy (v1–v4) run is one linear challenge with no "after the Daily".
  if (!hasMainDaily(run) || (run.planVersion ?? 0) < launch.minPlanVersion) {
    return { kind: "blocked", label: "Not in today's Daily", note: null, gate: "unavailable" };
  }
  const stage = run.stages.find((s) => s.kind === launch.stageKind);
  if (!stage) return { kind: "blocked", label: "Not in today's Daily", note: null, gate: "unavailable" };
  if (stage.status === "completed") {
    return { kind: "done", label: "Played today",
      note: stage.result ? `${stage.result.correct} correct` : null, gate: "played" };
  }
  if (stage.status === "skipped") return { kind: "done", label: "Closed for today", note: null, gate: "closed" };
  if (!isMainDailyComplete(run)) {
    return { kind: "play", label: "Continue Today's Daily", to: DAILY_CHALLENGE_ROUTE,
      state: DAILY_START_STATE, note: UNLOCKS_AFTER_DAILY, gate: "daily_first" };
  }
  const current = currentStage(run);
  if (current?.id === stage.id) {
    const resuming = stage.status === "in_progress" || stage.childMatchId !== null;
    return { kind: "play", label: resuming ? "Resume" : "Play", to: DAILY_CHALLENGE_ROUTE,
      state: DAILY_CONTINUE_STATE, note: null, gate: "ready" };
  }
  if (current) {
    return { kind: "blocked", label: `Up after ${stageIdentity(current).label}`,
      note: "Today's bonus stages play in order.", gate: "waiting" };
  }
  return { kind: "done", label: "Closed for today", note: null, gate: "closed" };
}
