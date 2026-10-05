/**
 * Catch-Up domain types ("what changed after patch X through patch Y?").
 *
 * TWO TRUTH LAYERS — keep them apart:
 *
 * 1. RIOT COVERAGE. `CatchUpReport.lines` is EVERY Riot-authored change line
 *    inside the selected range, exactly once, in chronological report order,
 *    for every section (Champions, Items, Systems, Support Adjustments, modes…).
 *    A line is never dropped because Mogzy cannot chain it.
 *
 * 2. MOGZY CONTINUITY. `CatchUpReport.continuity.chains` is an OPTIONAL OVERLAY
 *    on layer 1: proven same-parameter chains over SR Champions/Items only. It
 *    is a strict subset of the Riot lines and must never be presented as "all
 *    changes" for an entity or a patch range (26.16 "ADC MAGIC RESISTANCE"
 *    changes 27 champions from a Systems card; Imperial Mandate AP lives in
 *    Support Adjustments).
 *
 * Authority: docs/PATCH_HUB_PH3_CONTINUITY_AUDIT.md (PH3-A, 3f3eec28).
 */
import type {
  PatchEntityType,
  PatchReportCard,
  PatchReportChange,
} from "@/lib/patch-reports/api";

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** The only scopes that may form a continuity chain in V1. */
export type ContinuityScope = "sr.champions" | "sr.items";

/**
 * Scope as carried on a key. Production only ever produces `ContinuityScope`;
 * the `test:` form exists solely for the audit's "scope allowlist removed"
 * ablation (see `buildCatchUpReportInternal`).
 */
export type ScopeLabel = ContinuityScope | `test:${string}`;

/**
 * Exact structural identity of one Riot parameter (PH3-A §9). Every text field
 * is `canonicalLabel`-folded (cosmetic only). Value continuity is NOT part of
 * the key and never establishes identity.
 */
export type PatchContinuityKey = {
  scope: ScopeLabel;
  entity: string;
  /** `normalizeAbilitySlot(ability_slot)`: "P"|"Q"|"W"|"E"|"R", another raw slot, or null. */
  slot: string | null;
  group: string;
  property: string;
};

/**
 * Deep-link identity of a Riot line: the SAME anchors the Patch Report page
 * renders (`semantic-ids.ts`), so `?patch=<patch>#<change>` addresses the line.
 */
export type PatchReportTarget = {
  patch: string;
  /** `s-<section>` */
  section: string;
  /** Collision-resolved entity anchor. */
  entity: string;
  /** Ability/group anchor. */
  group: string;
  /** Change anchor. */
  change: string;
};

/* -------------------------------------------------------------------------- */
/* Riot lines (layer 1)                                                       */
/* -------------------------------------------------------------------------- */

export type LineRefusalReason =
  | "not_numeric"
  | "value_ineligible"
  | "no_op_line"
  /** The key has no entity or no property name, so no identity can be formed. */
  | "key_incomplete"
  | "key_ambiguous_in_patch";

export type ChainRefusalReason =
  | "contiguity_unverifiable"
  | "entity_ref_conflict"
  | "mogzy_property_conflict"
  | "before_mismatch"
  | "alias_row_unresolved"
  | "alias_evidence_failed";

export type ContinuityRefusalReason = "out_of_scope" | LineRefusalReason | ChainRefusalReason;

/** Whether a line may even be considered for a chain. Says nothing about being chained. */
export type LineEligibility =
  | { status: "out_of_scope" }
  | { status: "refused"; reason: LineRefusalReason }
  | { status: "candidate" };

export type CatchUpRiotLine = {
  /** `<patch>#<cardIndex>.<changeIndex>` — stable within one report build. */
  id: string;
  patch: string;
  /** Index into `CatchUpReport.includedPatches`. */
  patchOrdinal: number;
  /** 0-based position in `CatchUpReport.lines` (chronological report order). */
  order: number;
  cardIndex: number;
  changeIndex: number;
  entityKey: string;
  entityType: PatchEntityType;
  entityName: string;
  sectionKey: string;
  sectionTitle: string;
  groupTitle: string;
  target: PatchReportTarget;
  /** The original payload objects, untouched (same references as the input). */
  card: PatchReportCard;
  change: PatchReportChange;
  /** Present only for lines in a chainable scope. */
  key: PatchContinuityKey | null;
  eligibility: LineEligibility;
  /** The chain this line is a step of, if any. */
  chainId: string | null;
  /**
   * Set when the line's identity had two or more in-range occurrences but could
   * not be proven continuous (the chain was refused for this reason).
   */
  identityRefusal: ContinuityRefusalReason | null;
};

/* -------------------------------------------------------------------------- */
/* Range and coverage                                                         */
/* -------------------------------------------------------------------------- */

export type CatchUpRange = {
  sincePatch: string;
  throughPatch: string;
  /** V1 semantics, spelled out so a consumer cannot misread them. */
  semantics: "since_exclusive_through_inclusive";
  /** `up_to_date` when since === through: nothing can be after the baseline. */
  status: "range" | "up_to_date";
  /**
   * The oldest listed patch, when `sincePatch` is older than the listing. Riot
   * lines then start at this floor (included), and anything between `sincePatch`
   * and the floor is simply not covered.
   */
  coverageFloor: string | null;
  clampedToCoverageFloor: boolean;
};

