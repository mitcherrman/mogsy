/**
 * PGM2 — what each BOARD module says when a player reports the board on
 * screen (`ModuleRenderer.reportBoard`). Match Grid's lives beside its
 * renderer; these are Reconstruct, Order Forge, Chronoscope (scrub) and Pro
 * Play Assembly (Roster Lock / Draft Memory).
 *
 * THE ANSWER RULE. `canonical` and `evidence` are read ONLY from the viewer's
 * own reveal row (`ownChallengeReveals`), which the server sends after this
 * viewer's lock. Before it they are null, whatever else the snapshot holds.
 * Everything here is display text the player already saw or was told.
 */
import {
  ASSEMBLY_LANE_ORDER, type PublicRoundView, type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleBoardReport } from "./types";

const CHALLENGE_INDEX = 0;

function ownReveal(state: SegmentStateView) {
  return state.ownChallengeReveals.find((r) => r.challengeIndex === CHALLENGE_INDEX) ?? null;
}

function echo(state: SegmentStateView): string | readonly string[] | null {
  return state.ownSubmittedChoices[CHALLENGE_INDEX] ?? null;
}

const asList = (v: string | readonly string[] | null | undefined): readonly string[] | null =>
  Array.isArray(v) ? v : null;

export function reconstructBoardReport(pub: PublicRoundView): ModuleBoardReport | null {
  const state = pub.segmentState;
  const block = state?.block?.contract === "reconstruct" ? state.block : null;
  if (!state || !block) return null;
  const label = new Map(block.pieces.map((p) => [p.pieceId, p.label]));
  const served = ownReveal(state)?.reconstruct ?? null;
  const mine = served?.placement ?? asList(echo(state));
  const target = served?.target ?? null;
  return {
    prompt: `${block.prompt} Item: ${block.target.label}.`,
    choices: block.pieces.map((p) => p.label),
    selected: mine && mine.length ? mine.map((id) => label.get(id) ?? id).join(", ") : null,
    canonical: served
      ? served.canonicalParts.map((p) => (p.quantity > 1 ? `${p.label} ×${p.quantity}` : p.label)).join(", ")
      : null,
    evidence: served && target
      ? [`${target.label}`, target.totalDisplay && `total ${target.totalDisplay}`,
        target.combineDisplay && `combine ${target.combineDisplay}`].filter(Boolean).join(" · ")
      : null,
  };
}

export function orderForgeBoardReport(pub: PublicRoundView): ModuleBoardReport | null {
  const state = pub.segmentState;
  const block = state?.block?.contract === "order_forge" ? state.block : null;
  if (!state || !block) return null;
  const label = new Map(block.entries.map((e) => [e.entryId, e.label]));
  const served = ownReveal(state)?.orderForge ?? null;
  const mine = served?.order ?? asList(echo(state));
  const name = (id: string) => label.get(id) ?? id;
  return {
    prompt: `${block.prompt} (${block.metricLabel}: ${block.directionLabels.first} → ${block.directionLabels.last})`,
    choices: block.entries.map((e) => e.label),
    selected: mine && mine.length ? mine.map(name).join(" > ") : null,
    canonical: served
      ? served.canonicalOrder.map((id) => {
        const value = served.valueDisplay[id];
        return value ? `${name(id)} (${value})` : name(id);
      }).join(" > ")
      : null,
    evidence: served ? `${block.metricLabel}, as the server ranked it` : null,
  };
}

export function scrubBoardReport(pub: PublicRoundView): ModuleBoardReport | null {
  const state = pub.segmentState;
  const block = state?.block?.contract === "scrub" ? state.block : null;
  if (!state || !block) return null;
  const wave = new Map(block.checkpoints.map((c) => [c.token, `Wave ${c.waveNumber} (${c.spawnTimeDisplay})`]));
  const served = ownReveal(state)?.scrub ?? null;
  const pick = served?.checkpoint ?? (typeof echo(state) === "string" ? (echo(state) as string) : null);
  const proof = served?.proof ?? null;
  const source = [block.source.patch && `patch ${block.source.patch}`, block.source.map, block.source.mode]
    .filter(Boolean).join(", ");
  return {
    prompt: `${block.prompt} ${block.objective.text}`.trim(),
    selected: pick ? wave.get(pick) ?? pick : null,
    canonical: served ? wave.get(served.canonicalCheckpoint) ?? served.canonicalCheckpoint : null,
    evidence: served && proof
      ? [`Level ${proof.after.level ?? proof.targetLevel} at ${proof.after.cumulativeXp} ${block.unitLabel}`,
        proof.thresholdXp && `threshold ${proof.thresholdXp}`, source || null].filter(Boolean).join(" · ")
      : null,
  };
}

export function assemblyBoardReport(pub: PublicRoundView): ModuleBoardReport | null {
  const state = pub.segmentState;
  const block = state?.block?.contract === "assembly" ? state.block : null;
  if (!state || !block) return null;
  const card = new Map(block.cards.map((c) => [c.token, c.label]));
  const position = new Map(block.positions.map((p) => [p.slotId, p.label]));
  const served = ownReveal(state)?.assembly ?? null;
  const mine = served?.placement ?? asList(echo(state));
  const ctx = served?.context ?? null;
  return {
    prompt: `${block.eyebrow}: ${block.prompt}`,
    choices: block.cards.map((c) => c.label),
    selected: mine && mine.length
      ? ASSEMBLY_LANE_ORDER.map((lane, i) => `${position.get(lane) ?? lane}: ${card.get(mine[i]) ?? mine[i] ?? "—"}`)
        .join("; ")
      : null,
    canonical: served
      ? served.canonicalLineup.map((e) => `${position.get(e.slotId) ?? e.slotId}: ${e.fullLabel ?? e.label}`).join("; ")
      : null,
    evidence: ctx
      ? [ctx.team && ctx.opponent ? `${ctx.team} vs ${ctx.opponent}` : ctx.team, ctx.event,
        ctx.season ? String(ctx.season) : null, ctx.game?.gameNumber ? `game ${ctx.game.gameNumber}` : null]
        .filter(Boolean).join(" · ")
      : null,
  };
}
