// ---------------------------------------------------------------------------
// MATCH GRID (GM-M1) — the neutral contract.
//
// MATCH asks "which things belong together?": the player builds a map from
// ENTITIES (movable sigils) to GROUPS (receiving anchors). It follows the
// Mogzy Interaction Grammar's reveal boundary exactly (`interaction-grammar/
// types.ts`): `MatchPublic` can carry nothing that could hold an answer, and
// the canonical relation reaches the primitive only through `MatchReveal`,
// which it DISPLAYS and never derives. Nothing here names a domain: no rune,
// no tree, no champion, no role.
//
// Kept in its own module (not appended to the grammar's shared `types.ts`) so
// M1 can proceed in parallel with GM-S1 without touching shared files. Folding
// it into the grammar is a rename, not a redesign.
// ---------------------------------------------------------------------------

import type { SegmentChoice } from "@/lib/ranked-public/client";
import type { InteractionPhase, SubjectMedia } from "@/lib/interaction-grammar/types";

export type { InteractionPhase, SubjectMedia };

/** One movable thing. */
export interface MatchEntity {
  /** Opaque identity the response carries. Never displayed. */
  token: string;
  label: string;
  /** A second line ("Keystone") ONLY when the host has decided it discloses nothing. */
  sublabel?: string | null;
  media?: SubjectMedia | null;
  /** 1–3 characters drawn when there is no art. Defaults to the label's initial. */
  monogram?: string | null;
}

/** One receiving anchor. */
export interface MatchGroup {
  /** Opaque identity the response carries. Never displayed. */
  token: string;
  label: string;
  media?: SubjectMedia | null;
  /**
   * A PUBLIC visual identity the renderer may theme by: a hue in degrees. The
   * five rune trees have well-known colours; a champion role would have none.
   * It is the group's own identity, never a hint about which entities it takes.
   */
  hue?: number | null;
  /** A short public glyph key the renderer may draw on the seal ("precision"). Decorative. */
  glyph?: string | null;
}

/**
 * How many groups one entity may belong to.
 *   "one"  — every entity has exactly one home (rune → tree).
 *   "many" — an entity may belong to several groups (champion → roles). RESERVED:
 *            the contract names it so the champion-role authority's true
 *            semantics are representable, but M1's primitive throws on it
 *            rather than falsify a many-valued fact as a single seat.
 */
export type MatchMembership = "one" | "many";

/** Everything a player may see before the reveal. It has no field that could hold the answer. */
export interface MatchPublic {
  prompt: string;
  /** Scope line under the prompt ("Patch 16.19 · five disciplines"). */
  context?: string | null;
  /** What one movable thing is called, for speech and hints: "rune". */
  entityNoun: string;
  /** What one anchor is called: "rune tree". */
  groupNoun: string;
  /** Distinct tokens, in the host's dealt order (answer-independent). */
  entities: readonly MatchEntity[];
  /** Distinct tokens, in the host's order (answer-independent). 2–6. */
  groups: readonly MatchGroup[];
  membership: MatchMembership;
}

/**
 * Where one entity sits: its group, and the seat index within that group's
 * reserved geometry. The seat is PRESENTATION ONLY (it keeps other sigils from
 * moving when one is added or removed) and is stripped from the response.
 */
export interface MatchSeat {
  group: string;
  seat: number;
}

/** The board: entity token → seat. An absent entity is still in the well (unsorted). */
export type MatchValue = Readonly<Record<string, MatchSeat>>;

/** The locked map: identity only, never correctness. In the host's dealt entity order. */
export type MatchResponse = { assignments: readonly { entity: string; group: string }[] };

/**
 * Compile-time proof that the PRIMITIVE's response is not the transport. The
 * production `SegmentChoice` branch is `{ assignments: {entity_id, group_id}[] }`
 * (MG-P3); only the `match` module wrapper converts one into the other, so the
 * primitive stays content- and transport-neutral.
 */
type Assert<T extends true> = T;
export type _MatchIsNotSegmentChoiceYet = Assert<MatchResponse extends SegmentChoice ? false : true>;

/** One host-worded line about an entity, shown after the reveal ("Tree" → "Domination"). */
export interface MatchFact {
  label: string;
  value: string;
}

/** Authority-supplied, post-lock only. The primitive displays it and grades nothing. */
export interface MatchReveal {
  /** The map the player locked, as the host recorded it. */
  assignments: Readonly<Record<string, string>>;
  /**
   * The canonical home(s) of every entity, straight from the authority. One
   * token under `membership: "one"`; several under "many". Only ever here.
   */
  canonical: Readonly<Record<string, readonly string[]>>;
  /** Per entity, the grader's mark on `assignments`. Display only. */
  entityCorrect: Readonly<Record<string, boolean>>;
  /** The authority's verdict on the whole map; null when it stated none. */
  isCorrect: boolean | null;
  /** Facts about each entity, already worded by the host. Nothing is invented from them. */
  facts?: Readonly<Record<string, readonly MatchFact[]>> | null;
  /** Where the facts came from, as the host words it. */
  source?: string | null;
}