export type CoverageIssueKind =
  /** A patch in the range was listed (or is `throughPatch`) but no report was supplied. */
  | "missing_report"
  /** Two supplied reports claim the same patch. */
  | "duplicate_report"
  /** A supplied/listed version is not dotted integers, so it cannot be placed in order. */
  | "unorderable_version"
  /** Two same-year plain `YY.N` patches in the range are not consecutive: a patch is missing. */
  | "ordinal_gap"
  /** Adjacency cannot be verified (year boundary, `25.S1.x`, hotfix). Blocks links across it only. */
  | "unverified_adjacency";

export type CoverageIssue = {
  kind: CoverageIssueKind;
  /** Versions involved (for a gap/adjacency: `[after, before]`). */
  versions: string[];
  /** True when this issue withholds EVERY continuity claim in the range. */
  withholdsContinuity: boolean;
};

export type CatchUpCoverage = {
  /** No issue of any kind. */
  complete: boolean;
  /** Versions that should be in the range: listed ∪ loaded ∪ {throughPatch}, in order. */
  expectedPatches: string[];
  loadedPatches: string[];
  missingPatches: string[];
  duplicatePatches: string[];
  unorderablePatches: string[];
  issues: CoverageIssue[];
};

/* -------------------------------------------------------------------------- */
/* Values                                                                     */
/* -------------------------------------------------------------------------- */

/** A chain-eligible value: the verbatim Riot string plus its safe normalisation. */
export type ValueFact = {
  /** Verbatim from Riot. Always show this to a user. */
  raw: string;
  /** `canonicalValue(raw)`: cosmetic folds only. Equality of canonical forms decides continuity. */
  canonical: string;
  /** Canonical string with every numeric literal replaced by `#`. */
  template: string;
  /** The numeric literals, exact decimal strings, in order. */
  numbers: string[];
};

export type ChainValueState =
  /** Net differs from the start and every step moved the same way. */
  | "changed"
  /** The final value is canonically identical to the value before the first step. */
  | "returns_to_start_value"
  /** The final step moved back toward the start without reaching it. */
  | "partially_returns_toward_start"
  /** The final step moved past the start to the other side. */
  | "moves_beyond_start"
  /** The path before the final step changed direction; only the net is stated. */
  | "multi_step_non_monotonic"
  /** No safe state claim: endpoints are verbatim Riot values only. */
  | "net_unavailable";

export type NetUnavailableReason = "incomparable_shape" | "mixed_components";

export type NetComponent = {
  start: string;
  end: string;
  /** `end − start`, exact decimal. Percent components are percentage points. */
  delta: string;
};

export type ChainNet = {
  startPatch: string;
  endPatch: string;
  /** Value before the first step, verbatim. */
  startRaw: string;
  /** Value after the last step, verbatim. */
  endRaw: string;
  /** Per-component exact deltas; null unless the endpoints are comparable AND a state could be derived. */
  components: NetComponent[] | null;
};

/* -------------------------------------------------------------------------- */
/* Chains (layer 2 — overlay)                                                 */
/* -------------------------------------------------------------------------- */

export type ChainLinkBasis =
  | { kind: "exact_key" }
  | { kind: "approved_alias"; aliasId: string };

export type CatchUpStep = {
  patch: string;
  line: CatchUpRiotLine;
  /** Original payload change, untouched. Same reference as `line.change`. */
  change: PatchReportChange;
  target: PatchReportTarget;
  key: PatchContinuityKey;
  before: ValueFact;
  after: ValueFact;
  /** How this step connects to the previous one; null for the first step. */
  linkFromPrevious: ChainLinkBasis | null;
};

export type CatchUpParameterChain = {
  /** `chain:<identity>` — unique within a report. */
  id: string;
  /** `continuityKeyString` of the first step's key. */
  identity: string;
  scope: ContinuityScope;
  entityKey: string;
  entityName: string;
  /** Distinct keys the chain passes through, oldest first (2 for a renamed property). */
  keys: PatchContinuityKey[];
  /** `approved_alias` when ANY link needed a reviewed alias row. */
  identityProvenance: "exact" | "approved_alias";
  /** One entry per link (`steps.length − 1`). */
  linkBasis: ChainLinkBasis[];
  /** At least two steps, oldest first, every one inside the range. */
  steps: CatchUpStep[];
  valueState: ChainValueState;
  netUnavailableReason: NetUnavailableReason | null;
  net: ChainNet;
  /**
   * A mechanical (prose) line sits in the same entity and group at a step's
   * patch. Wording must state the VALUE ("value back to 10%"), never that a
   * change was "undone".
   */
  concurrentMechanical: boolean;
};

/* -------------------------------------------------------------------------- */
/* Entities and sections                                                      */
/* -------------------------------------------------------------------------- */

