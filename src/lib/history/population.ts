/**
 * HUB6.3E — HUB6.3C population analytics on History schema v1, typed and
 * parsed (`claude/hub6-3-population` `00c794cd`).
 *
 * WIRE
 * ────
 *   item.population  = { status, reason_code, policy_version,
 *                        metric_policy_version, core: <subject block> | null,
 *                        strongest_mode: [<per cohort type>] | null } | null
 *   stage.population = <subject block> | null   (Standard, Time Trial,
 *                                                Survival; null otherwise)
 *   subject block    = { subject, primary_metric, cohorts: [
 *                        { cohort {type, as_of, window_days, users,
 *                                  observations, generated_at},
 *                          status, reason_code, sufficiency,
 *                          metrics { <metric>: { value, percentile, median,
 *                            quantiles {p10..p90}, histogram {scale, bins[],
 *                            subject_bin} } } } ] }
 *
 * RULES
 * ─────
 *   * Everything is OPTIONAL. An older payload (HUB2.3, HUB6.3B) has no
 *     population and parses to null; personal analytics render without it.
 *   * LENIENT. A malformed block is dropped, never fatal to the record.
 *   * A cohort that is not `available` NEVER carries a percentile, median,
 *     quantiles or histogram here — even if a server sent one — so no
 *     component can show a zero (or any figure) for "not enough players".
 *     The player's own `value` survives: it is their fact, not the cohort's.
 *   * Nothing is recomputed. `strongest_mode` is the server's verdict.
 *   * Percentiles stay 0–1 fractions, as sent.
 */
import type { Sufficiency } from "@/lib/history/contracts";
import { readSufficiencyLoose } from "@/lib/history/personal";

export type PopulationStatus = "available" | "insufficient" | "unavailable" | "not_applicable";
export type CohortType = "rolling_28d" | "same_day" | string;

export interface HistogramBin {
  lower: number | null;
  upper: number | null;
  lowerOpen: boolean;
  upperOpen: boolean;
  upperInclusive: boolean;
  count: number;
}

export interface PopulationHistogram {
  scale: "fraction" | "integer";
  bins: HistogramBin[];
  /** Index into `bins` of the bin holding the player's value. */
  subjectBin: number | null;
}

