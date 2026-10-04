/**
 * Patch Impact domain types.
 *
 * Pure data contracts: no React, no I/O. Everything here is derived from Riot's
 * published patch lines plus (only where a proof exists) Mogzy's canonical
 * champion data. See ./README.md for the full rule set.
 */

/** Supported base-stat families. `attack_speed` is parameter-only in V1. */
export type ImpactFamily = "health" | "ad" | "armor" | "mr" | "mana" | "attack_speed";

export type ImpactHalf = "base" | "growth";

export type ImpactProvenance =
  /** This change's own Riot before/after (parsed by the controlled grammar). */
  | "riot_line"
  /** Another supported Riot line in the same card (the companion half). */
  | "riot_same_card"
  /** Live canonical `champion_stats`, held constant across the patch (proven). */
  | "canonical_current"
  /** The `before_raw` of the earliest later Riot line for the same parameter. */
  | "riot_later_before";

export type ImpactUnavailableReason =
  /** Not a Champions-section champion Base Stats numeric line. */
  | "out_of_scope"
  /** `mogzy_property` is null. Never re-mapped from wording. */
  | "property_unmapped"
  /** Mapped, but not a V1 property. */
  | "property_unsupported"
  /** Grammar refusal: shape / unit mismatch, ranges, qualifiers, negatives. */
  | "unparseable_value"
  /** Parsed cleanly but before and after state the same value. */
  | "no_parameter_change"
  /** Several lines in the card claim the same half, or overlap a compound. */
  | "ambiguous_card_lines"
  /** Attack-speed family: parameter facts only in V1. */
  | "projection_deferred"
  /** `mogzy_entity_ref` null, or no unique canonical row. */
  | "identity_unresolved"
  /** Canonical stats or the later-report chain has not been supplied. */
  | "history_incomplete"
  /** A Base Stats line the controlled grammar cannot classify to any family. */
  | "unclassified_base_stat_change"
  /** A same-family line the grammar could not turn into a proven change. */
  | "family_continuity_unproven"
  /** Later Riot lines do not link up with each other / with live canonical. */
  | "companion_chain_break"
  /** Canonical value for the companion is not a usable number. */
  | "canonical_value_invalid"
  | "reconciliation_failed"
  /** Mana family, but canonical `mp` is 0 (no mana resource). */
  | "no_resource";

/** Why a relative delta is not available. Never emit Infinity/NaN. */
export type RelDeltaUnavailableReason = "zero_baseline";

export type ParameterFact = {
  family: ImpactFamily;
  half: ImpactHalf;
  /** Registry key of the half this fact describes (e.g. `base_ad`). */
  property: string;
  before: number;
  after: number;
  absDelta: number;
  /** `(after − before) / before`; `null` when `before` is 0. */
  relDelta: number | null;
  relDeltaUnavailableReason: RelDeltaUnavailableReason | null;
  /** `percent_points` only for attack-speed growth. */
  unit: "flat" | "percent_points";
  provenance: "riot_line";
};

export type StatValue = {
  value: number;
  provenance: ImpactProvenance;
  /** Patch the value is anchored to, when it comes from a later report. */
  patch?: string;
};

export type LevelPoint = {
  level: number;
  before: number;
  after: number;
  absDelta: number;
  relDelta: number | null;
  relDeltaUnavailableReason: RelDeltaUnavailableReason | null;
};

export type ProjectionInputs = {
  baseBefore: StatValue;
  baseAfter: StatValue;
  growthBefore: StatValue;
  growthAfter: StatValue;
};

export type ProjectionTrust = {
  /** Any half is `canonical_current` / `riot_later_before`. */
  usesMogzyData: boolean;
  /** Canonical champion name the companion was read from, if canonical was used. */
  canonicalEntity: string | null;
  /** Later report versions whose lines were proven not to disturb the companion. */
  laterVersionsChecked: string[];
};

export type StatProjection = {
  family: Exclude<ImpactFamily, "attack_speed">;
  inputs: ProjectionInputs;
  trust: ProjectionTrust;
  /** Exactly 18 points, L1..L18. */
  levels: LevelPoint[];
  checkpoints: readonly [1, 6, 11, 18];
  /** First level whose sign differs from the previous non-zero sign, else null. */
  crossoverLevel: number | null;
};

export type PatchImpactAnalysis =
  | { status: "unavailable"; reason: ImpactUnavailableReason }
  | {
      status: "parameter_only";
      family: ImpactFamily;
      facts: ParameterFact[];
      projectionUnavailable: ImpactUnavailableReason;
    }
  | {
      status: "projected";
      family: Exclude<ImpactFamily, "attack_speed">;
      facts: ParameterFact[];
      projection: StatProjection;
    };
