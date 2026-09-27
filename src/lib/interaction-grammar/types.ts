// ---------------------------------------------------------------------------
// MIG1.1 — Mogzy Interaction Grammar: the neutral contracts.
//
// A MIG primitive is an INPUT/PRESENTATION component a module viewport
// composes. It is not a module, a host, a mode or a content authority, so
// nothing here names a domain (no champion, no player, no league) and nothing
// here grades.
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
// Responses are a strict subset of the production `SegmentChoice` scalar
// transport, so a future ModuleRenderer maps them 1:1 without widening it.
// ---------------------------------------------------------------------------

import type { SegmentChoice } from "@/lib/ranked-public/client";

/** Where an interaction is. The caller owns it; a primitive never advances it. */
export type InteractionPhase = "open" | "locked" | "revealed";

/** The scalar member of `SegmentChoice`, which is all MIG1.1 emits. */
export type ScalarChoice = Extract<SegmentChoice, { selected: unknown }>;

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
  /** Scope line under the prompt ("LCK · all time", "League 26.16"). */
  context?: string | null;
  left: DuelSide;
  right: DuelSide;
}

/** Authority-supplied, post-reveal only. */
export interface DataDuelReveal {
  /** The side the authority says satisfies the comparison. */
  canonicalToken: string;
  /** Both deciding values, already formatted by the authority, keyed by token. */
  values: Readonly<Record<string, string>>;
  /** One short evidence line (the authority's own explanation). */
  evidence?: string | null;
  /** Where the fact came from. */
  source?: string | null;
}

export type DataDuelResponse = { selected: string };

// ------------------------------------------------------------------ Stat Drop

/** A bounded scale. The same shape as Mastery's numeric input constraints. */
export interface StatDropScale {
  min: number;
  max: number;
  step: number;
  /** Display precision of the estimate, not of the answer. */
  decimals: number;
}

export interface StatDropPublic {
  prompt: string;
  metricLabel: string;
  /** "seconds", "games". Empty for a unitless value. */
  unit: string;
  context?: string | null;
  scale: StatDropScale;
  subject?: {
    label: string;
    sublabel?: string | null;
    media?: SubjectMedia | null;
  } | null;
}

export interface StatDropReveal {
  /** The authority's value, used only to PLACE the marker. */
  canonicalValue: number;
  /** The authority's formatted value, which is what the player reads. */
  canonicalDisplay: string;
  evidence?: string | null;
  source?: string | null;
}

export type StatDropResponse = { selected: number };

// Compile-time proof that both responses are production transport shapes.
type Assert<T extends true> = T;
export type _DuelIsSegmentChoice = Assert<DataDuelResponse extends SegmentChoice ? true : false>;
export type _DropIsSegmentChoice = Assert<StatDropResponse extends SegmentChoice ? true : false>;