export interface PopulationQuantiles {
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface PopulationMetric {
  /** The player's own value (always their fact, even when insufficient). */
  value: number | null;
  /** Midrank percentile, 0–1. Null unless the cohort is available. */
  percentile: number | null;
  median: number | null;
  quantiles: PopulationQuantiles | null;
  histogram: PopulationHistogram | null;
}

export interface PopulationCohort {
  type: CohortType;
  asOf: string | null;
  windowDays: number | null;
  users: number | null;
  observations: number | null;
  generatedAt: string | null;
  status: PopulationStatus;
  reasonCode: string | null;
  sufficiency: Sufficiency | null;
  metrics: Record<string, PopulationMetric>;
}

export interface PopulationSubjectBlock {
  /** `core`, `standard`, `time_trial`, `survival`. */
  subject: string;
  primaryMetric: string | null;
  cohorts: PopulationCohort[];
}

export interface StrongestModeCandidate {
  stageKind: string;
  metric: string;
  percentile: number | null;
}

export interface StrongestMode {
  cohortType: CohortType;
  /** The server's winner, or null (with `reasonCode`). */
  stageKind: string | null;
  percentile: number | null;
  margin: number | null;
  candidates: StrongestModeCandidate[];
  /** `margin_below_threshold`, `mode_population_insufficient`, or null. */
  reasonCode: string | null;
}

export interface RunPopulation {
  status: PopulationStatus;
  reasonCode: string | null;
  policyVersion: string | null;
  metricPolicyVersion: string | null;
  core: PopulationSubjectBlock | null;
  strongestMode: StrongestMode[];
}

// ───────────────────────────────────────────────────────────── helpers

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const STATUSES: readonly string[] = ["available", "insufficient", "unavailable", "not_applicable"];
const status = (v: unknown): PopulationStatus | null =>
  typeof v === "string" && STATUSES.includes(v) ? (v as PopulationStatus) : null;

function readHistogram(v: unknown): PopulationHistogram | null {
  if (!isRec(v) || !Array.isArray(v.bins)) return null;
  const bins: HistogramBin[] = [];
  for (const raw of v.bins) {
    if (!isRec(raw)) return null;
    const count = int(raw.count);
    if (count === null || count < 0) return null;
    bins.push({
      lower: num(raw.lower),
      upper: num(raw.upper),
      lowerOpen: raw.lower_open === true,
      upperOpen: raw.upper_open === true,
      upperInclusive: raw.upper_inclusive === true,
      count,
    });
  }
  if (bins.length === 0) return null;
  const subjectBin = int(v.subject_bin);
  return {
    scale: v.scale === "fraction" ? "fraction" : "integer",
    bins,
    subjectBin: subjectBin !== null && subjectBin >= 0 && subjectBin < bins.length ? subjectBin : null,
  };
}

function readQuantiles(v: unknown): PopulationQuantiles | null {
  if (!isRec(v)) return null;
  const q = { p10: num(v.p10), p25: num(v.p25), p50: num(v.p50), p75: num(v.p75), p90: num(v.p90) };
  return Object.values(q).every((x) => x !== null) ? (q as PopulationQuantiles) : null;
}

function readMetric(v: unknown, available: boolean): PopulationMetric {
  const r: Rec = isRec(v) ? v : {};
  const value = num(r.value);
  if (!available) return { value, percentile: null, median: null, quantiles: null, histogram: null };
  const pct = num(r.percentile);
  return {
    value,
    percentile: pct !== null && pct >= 0 && pct <= 1 ? pct : null,
    median: num(r.median),
    quantiles: readQuantiles(r.quantiles),
    histogram: readHistogram(r.histogram),
  };
}

function readCohort(v: unknown): PopulationCohort | null {
  if (!isRec(v)) return null;
  const c: Rec = isRec(v.cohort) ? v.cohort : {};
  const type = str(c.type);
  const st = status(v.status);
  if (!type || !st) return null;
  const available = st === "available";
  const metrics: Record<string, PopulationMetric> = {};
  if (isRec(v.metrics)) {
    for (const [name, raw] of Object.entries(v.metrics)) metrics[name] = readMetric(raw, available);
  }
  return {
    type,
    asOf: str(c.as_of),
    windowDays: int(c.window_days),
    users: int(c.users),
    observations: int(c.observations),
    generatedAt: str(c.generated_at),
    status: st,
    reasonCode: str(v.reason_code),
    sufficiency: readSufficiencyLoose(v.sufficiency),
    metrics,
  };
}

function readSubjectBlockStrict(v: unknown): PopulationSubjectBlock | null {
  if (!isRec(v)) return null;
  const subject = str(v.subject);
  if (!subject) return null;
  const cohorts = (Array.isArray(v.cohorts) ? v.cohorts : [])
    .map(readCohort)
    .filter((x): x is PopulationCohort => x !== null);
  return { subject, primaryMetric: str(v.primary_metric), cohorts };
}

/** A subject block (`stage.population`, `item.population.core`). Null when
 *  absent or unreadable. */
export function readSubjectBlock(v: unknown): PopulationSubjectBlock | null {
  try {
    return readSubjectBlockStrict(v);
  } catch {
    return null;
  }
}

function readStrongest(v: unknown): StrongestMode | null {
  if (!isRec(v)) return null;
  const cohortType = str(v.cohort_type);
  if (!cohortType) return null;
  const candidates = (Array.isArray(v.candidates) ? v.candidates : []).flatMap((raw) => {
    if (!isRec(raw)) return [];
    const stageKind = str(raw.stage_kind);
    const metric = str(raw.metric);
    return stageKind && metric ? [{ stageKind, metric, percentile: num(raw.percentile) }] : [];
  });
  const stageKind = str(v.stage_kind);
  return {
    cohortType,
    stageKind,
    // A winner's percentile only travels with a winner.
    percentile: stageKind ? num(v.percentile) : null,
    margin: num(v.margin),
    candidates,
    reasonCode: str(v.reason_code),
  };
}

/** `item.population`. Null when absent (Free, older payloads) or unreadable. */
export function readRunPopulation(v: unknown): RunPopulation | null {
  if (!isRec(v)) return null;
  try {
    const st = status(v.status);
    if (!st) return null;
    return {
      status: st,
      reasonCode: str(v.reason_code),
      policyVersion: str(v.policy_version),
      metricPolicyVersion: str(v.metric_policy_version),
      core: readSubjectBlock(v.core),
      strongestMode: (Array.isArray(v.strongest_mode) ? v.strongest_mode : [])
        .map(readStrongest)
        .filter((x): x is StrongestMode => x !== null),
    };
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────── queries

/** The cohort of one type in a block, or null. */
export function cohortOf(block: PopulationSubjectBlock | null | undefined, type: CohortType): PopulationCohort | null {
  return block?.cohorts.find((c) => c.type === type) ?? null;
}

/** The server's strongest-mode entry for one cohort type, or null. */
export function strongestFor(pop: RunPopulation | null | undefined, type: CohortType): StrongestMode | null {
  return pop?.strongestMode.find((s) => s.cohortType === type) ?? null;
}

/** The primary cohort (HUB6.3C: `rolling_28d`); `same_day` is additional. */
export const PRIMARY_COHORT: CohortType = "rolling_28d";
export const COHORT_TYPES: readonly CohortType[] = ["rolling_28d", "same_day"];
