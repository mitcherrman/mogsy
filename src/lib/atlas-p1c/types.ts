/**
 * ATL-P1-C — Atlas flagship prototype: semantic model.
 *
 * This file is the prototype's reading of Interface Contract V0. It is
 * deliberately not code-final: names are chosen so a later P1-D lane can map
 * them onto real adapters, but nothing here is a shared contract.
 *
 * Two state families live side by side and never mix:
 *
 *   * SEMANTIC state (this file + workspace.ts): what each Lens is about, which
 *     temporal context it reads under, inheritance/overrides, holds, groups,
 *     comparisons and transform provenance. Semantic actions are undoable.
 *   * VISUAL state (visual.ts): focus, dock order, collapse/expand, lift. Visual
 *     actions never mutate a subject, a context or a query key.
 *
 * Every number the prototype shows comes from `fixtures.ts` and is DEMO DATA.
 */

export type Universe = "leaguecraft" | "pro-play";
export type AbilitySlot = "P" | "Q" | "W" | "E" | "R";
export type ChampionId = "ahri" | "syndra";
export type PlayerId = "faker" | "chovy";

/** Typed source identities. A Lens always knows which source it reads from. */
export type SourceId =
  | "lc.ability_catalog"
  | "lc.patch_archive"
  | "pro.champion_records"
  | "pro.player_champion_records"
  | "pro.matchup.exact";

export type SubjectRef =
  | { kind: "ability"; universe: "leaguecraft"; champion: ChampionId; slot: AbilitySlot }
  | { kind: "champion"; universe: "pro-play"; champion: ChampionId }
  | { kind: "player-champion"; universe: "pro-play"; player: PlayerId; champion: ChampionId }
  | {
      kind: "exact-matchup";
      universe: "pro-play";
      a: { player: PlayerId; champion: ChampionId };
      b: { player: PlayerId; champion: ChampionId };
    };

export type SubjectKind = SubjectRef["kind"];

/**
 * Temporal selectors are typed. A Leaguecraft patch is never a Pro season, a
 * season is never a calendar year, and the prototype never equates them.
 */
export type TemporalContext =
  | { kind: "current" }
  | { kind: "lc-patch"; patch: string }
  | { kind: "lc-patch-range"; from: string; to: string }
  | { kind: "pro-season"; season: string }
  | { kind: "calendar-year"; year: number }
  | { kind: "date-window"; from: string; to: string };

export type TemporalKind = TemporalContext["kind"];

export const LEAGUECRAFT_TEMPORAL_KINDS: readonly TemporalKind[] = ["current", "lc-patch", "lc-patch-range"];
export const PRO_PLAY_TEMPORAL_KINDS: readonly TemporalKind[] = ["current", "pro-season", "calendar-year", "date-window"];

/** The global context carries one typed slot per universe. */
export interface GlobalContext {
  leaguecraft: TemporalContext;
  proPlay: TemporalContext;
}

export type GlobalSlot = keyof GlobalContext;

export function slotForUniverse(universe: Universe): GlobalSlot {
  return universe === "leaguecraft" ? "leaguecraft" : "proPlay";
}

export type CrosswalkStatus = "exact" | "approximate" | "failed";

export interface TransformRecord {
  seq: number;
  from: SubjectRef;
  to: SubjectRef;
  /** Facets the Lens carried before and the target universe cannot express. */
  droppedFacets: string[];
  /**
   * A per-Lens override or hold never crosses universes: a "current patch"
   * means nothing to a season scope. True when one was cleared by this step.
   */
  clearedContext: boolean;
  crosswalk: { from: SourceId; to: SourceId; status: CrosswalkStatus; note: string };
}

export interface Lens {
  id: string;
  subject: SubjectRef;
  /** Per-Lens temporal override; null means "inherit the global slot". */
  override: TemporalContext | null;
  /**
   * A held Lens is frozen on the context it had when held. It ignores global
   * changes (and its own override) until released.
   */
  held: TemporalContext | null;
  pinned: boolean;
  groupId: string | null;
  clonedFrom: string | null;
  provenance: TransformRecord[];
}

export interface LensGroup {
  id: string;
  kind: "matrix";
  label: string;
  players: PlayerId[];
  champions: ChampionId[];
}

export interface Comparison {
  id: string;
  lensIds: [string, string];
}

export interface WorkspaceState {
  global: GlobalContext;
  lenses: Lens[];
  groups: LensGroup[];
  comparisons: Comparison[];
  /** Monotonic counter; ids derive from it so tests are deterministic. */
  seq: number;
}

/* ------------------------------------------------------------------------- */
/* Resolution (what a Lens shows once its context is settled)                 */
/* ------------------------------------------------------------------------- */

export type Capability = "supported" | "unsupported" | "gated";
export type FetchStatus = "idle" | "loading" | "ready" | "error";
export type Coverage = "full" | "partial" | "empty" | "unavailable" | "denied" | "not_applicable";

export type ContextOrigin = "global" | "override" | "held";

export interface EffectiveContext {
  context: TemporalContext;
  origin: ContextOrigin;
  slot: GlobalSlot;
  /** True when the effective context differs from the inherited global slot. */
  diverges: boolean;
  /** Human sentence explaining the inheritance chain. */
  explanation: string;
}

export interface Facet {
  key: string;
  label: string;
  /** Scalar or per-rank array; null when the source has no value. */
  value: number | number[] | string | null;
  unit?: string;
  /** Sample size this facet is computed over, when it is a rate. */
  denominator?: { label: string; n: number };
  /** Population identity; two facets are only differenced inside one population. */
  population?: string;
  note?: string;
}

export interface Evidence {
  id: string;
  patch: string;
  text: string;
  source: SourceId;
  orderingCertified: boolean;
}

export type NoticeTone = "info" | "warn" | "blocked" | "demo";

export interface Notice {
  tone: NoticeTone;
  text: string;
}

export interface Gate {
  route: string;
  requires: "owner";
  granted: false;
  reason: string;
}

export interface LensView {
  lens: Lens;
  title: string;
  subtitle: string;
  universe: Universe;
  source: SourceId;
  effective: EffectiveContext;
  capability: Capability;
  fetch: FetchStatus;
  coverage: Coverage;
  facets: Facet[];
  evidence: Evidence[];
  notices: Notice[];
  gate: Gate | null;
}

/* ------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* ------------------------------------------------------------------------- */

export interface FacetDifference {
  key: string;
  label: string;
  unit?: string;
  a: Facet["value"];
  b: Facet["value"];
  /** Per-rank or scalar delta (b - a); null when a difference is blocked. */
  delta: number | number[] | null;
  deltaBlockedReason: string | null;
}

export type ComparisonVerdict =
  | { kind: "comparable"; rows: FacetDifference[]; notes: string[] }
  | { kind: "side-by-side"; rows: FacetDifference[]; notes: string[] }
  | { kind: "blocked"; reason: string };

export interface ComparisonView {
  comparison: Comparison;
  a: LensView;
  b: LensView;
  verdict: ComparisonVerdict;
}

/* ------------------------------------------------------------------------- */
/* Memory-only snapshots                                                       */
/* ------------------------------------------------------------------------- */

export interface WorkspaceSnapshot {
  id: string;
  label: string;
  description: string;
  state: WorkspaceState;
  /** Dock order to restore alongside the semantic state. */
  order: string[];
}
