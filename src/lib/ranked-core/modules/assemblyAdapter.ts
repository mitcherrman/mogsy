// ---------------------------------------------------------------------------
// PA2B — the ONE adapter between `assembly.v1` (backend, PA2A) and the PAV1
// `PositionalAssembly` primitive.
//
// It maps fields and words the server's structured reveal; it decides nothing.
//
//   * Public block -> `PositionalAssemblyPublic`: a rename (`slot_id` -> `id`,
//     `media_key` -> champion icon URL, `card_kind` -> `cardKind`). Positions
//     keep the server's order; nothing is sorted, nothing is inferred.
//   * The primitive's `{assignment: {slot: token}}` -> the server's
//     `{placement: [5 tokens]}` in LANE ORDER (`ASSEMBLY_LANE_ORDER`), and
//     nothing else. An incomplete, duplicated or foreign board maps to `null`
//     and is never sent.
//   * The server's reveal -> `PositionalAssemblyReveal`: the canonical card per
//     position, the per-position marks and the whole-board verdict are the
//     SERVER's (`canonical_lineup`, `position_correct`, `is_correct`,
//     `matched`). Only the words are this host's — `noteFor` / `contextFor`
//     ported from the PAV1 lab over the server's `card_facts` and
//     `historical_context`, as PA2A §11 hands them over.
//
// No answer is computed here: there is no comparison of a placed token with a
// canonical one anywhere in this file, and no role is read from a card before
// the reveal (a card has none until then).
// ---------------------------------------------------------------------------

import { ROLE_EMBLEM_SRC } from "@/components/ranked-arena/RoleEmblem";
import { getChampionSquareIconUrl } from "@/lib/combat-lab/abilityIcons";
import { monogramFor } from "@/lib/interaction-grammar/positionalAssembly";
import type {
  AssemblyCard, AssemblyPosition, PositionalAssemblyPublic, PositionalAssemblyReveal,
} from "@/lib/interaction-grammar/types";
import {
  ASSEMBLY_LANE_ORDER,
  type AssemblyBlockView,
  type AssemblyCardFact,
  type AssemblyChallengeReveal,
  type AssemblyFamilyId,
  type AssemblyHistoricalContext,
} from "@/lib/ranked-public/contracts";

/** The PA2A/PA2B `SegmentChoice` for an Assembly board. */
export interface AssemblyPlacementChoice { placement: readonly string[] }

/** The family's name, as the eyebrow and the admin launcher say it. */
export const ASSEMBLY_FAMILY_LABEL: Record<AssemblyFamilyId, string> = {
  roster_lock: "Roster Lock",
  draft_memory: "Draft Memory",
};

export function lockLabelFor(family: AssemblyFamilyId): string {
  return family === "roster_lock" ? "Lock lineup" : "Lock draft";
}

function positionsFor(block: AssemblyBlockView): AssemblyPosition[] {
  return block.positions.map((p) => ({
    id: p.slotId, label: p.label, short: p.short,
    emblem: { src: ROLE_EMBLEM_SRC[p.slotId], alt: "" },
  }));
}

function cardFor(card: AssemblyBlockView["cards"][number]): AssemblyCard {
  if (card.entityType === "champion") {
    const src = getChampionSquareIconUrl(card.mediaKey);
    return {
      token: card.token, label: card.label, sublabel: card.sublabel,
      media: src ? { src, alt: "" } : null, monogram: null,
    };
  }
  // Identity cards are seals by design (PAV1 §4): no portrait is drawn.
  return {
    token: card.token, label: card.label, sublabel: card.sublabel,
    media: null, monogram: monogramFor(card.label),
  };
}

/** The server's public block -> the primitive's content. A field mapping. */
export function toPositionalAssemblyPublic(block: AssemblyBlockView): PositionalAssemblyPublic {
  const s = block.subject;
  const team = s.team ?? s.teamKey ?? "";
  const opponent = s.opponent ?? s.opponentKey;
  const sub = [opponent ? `vs ${opponent}` : null, s.event].filter(Boolean).join(" · ");
  return {
    prompt: block.prompt,
    eyebrow: block.eyebrow,
    // No dated crest authority rides the Ranked wire; the subject draws its
    // monogram (the lab's crests came from its own answer-bearing capture).
    subject: { label: team, sublabel: sub || null, media: null, monogram: monogramFor(team) },
    cardKind: block.cardKind,
    positions: positionsFor(block),
    cards: block.cards.map(cardFor),
    footnote: `Frozen Worlds catalog · rev ${block.catalogRevision.slice(0, 8)}`,
  };
}

/**
 * The primitive's board -> the server's placement, in lane order.
 *
 * `null` (and so nothing is sent) unless every lane holds exactly one card that
 * this tray dealt and no card is in two lanes. The server validates the same
 * again; this only stops a known-bad board from leaving the client.
 */
export function placementFromAssignment(
  assignment: Readonly<Record<string, string | null | undefined>>,
  dealt: readonly string[],
): string[] | null {
  const known = new Set(dealt);
  const placement: string[] = [];
  for (const lane of ASSEMBLY_LANE_ORDER) {
    const token = assignment[lane];
    if (typeof token !== "string" || !known.has(token)) return null;
    placement.push(token);
  }
  return new Set(placement).size === placement.length ? placement : null;
}