export type CatchUpEntityAppearance = {
  patch: string;
  cardIndex: number;
  entityAnchor: string;
  lineCount: number;
};

export type CatchUpEntity = {
  /**
   * `<scope>|<name>` for chainable scopes; `<section>|<type>|<name>` otherwise,
   * so an Arena "Locke" can never merge with the SR "Locke".
   */
  key: string;
  scope: ContinuityScope | null;
  entityType: PatchEntityType;
  name: string;
  sectionKey: string;
  sectionTitle: string;
  /** Cards (with at least one line) this entity appears on, chronological. */
  appearances: CatchUpEntityAppearance[];
  /** EVERY Riot line of this entity in the range, chronological. The complete list. */
  riotLines: CatchUpRiotLine[];
  /** Proven chains over a SUBSET of `riotLines`. Never "all changes". */
  chains: CatchUpParameterChain[];
};

export type CatchUpSection = {
  key: string;
  title: string;
  /** Whether its lines can ever chain (SR Champions/Items). */
  chainable: boolean;
  lineCount: number;
  entityKeys: string[];
  patches: string[];
};

/** A card with no change lines: nothing to show, but never silently dropped. */
export type CatchUpEmptyCard = {
  patch: string;
  cardIndex: number;
  entityName: string;
  sectionKey: string;
};

/* -------------------------------------------------------------------------- */
/* Continuity overlay                                                         */
/* -------------------------------------------------------------------------- */

export type ContinuityRefusal = {
  reason: ContinuityRefusalReason;
  lineIds: string[];
  aliasId?: string;
};

export type UnclassifiedIdentity = {
  identity: string;
  entityKey: string;
  reason: ContinuityRefusalReason;
  lineIds: string[];
};

export type AliasResolution = {
  aliasId: string;
  status: "inactive_out_of_range" | "linked" | "refused";
  reason?: ContinuityRefusalReason;
};

export type CatchUpContinuity = {
  /** `withheld`: coverage is incomplete, so NO continuity claim is made. */
  status: "available" | "withheld";
  withheldReasons: CoverageIssueKind[];
  chains: CatchUpParameterChain[];
  /** Identities with two or more in-range lines that could not be proven continuous. */
  unclassified: UnclassifiedIdentity[];
  refusals: ContinuityRefusal[];
  aliases: AliasResolution[];
};

export type CatchUpTotals = {
  /** Every Riot line in the range. */
  riotLines: number;
  chainedLines: number;
  unchainedLines: number;
  chains: number;
  entities: number;
};

export type CatchUpReport = {
  range: CatchUpRange;
  sincePatch: string;
  throughPatch: string;
  /** Loaded patches inside the range, oldest first. */
  includedPatches: string[];
  coverage: CatchUpCoverage;
  /** LAYER 1: every Riot line in the range, exactly once, chronological report order. */
  lines: CatchUpRiotLine[];
  cardsWithoutChanges: CatchUpEmptyCard[];
  sections: CatchUpSection[];
  entities: CatchUpEntity[];
  /** LAYER 2: optional overlay. A subset of `lines`. */
  continuity: CatchUpContinuity;
  totals: CatchUpTotals;
};

export type RangeInvalidDetail =
  | "since_unparseable"
  | "through_unparseable"
  | "since_after_through";

export type CatchUpResult =
  | { ok: true; report: CatchUpReport }
  | { ok: false; reason: "range_invalid"; detail: RangeInvalidDetail };

/* -------------------------------------------------------------------------- */
/* Aliases                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A reviewed, pinned parameter rename (PH3-A §8). NOT a general synonym: it
 * applies to exactly one pair of lines, identified by scope, entity, slot,
 * group, patch AND the verbatim Riot raw strings. If any pinned string drifts
 * the row stops matching and the link disappears (fail-closed).
 */
export type VerifiedAlias = {
  id: string;
  scope: ContinuityScope;
  /** Entity name as published; matched after `canonicalLabel`. */
  entity: string;
  slot: string | null;
  /** Group title as published; matched after `canonicalLabel`. */
  group: string;
  from: { patch: string; property: string; before: string; after: string };
  to: { patch: string; property: string; before: string; after: string };
  evidence: string[];
  verifiedBy: string;
  verifiedOn: string;
  approval: string;
};

export type CatchUpInput = {
  /** Loaded reports, any order; reports outside the range are ignored. */
  reports: readonly import("@/lib/patch-reports/api").PatchReportDetail[];
  /** Baseline: the patch the user has already seen. EXCLUDED. */
  sincePatch: string;
  /**
   * Explicit last patch (INCLUDED). The domain never reads "latest" from global
   * state; the loader resolves it from the patch index and passes it in.
   */
  throughPatch: string;
  /**
   * Versions the patch index lists. Optional, but without it the domain cannot
   * tell a never-published patch from a report that failed to load, nor where
   * coverage starts, so it is correspondingly more conservative.
   */
  listedVersions?: readonly string[];
  /** Reviewed alias rows; defaults to `VERIFIED_ALIASES`. Pass `[]` to turn aliases off. */
  aliases?: readonly VerifiedAlias[];
};
