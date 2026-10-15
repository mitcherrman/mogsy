/**
 * GM-R1 RANGEFINDER — which authority records may become a PLACE round.
 *
 * The backend's CHAMPDATA Pass 12 range authority publishes a TYPED SET of
 * distances per ability and refuses to serve a single number whenever the
 * published cast range is not a plain per-rank ladder. R1 narrows that
 * further: a round must be a single, finite, state-free CAST_RANGE that the
 * Academy instrument can represent exactly. Every exclusion is named so the
 * pool shrinks for a stated reason, never silently.
 *
 * This module is pure. It knows the authority's record shape and the
 * instrument's resolution; it knows nothing about React, the arena or the
 * player. The capture script and the tests both run it.
 */

/** One record of `champion_ability_canonical/data/range_authority.json`. */
export interface RangeAuthorityRecord {
  champion: string;
  slot: string;
  ability: string;
  targeting: string | null;
  rank_count: number;
  cast_range_by_rank: number[] | null;
  cast_range_global: boolean;
  cast_range_note: string | null;
  components: ReadonlyArray<{ type: string; value: string; note?: string | null; is_global?: boolean }>;
  authority_source_url: string;
  authority_revision_id: number;
}

/**
 * The instrument's resolution. Riot authors ability ranges on a 25-unit
 * lattice (258 of the 267 single-value cast ranges in the authority sit on
 * it); the nine that do not are refused, not rounded.
 */
export const RANGEFINDER_STEP_UNITS = 25;
/** Below this the instrument has no stop: no cast range in the authority is shorter. */
export const RANGEFINDER_MIN_UNITS = 100;
/** The far lens' reach. Ziggs R (5000) is the longest finite single cast range published. */
export const RANGEFINDER_MAX_UNITS = 6000;

/** Targeting modes whose cast range means one unambiguous thing. */
const CLEAN_TARGETING = new Set(["unit", "location", "direction"]);

/** Cast-range notes that say the published number is not the plain fact. */
const UNSAFE_NOTE = /\b(bug|see notes|total range|estimated|based off)\b/i;

export type IneligibleReason =
  | "no cast range ladder published"
  | "cast range varies by rank"
  | "cast range is global"
  | "mixed or non-spatial targeting"
  | "not on the 25-unit lattice"
  | "outside the instrument's reach"
  | "cast range component is not a single plain number"
  | "authority note qualifies the number";

export interface EligibleRangeRecord {
  champion: string;
  slot: "Q" | "W" | "E" | "R";
  ability: string;
  targeting: "Unit" | "Location" | "Direction";
  castRangeUnits: number;
  sourceUrl: string;
  revisionId: number;
}

export type EligibilityVerdict =
  | { eligible: true; record: EligibleRangeRecord }
  | { eligible: false; reason: IneligibleReason; detail?: string };

export function judgeRangeRecord(r: RangeAuthorityRecord): EligibilityVerdict {
  const ladder = r.cast_range_by_rank;
  if (!ladder || ladder.length === 0) {
    return { eligible: false, reason: "no cast range ladder published", detail: r.cast_range_note ?? undefined };
  }
  if (r.cast_range_global) return { eligible: false, reason: "cast range is global" };
  if (new Set(ladder).size !== 1) return { eligible: false, reason: "cast range varies by rank", detail: ladder.join(" / ") };
  const units = ladder[0];
  if (!Number.isFinite(units) || units <= 0) return { eligible: false, reason: "no cast range ladder published" };

  const targeting = (r.targeting ?? "").trim();
  if (!CLEAN_TARGETING.has(targeting.toLowerCase())) {
    return { eligible: false, reason: "mixed or non-spatial targeting", detail: targeting || "(none)" };
  }

  const castComponents = r.components.filter((c) => c.type === "CAST_RANGE");
  if (castComponents.length !== 1) {
    return { eligible: false, reason: "cast range component is not a single plain number", detail: `${castComponents.length} CAST_RANGE components` };
  }
  const component = castComponents[0];
  if (component.is_global) return { eligible: false, reason: "cast range is global" };
  if (String(component.value).trim() !== String(Math.trunc(units))) {
    return { eligible: false, reason: "cast range component is not a single plain number", detail: component.value };
  }
  if (component.note && UNSAFE_NOTE.test(component.note)) {
    return { eligible: false, reason: "authority note qualifies the number", detail: component.note };
  }

  if (units % RANGEFINDER_STEP_UNITS !== 0) return { eligible: false, reason: "not on the 25-unit lattice", detail: String(units) };
  if (units < RANGEFINDER_MIN_UNITS || units > RANGEFINDER_MAX_UNITS) {
    return { eligible: false, reason: "outside the instrument's reach", detail: String(units) };
  }

  const slot = r.slot.trim().toUpperCase();
  if (slot !== "Q" && slot !== "W" && slot !== "E" && slot !== "R") {
    return { eligible: false, reason: "mixed or non-spatial targeting", detail: `slot ${r.slot}` };
  }
  const cleanTargeting = (targeting[0].toUpperCase() + targeting.slice(1).toLowerCase()) as EligibleRangeRecord["targeting"];
  return {
    eligible: true,
    record: {
      champion: r.champion, slot, ability: r.ability, targeting: cleanTargeting,
      castRangeUnits: units, sourceUrl: r.authority_source_url, revisionId: r.authority_revision_id,
    },
  };
}

export interface RangeAuthorityCapture {
  capturedAt: string;
  source: { file: string; repoCommit: string | null; authorityHost: string };
  rules: readonly string[];
  population: number;
  eligible: readonly EligibleRangeRecord[];
  excluded: ReadonlyArray<{ champion: string; slot: string; ability: string; reason: IneligibleReason; detail?: string }>;
}

export const RANGEFINDER_R1_RULES: readonly string[] = [
  "the authority publishes a plain per-rank CAST_RANGE ladder (cast_range_by_rank non-null)",
  "the ladder holds one value across every rank (no per-rank ladders)",
  "the cast range is finite, never Global",
  "targeting is exactly Unit, Location or Direction (no mixed-mode or Auto/Vector/Proximity casts)",
  "exactly one CAST_RANGE component, equal to the ladder, with no qualifying note (BUG / see notes / total range / estimated / based off)",
  `the value sits on the ${RANGEFINDER_STEP_UNITS}-unit lattice within [${RANGEFINDER_MIN_UNITS}, ${RANGEFINDER_MAX_UNITS}]`,
];

export function buildRangeAuthorityCapture(
  rows: readonly RangeAuthorityRecord[],
  source: RangeAuthorityCapture["source"],
  capturedAt: string,
): RangeAuthorityCapture {
  const eligible: EligibleRangeRecord[] = [];
  const excluded: Array<RangeAuthorityCapture["excluded"][number]> = [];
  for (const r of rows) {
    const v = judgeRangeRecord(r);
    if (v.eligible === true) {
      eligible.push(v.record);
    } else {
      const refusal = v as Extract<EligibilityVerdict, { eligible: false }>;
      excluded.push({ champion: r.champion, slot: r.slot, ability: r.ability, reason: refusal.reason, ...(refusal.detail ? { detail: refusal.detail } : {}) });
    }
  }
  eligible.sort((a, b) => a.champion.localeCompare(b.champion) || "QWER".indexOf(a.slot) - "QWER".indexOf(b.slot));
  return { capturedAt, source, rules: RANGEFINDER_R1_RULES, population: rows.length, eligible, excluded };
}
