// ---------------------------------------------------------------------------
// Mogzy Interaction Grammar (MIG) — the neutral contracts.
//
// Ported from the MIG1.2 lab (`mig1/1-interaction-lab`, certified b932af4b) by
// DD1-B. Only Data Duel is in production; Stat Drop stayed in the lab (HOLD).
//
// A MIG primitive is an INPUT/PRESENTATION component a renderer composes. It is
// not a module, a host, a mode or a content authority, so nothing here names a
// domain (no champion, no player, no league) and nothing here grades.
//
// THE REVEAL BOUNDARY IS A TYPE BOUNDARY. Each primitive takes two props
// objects:
//
//   * `content` — the `*Public` shape: only what the player may know before
//     the reveal. It has no field that could hold an answer or a deciding
//     value, so a caller cannot leak one by accident.
//   * `reveal`  — the `*Reveal` shape, null until the caller's authority has
//     resolved the round. It is the ONLY way a canonical value reaches the
//     primitive, and the primitive only DISPLAYS it: which side is canonical
//     and what the true value is are facts it is handed, never facts it
//     derives.
//
// Responses are a strict subset of the production `SegmentChoice` transport
// (a scalar `selected`, or Order Forge's `order` list), so a host maps them 1:1
// without widening it.
// ---------------------------------------------------------------------------

import type { SegmentChoice } from "@/lib/ranked-public/client";

/** Where an interaction is. The caller owns it; a primitive never advances it. */
export type InteractionPhase = "open" | "locked" | "revealed";

/** Optional art for a subject. A null `src` draws the monogram in the same box. */
export interface SubjectMedia {
  src: string | null;
  /** Empty for decorative art that the label already names. */
  alt: string;
}

// ------------------------------------------------------------------ Data Duel

export interface DuelSide {
  /** Opaque identity the response carries. Never displayed. */
  token: string;
  label: string;
  /** A second line under the label ("Solar Flare · R", "LCK"). */
  sublabel?: string | null;
  media?: SubjectMedia | null;
  /** 1–3 characters drawn when there is no art. Defaults to the label's first. */
  monogram?: string | null;
}

/** Everything a player may see before the reveal. */
export interface DataDuelPublic {
  prompt: string;
  /** The compared quantity, short: "Cooldown", "Games on Gragas". */
  metricLabel: string;
  /** Scope line under the prompt ("LCK · all time", "Rank 3"). */
  context?: string | null;
  left: DuelSide;
  right: DuelSide;
  /**
   * The canonical "same value" answer, when the comparison's answer domain
   * has one (Mastery comparisons always do: `[a, b, "tie"]`). Absent = a
   * strictly two-sided duel. Knowing a tie is POSSIBLE discloses nothing.
   */
  tie?: { token: string; label: string } | null;
}

/** Authority-supplied, post-reveal only. */
export interface DataDuelReveal {
  /** The side the authority says satisfies the comparison. */
  canonicalToken: string;
  /**
   * Both deciding values, already formatted by the authority, keyed by token.
   * EMPTY for a legacy reveal that carries no structured values: the sides
   * then show no value row (never a placeholder, never a number from prose).
   */
  values: Readonly<Record<string, string>>;
  /**
   * The same two values as numbers, keyed by side token, so the margin can be
   * DRAWN. Display only: the primitive never decides a winner from them.
   */
  numericValues?: Readonly<Record<string, number>> | null;
  /**
   * The authority's own formatted margin ("90 seconds"). The primitive writes
   * it verbatim; it never formats a number itself. Absent = no margin bar.
   */
  marginDisplay?: string | null;
  /** One short evidence line (the authority's own explanation). */
  evidence?: string | null;
  /** Where the fact came from. */
  source?: string | null;
}

export type DataDuelResponse = { selected: string };

// Compile-time proof that the response is a production transport shape.
type Assert<T extends true> = T;
export type _DuelIsSegmentChoice = Assert<DataDuelResponse extends SegmentChoice ? true : false>;

// ---------------------------------------------------------------- Order Forge

/** One card in the sequence. */
export interface OrderEntry {
  /**
   * Opaque id the response carries (a positional token in the server's
   * shuffled display, never derived from rank). Never displayed.
   */
  token: string;
  label: string;
  media?: SubjectMedia | null;
}

/** Everything a player may see before the reveal. */
export interface OrderForgePublic {
  prompt: string;
  /** The ordered quantity, short: "Gold cost". */
  metricLabel: string;
  /** What the first and the last position mean: "Cheapest" / "Most expensive". */
  directionLabels: { first: string; last: string };
  /** The cards in the server's shuffled display order. */
  entries: readonly OrderEntry[];
}

/** Authority-supplied, post-lock only. The primitive displays it and grades nothing. */
export interface OrderForgeReveal {
  /** The order the player locked, as the server recorded it. */
  order: readonly string[];
  /** The canonical order. Only ever supplied here. */
  canonicalOrder: readonly string[];
  /** The authority's formatted value per token ("800 g"). May be empty. */
  valueDisplay: Readonly<Record<string, string>>;
  /** Per-position marks for `order`, straight from the authority; display only. */
  positionCorrect: readonly boolean[];
  /** The authority's verdict on the whole sequence; null when it stated none. */
  isCorrect: boolean | null;
}

export type OrderForgeResponse = { order: readonly string[] };

export type _OrderForgeIsSegmentChoice = Assert<OrderForgeResponse extends SegmentChoice ? true : false>;
