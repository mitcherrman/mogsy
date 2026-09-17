// ---------------------------------------------------------------------------
// RD1 — THE DUEL'S STANDING, for presentation.
//
// One pure projection from state the backend already published to the few
// facts the arena needs to make a points match read as a contest: who is
// ahead, by how much, how much of the match is left, and — for exactly the
// reveal beat — whether the module that just settled changed who leads.
//
// NOT A SCORING LAYER. Every number below is copied, or compared, never
// computed into a new score:
//
//   * PERSISTENT state reads the public snapshot only — each participant's
//     settled cumulative `score` and the frozen `scoring` block
//     (`matchLength`, `moduleNumber`, `modulesCompleted`). It is safe to render
//     the instant a reconnect lands, because it is a fact about NOW.
//
//   * EVENT state reads ONE settlement — `modulePoints[pid].scoreBefore /
//     scoreAfter / speedBonusPoints` for both players — and only while that
//     settlement is being revealed. It is never inferred by comparing history
//     rows: the ledger is backfilled asynchronously on resume, so "the row
//     before this one" is not a stable fact, while a settlement's own before
//     and after figures are.
//
// WHAT IS DELIBERATELY NOT HERE
// ─────────────────────────────
// Clinched, eliminated, "can still win", "need N points", maximum remaining
// score, streaks and "perfect module". None is published. The remaining
// modules' point values live in the frozen format and are not on the public
// contract; a format is configurable per target, so a client that assumed the
// shipped ten-slot table would be inventing the rule. Perfection has no
// reward in RP1 and a streak has no definition. Not deriving them is the
// feature.
// ---------------------------------------------------------------------------

import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { ResolvedRoundView } from "./viewTypes";

export type DuelStanding = "leading" | "tied" | "trailing";

/** A settlement that changed who leads. Present only during its reveal beat. */
export interface DuelLeadChange {
  /**
   * Names the settled EVENT, never its value: `lead:<roundNumber>`. A module
   * settles once, so this is stable and monotonic — the key a one-shot
   * presentation mounts under, exactly like `AwardPops`' award ids.
   */
  eventId: string;
  roundNumber: number;
  from: DuelStanding;
  to: DuelStanding;
  /**
   * Who now holds the lead, or null when the change ended in a tie (a lead was
   * LOST, but nobody took one). Only a non-null leader is celebrated.
   */
  newLeader: "viewer" | "opponent" | null;
}

export interface DuelStateView {
  /** From the viewer's side. */
  standing: DuelStanding;
  /** Absolute difference between the two settled totals. 0 when tied. */
  margin: number;
  viewerScore: number;
  opponentScore: number;
  /**
   * Modules not yet settled, INCLUDING one in play: during module 8 of 10 this
   * is 3. Null when the match froze no length.
   */
  modulesRemaining: number | null;
  /** The module in play is the last one. False once the match is over. */
  isFinalModule: boolean;
  /** The module in play is one of the last three. False once over. */
  isFinalThree: boolean;
  /** Present only during the reveal beat of a settlement that moved the lead. */
  leadChange: DuelLeadChange | null;
  /** The VIEWER's settled speed bonus, during its reveal beat only. */
  speedBonus: boolean;
  /** Its size as the server awarded it; 0 whenever `speedBonus` is false. */
  speedBonusPoints: number;
}

export interface DuelStateInput {
  publicRound: PublicRoundView | null;
  viewerUserId: string;
  /** The most recent settlement this client captured (`m.lastResolved`). */
  settlement: ResolvedRoundView | null;
  /** The reveal gate (`m.revealHold`). Event state exists only while true. */
  revealing: boolean;
}

export function standingOf(viewer: number, opponent: number): DuelStanding {
  if (viewer > opponent) return "leading";
  if (viewer < opponent) return "trailing";
  return "tied";
}

/**
 * The duel's state, or null when there is no points duel to describe: an hp
 * match (whose "score" is a counter that never moves), a snapshot with no
 * scoring block, or a snapshot that does not yet name both participants.
 *
 * The model check reads the backend's own discriminator, the same answer
 * `matchScoringModel` gives; it is restated rather than imported because that
 * helper lives in the Ranked page and this module sits below it.
 */