/** A lane-ordered placement (the server's echo) -> the primitive's board. */
export function boardFromPlacement(placement: readonly string[]): Record<string, string> {
  const board: Record<string, string> = {};
  ASSEMBLY_LANE_ORDER.forEach((lane, i) => { board[lane] = placement[i]; });
  return board;
}

const ROLE_NOUN: Record<string, string> = {
  Top: "top laner", Jungle: "jungler", Mid: "mid laner", Bot: "bot laner", Support: "support",
};

/** What a placed card WAS — the host's words over the server's card facts. */
export function noteFor(fact: AssemblyCardFact, ctx: AssemblyHistoricalContext): string | null {
  const role = fact.roleAnchor;
  if (!role) return null;
  const team = ctx.team ?? "This team";
  const opp = ctx.opponent ?? "the opponent";
  const noun = ROLE_NOUN[role] ?? role.toLowerCase();
  const season = ctx.season !== null ? ` ${ctx.season}` : "";
  if (ctx.family === "roster_lock") {
    switch (fact.tier) {
      case "answer": return `${team}'s ${noun} in this series — right player, wrong position.`;
      case "opponent": return `${opp}'s ${noun} in this series.`;
      case "bench": return `On ${team}'s roster at ${role} that day, but did not start.`;
      case "tournament": return `A ${noun} for another team at Worlds${season}.`;
      default: return null;
    }
  }
  switch (fact.tier) {
    case "answer": return `${team} did play it in this game — at ${role}.`;
    case "series": return `${team}'s ${role} pick in another game of this series.`;
    case "opponent": return `${opp}'s ${role} pick in this game.`;
    case "tournament": return `A ${role} pick elsewhere at Worlds${season}.`;
    default: return null;
  }
}

/** The context plate, worded over the server's `historical_context`. */
export function contextFor(ctx: AssemblyHistoricalContext): PositionalAssemblyReveal["context"] {
  const team = ctx.team ?? "";
  const opp = ctx.opponent ?? "";
  const title = [`${team} vs ${opp}`, ctx.event, ctx.stage].filter(Boolean).join(" · ");
  const lines: string[] = [];
  if (ctx.family === "roster_lock") {
    const games = ctx.games ?? [];
    const dates = [...new Set(games.map((g) => g.gameDate).filter((d): d is string => !!d))];
    if (games.length > 0) {
      lines.push(`${games.length} ${games.length === 1 ? "game" : "games"} · ${dates.join(", ")}`);
    }
    lines.push("The same five started every game; each is corroborated by a dated registry tenure.");
  } else {
    const g = ctx.game;
    if (g) {
      const parts = [
        g.gameNumber !== null ? `Game ${g.gameNumber}` : null, g.gameDate,
        g.patch ? `patch ${g.patch}` : null, g.side ? `${g.side} side` : null,
      ].filter(Boolean);
      lines.push(parts.join(" · "));
    }
    lines.push("Champion–role assignment only; no pick order is recorded or implied.");
    if (ctx.path === "source_recovered") {
      lines.push("Recovered from historical source picks (canonical side was short).");
    }
  }
  const rules = ctx.rulesVersion ? ` · PA1 ${ctx.rulesVersion}` : "";
  return { title, lines, source: { label: `Leaguepedia via Mogzy's canonical pro layer${rules}`, url: null } };
}

/**
 * The server's reveal -> the primitive's. `null` when the reveal does not
 * describe THIS board (a lineup or placement naming a card the tray never
 * dealt): the module then keeps its locked plate rather than draw a reveal
 * that disagrees with the cards on screen.
 */
export function toPositionalAssemblyReveal(
  block: AssemblyBlockView, r: AssemblyChallengeReveal,
): PositionalAssemblyReveal | null {
  const dealt = new Set(block.cards.map((c) => c.token));
  if (!r.placement.every((t) => dealt.has(t))
    || !r.canonicalLineup.every((e) => dealt.has(e.token))) return null;
  const assignment = boardFromPlacement(r.placement);
  const canonical: Record<string, string> = {};
  for (const e of r.canonicalLineup) canonical[e.slotId] = e.token;
  const positionCorrect: Record<string, boolean> = {};
  for (const lane of ASSEMBLY_LANE_ORDER) positionCorrect[lane] = r.positionCorrect[lane] === true;
  const cardNotes: Record<string, string> = {};
  for (const lane of ASSEMBLY_LANE_ORDER) {
    if (positionCorrect[lane]) continue;
    const token = assignment[lane];
    const fact = r.cardFacts[token];
    const note = fact ? noteFor(fact, r.context) : null;
    if (note) cardNotes[token] = note;
  }
  const total = ASSEMBLY_LANE_ORDER.length;
  const verdictText = r.isCorrect === true
    ? (r.context.family === "roster_lock"
      ? "Every position right — the lineup holds."
      : "Every position right — the composition holds.")
    : `${r.matched} of ${total} in position.`;
  return {
    assignment, canonical, positionCorrect,
    isCorrect: r.isCorrect, verdictText, cardNotes,
    context: contextFor(r.context),
  };
}