export function projectDuelState(
  { publicRound: pub, viewerUserId, settlement, revealing }: DuelStateInput,
): DuelStateView | null {
  if (!pub || pub.scoring?.model !== "points") return null;
  const viewer = pub.players.find((p) => p.playerId === viewerUserId);
  const opponent = pub.players.find((p) => p.playerId !== viewerUserId);
  if (!viewer || !opponent) return null;

  const viewerScore = viewer.score ?? 0;
  const opponentScore = opponent.score ?? 0;
  const { matchLength, moduleNumber, modulesCompleted } = pub.scoring;
  const live = !pub.matchOver && matchLength !== null;
  const modulesRemaining = matchLength === null
    ? null : Math.max(0, matchLength - modulesCompleted);

  const bonus = revealing
    ? Math.max(0, settlement?.modulePoints?.[viewerUserId]?.speedBonusPoints ?? 0) : 0;

  return {
    standing: standingOf(viewerScore, opponentScore),
    margin: Math.abs(viewerScore - opponentScore),
    viewerScore,
    opponentScore,
    modulesRemaining,
    isFinalModule: live && moduleNumber >= matchLength!,
    isFinalThree: live && moduleNumber >= matchLength! - 2,
    leadChange: revealing
      ? projectLeadChange(settlement, viewerUserId, opponent.playerId) : null,
    speedBonus: bonus > 0,
    speedBonusPoints: bonus,
  };
}

/**
 * Did THIS settlement change who leads? Both sides' before and after totals
 * come from the one settlement, which the backend wrote in one transaction —
 * so the comparison can never straddle two different moments.
 *
 * Null when the settlement published no award for either side (an hp round,
 * or a backend that predates `module_points`): no award, no claim.
 */
export function projectLeadChange(
  settlement: ResolvedRoundView | null, viewerId: string, opponentId: string,
): DuelLeadChange | null {
  const mine = settlement?.modulePoints?.[viewerId];
  const theirs = settlement?.modulePoints?.[opponentId];
  if (!settlement || !mine || !theirs) return null;
  const from = standingOf(mine.scoreBefore, theirs.scoreBefore);
  const to = standingOf(mine.scoreAfter, theirs.scoreAfter);
  if (from === to) return null;
  return {
    eventId: `lead:${settlement.roundNumber}`,
    roundNumber: settlement.roundNumber,
    from,
    to,
    newLeader: to === "leading" ? "viewer" : to === "trailing" ? "opponent" : null,
  };
}

/**
 * The left header line's pressure suffix: `FINAL` on the last module,
 * `FINAL 3` on the two before it, otherwise nothing. Factual progress only —
 * the format publishes no rounds, halves or phases, so none are named.
 */
export function duelProgressSuffix(state: DuelStateView | null): string | null {
  if (!state) return null;
  if (state.isFinalModule) return "FINAL";
  if (state.isFinalThree) return "FINAL 3";
  return null;
}

/** `N PT` / `N PTS`. */
function pts(n: number): string {
  return `${n} ${n === 1 ? "PT" : "PTS"}`;
}

/** `AHEAD BY 2 PTS` / `TIED` / `BEHIND BY 1 PT`, from the viewer's side. */
export function duelStandingLabel(state: DuelStateView): string {
  if (state.standing === "leading") return `AHEAD BY ${pts(state.margin)}`;
  if (state.standing === "trailing") return `BEHIND BY ${pts(state.margin)}`;
  return "TIED";
}

export type DuelEventTone = "positive" | "danger" | "neutral" | "bonus";

/** Something that JUST happened in the duel, in words. */
export interface DuelEventView {
  /** One of the closed phrases below; never composed from free text. */
  label: string;
  tone: DuelEventTone;
}

/**
 * THE TRANSIENT DUEL EVENT for the module being revealed, or null.
 *
 * Built ONLY from the reveal-gated event fields of `DuelStateView`, which
 * exist only while a settlement this client watched is being revealed — so a
 * reconnect, a resume or a backfilled ledger can never produce one. Outside
 * the beat both fields are empty and this returns null by construction.
 *
 * ONE phrase per settlement, by a fixed precedence:
 *   1. a lead change   — `YOU TAKE THE LEAD` / `OPPONENT TAKES THE LEAD`
 *   2. into a tie      — `TIED UP`
 *   3. a speed bonus   — `SPEED BONUS +N`
 * A settlement that leaves the standing where it was (including a tie that
 * stays tied, and the 0–0 opening) is not an event. Nothing else is said:
 * no comeback, clinch, match point, streak or "need N" — none is published.
 */
export function duelEventOf(state: DuelStateView | null): DuelEventView | null {
  if (!state) return null;
  const change = state.leadChange;
  if (change?.newLeader === "viewer") return { label: "YOU TAKE THE LEAD", tone: "positive" };
  if (change?.newLeader === "opponent") return { label: "OPPONENT TAKES THE LEAD", tone: "danger" };
  if (change && change.to === "tied") return { label: "TIED UP", tone: "neutral" };
  if (state.speedBonus) return { label: `SPEED BONUS +${state.speedBonusPoints}`, tone: "bonus" };
  return null;
}
