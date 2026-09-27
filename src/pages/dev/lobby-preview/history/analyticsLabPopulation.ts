/**
 * HUB6.3D — Analytics Lab POPULATION FIXTURE. Temporary, isolated, replaceable.
 *
 * HUB6.3C (population analytics) is being built separately and has no DTO
 * yet. So that HUB6.3E can design gauges, distributions and "strongest mode"
 * against realistic shapes NOW, this file defines a deterministic,
 * PRE-AGGREGATED population fixture for the Analytics Lab's runs.
 *
 * What it is NOT: production API truth. It does not flow through
 * `/api/history/v1`, the History parser, or `DailyHistoryRecord.population`
 * (which stays `null` from the server). Its shape follows the HUB6.3A
 * blueprint §11-E proposal (status · cohort · users · percentile · median ·
 * frequency table · quantiles · sufficiency; `strongest_mode`), camel-cased,
 * behind `AnalyticsLabPopulationSource` — so when HUB6.3C lands, one adapter
 * maps its real DTO onto these types (or these types are replaced) and no
 * component has to change.
 *
 * No synthetic users: every cohort is a static frequency table (value →
 * count), and a percentile is the blueprint's midrank over that table,
 * (below + ½·equal) / N — exactly what a server would return from the same
 * table. Tables are generated from a fixed deterministic shape, never random.
 */

export type PopulationStatus = "available" | "insufficient" | "unavailable";
export type CohortType = "day" | "rolling_28d";

export interface PopulationFrequency {
  values: number[];
  counts: number[];
  /** Values above this are pooled into the top bin (privacy top-coding). */
  topCodeAbove: number | null;
  bottomCodeBelow: number | null;
}

export interface PopulationMetric {
  /** `correct`, `questions_played`, `accuracy`, `depth`, `score`, `longest_streak`. */
  metric: string;
  stageKind: "daily" | "standard" | "time_trial" | "survival";
  cohort: { type: CohortType; key: string; planDate: string | null };
  asOf: string;
  users: number;
  userValue: number;
  /** Midrank percentile, 0–100; null when insufficient. */
  percentile: number | null;
  median: number | null;
  frequency: PopulationFrequency | null;
  quantiles: { p10: number; p25: number; p50: number; p75: number; p90: number } | null;
  sufficiency: { status: "sufficient" | "insufficient"; observed: number; required: number; reasonCode: string | null };
}

export interface StrongestMode {
  policy: "strongest-v1";
  cohortType: CohortType;
  candidates: Array<{ stageKind: "standard" | "time_trial" | "survival"; metric: string; percentile: number | null; sufficient: boolean }>;
  winner: "standard" | "time_trial" | "survival" | null;
  marginPoints: number | null;
  reasonCode: "no_clear_leader" | "mode_insufficient" | null;
}

export interface AnalyticsLabPopulationFixture {
  runId: string;
  /** Which state this fixture exists to exercise (for the lab's own UI). */
  scenario: string;
  status: PopulationStatus;
  policyVersion: "population-fixture-v0";
  metrics: PopulationMetric[];
  strongestMode: StrongestMode | null;
}

/** The seam HUB6.3C replaces. */
export interface AnalyticsLabPopulationSource {
  forRun(runId: string): AnalyticsLabPopulationFixture | null;
}

// ─────────────────────────────────────────────────────────── table maths

/** The threshold the blueprint recommends, in distinct users. */
export const POPULATION_MIN_USERS = 100;

/**
 * A deterministic bell-shaped frequency table over `[min, max]`: Gaussian
 * weights around `centre`, scaled to exactly `users` by largest remainder.
 * `skew` > 0 fattens the upper tail; `spike` piles extra users on one value
 * (heavy ties at a ceiling).
 */
export function bellTable(opts: {
  min: number; max: number; centre: number; spread: number; users: number;
  skew?: number; spike?: { value: number; share: number };
}): { values: number[]; counts: number[] } {
  const { min, max, centre, spread, users, skew = 0, spike } = opts;
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  const weights = values.map((v) => {
    const z = (v - centre) / spread;
    const tail = v > centre ? 1 + skew * z : 1;
    return Math.exp(-0.5 * z * z) * Math.max(0.05, tail);
  });
  const spiked = spike ? Math.round(users * spike.share) : 0;
  const rest = users - spiked;
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / total) * rest);
  const counts = exact.map(Math.floor);
  let left = rest - counts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k++, left--) counts[order[k % order.length][1]] += 1;
  if (spike) counts[values.indexOf(spike.value)] += spiked;
  return { values, counts };
}

/** Midrank percentile of `value` in a table: (below + ½·equal) / N · 100. */
export function midrankPercentile(table: { values: number[]; counts: number[] }, value: number): number {
  let below = 0;
  let equal = 0;
  let n = 0;
  table.values.forEach((v, i) => {
    n += table.counts[i];
    if (v < value) below += table.counts[i];
    else if (v === value) equal += table.counts[i];
  });
  return n ? Math.round(((below + equal / 2) / n) * 1000) / 10 : 0;
}

function quantile(table: { values: number[]; counts: number[] }, q: number): number {
  const n = table.counts.reduce((a, b) => a + b, 0);
  let seen = 0;
  for (let i = 0; i < table.values.length; i++) {
    seen += table.counts[i];
    if (seen >= q * n) return table.values[i];
  }
  return table.values[table.values.length - 1];
}

/** Pools every value above `above` into one bin at `above` (read "≥ above"). */
export function topCode(table: { values: number[]; counts: number[] }, above: number | null): { values: number[]; counts: number[] } {
  if (above === null) return table;
  const values: number[] = [];
  const counts: number[] = [];
  table.values.forEach((v, i) => {
    if (v < above) { values.push(v); counts.push(table.counts[i]); }
  });
  values.push(above);
  counts.push(table.values.reduce((a, v, i) => a + (v >= above ? table.counts[i] : 0), 0));
  return { values, counts };
}

function metric(opts: {
  metric: string; stageKind: PopulationMetric["stageKind"]; planDate: string; users: number;
  userValue: number; table?: Parameters<typeof bellTable>[0]; cohortType?: CohortType; topCodeAbove?: number;
}): PopulationMetric {
  const { users, userValue } = opts;
  const cohortType = opts.cohortType ?? "day";
  const sufficient = users >= POPULATION_MIN_USERS;
  const base = {
    metric: opts.metric,
    stageKind: opts.stageKind,
    cohort: { type: cohortType, key: `${cohortType}:${opts.stageKind}:${opts.planDate}`, planDate: cohortType === "day" ? opts.planDate : null },
    asOf: `${opts.planDate}T23:30:00.000Z`,
    users,
    userValue,
    sufficiency: {
      status: sufficient ? "sufficient" as const : "insufficient" as const,
      observed: users, required: POPULATION_MIN_USERS, reasonCode: sufficient ? null : "insufficient_population",
    },
  };
  if (!sufficient || !opts.table) {
    return { ...base, percentile: null, median: null, frequency: null, quantiles: null };
  }
  const table = bellTable({ ...opts.table, users });
  return {
    ...base,
    percentile: midrankPercentile(table, userValue),
    median: quantile(table, 0.5),
    // Percentile and quantiles come from the full table (server-side); the
    // PUBLISHED table pools a sparse tail into its top bin.
    frequency: { ...topCode(table, opts.topCodeAbove ?? null), topCodeAbove: opts.topCodeAbove ?? null, bottomCodeBelow: null },
    quantiles: {
      p10: quantile(table, 0.1), p25: quantile(table, 0.25), p50: quantile(table, 0.5),
      p75: quantile(table, 0.75), p90: quantile(table, 0.9),
    },
  };
}

/** The blueprint's strongest-mode rule: all three sufficient in one cohort
 *  type, and the leader ahead of the runner-up by ≥ 10 percentile points. */
function strongest(cands: StrongestMode["candidates"], cohortType: CohortType = "day"): StrongestMode {
  if (cands.some((c) => !c.sufficient || c.percentile === null)) {
    return { policy: "strongest-v1", cohortType, candidates: cands, winner: null, marginPoints: null, reasonCode: "mode_insufficient" };
  }
  const sorted = cands.slice().sort((a, b) => b.percentile! - a.percentile!);
  const margin = Math.round((sorted[0].percentile! - sorted[1].percentile!) * 10) / 10;
  return {
    policy: "strongest-v1", cohortType, candidates: cands,
    winner: margin >= 10 ? sorted[0].stageKind : null,
    marginPoints: margin,
    reasonCode: margin >= 10 ? null : "no_clear_leader",
  };
}

const cand = (m: PopulationMetric, stageKind: "standard" | "time_trial" | "survival") =>
  ({ stageKind, metric: m.metric, percentile: m.percentile, sufficient: m.sufficiency.status === "sufficient" });

/** The three core metrics the blueprint proposes: Standard score, Time Trial
 *  correct, Survival depth — plus the Daily's correct count. */
function day(runId: string, scenario: string, planDate: string, users: number, v: {
  daily: number; std: number; tt: number; surv: number;
}, shapes: {
  daily?: Parameters<typeof bellTable>[0]; std?: Parameters<typeof bellTable>[0];
  tt?: Parameters<typeof bellTable>[0]; surv?: Parameters<typeof bellTable>[0];
  survUsers?: number; ttTopCode?: number;
}): AnalyticsLabPopulationFixture {
  const daily = metric({ metric: "correct", stageKind: "daily", planDate, users, userValue: v.daily, table: shapes.daily });
  const std = metric({ metric: "score", stageKind: "standard", planDate, users, userValue: v.std, table: shapes.std });
  const tt = metric({ metric: "correct", stageKind: "time_trial", planDate, users, userValue: v.tt, table: shapes.tt, topCodeAbove: shapes.ttTopCode });
  const surv = metric({ metric: "depth", stageKind: "survival", planDate, users: shapes.survUsers ?? users, userValue: v.surv, table: shapes.surv });
  return {
    runId, scenario,
    status: users >= POPULATION_MIN_USERS ? "available" : "insufficient",
    policyVersion: "population-fixture-v0",
    metrics: [daily, std, tt, surv],
    strongestMode: users >= POPULATION_MIN_USERS ? strongest([cand(std, "standard"), cand(tt, "time_trial"), cand(surv, "survival")]) : null,
  };
}

const DAILY = (centre: number) => ({ min: 20, max: 100, centre, spread: 11, users: 0 });
const STD = (centre: number) => ({ min: 30, max: 180, centre, spread: 16, users: 0 });
const TT = (centre: number) => ({ min: 4, max: 40, centre, spread: 5, users: 0 });
const SURV = (centre: number, ceiling?: number, share?: number) =>
  ({ min: 2, max: ceiling ?? 40, centre, spread: 6, users: 0, ...(ceiling ? { spike: { value: ceiling, share: share ?? 0.1 } } : {}) });

// The user values are the lab runs' own facts (HUB6.3B golden):
// Daily correct, Standard score, Time Trial correct, Survival depth.
const FIXTURES: AnalyticsLabPopulationFixture[] = [
  day("lab-run-01", "insufficient population (40 players)", "2026-09-01", 40, { daily: 49, std: 95, tt: 19, surv: 14 }, {}),
  day("lab-run-02", "exactly sufficient (100 players)", "2026-09-02", 100,
    { daily: 57, std: 100, tt: 21, surv: 16 }, { daily: DAILY(55), std: STD(92), tt: TT(20), surv: SURV(15) }),
  day("lab-run-05", "~20th percentile", "2026-09-05", 1284,
    { daily: 60, std: 105, tt: 20, surv: 18 }, { daily: DAILY(69), std: STD(119), tt: TT(24), surv: SURV(23) }),
  day("lab-run-06", "~50th percentile", "2026-09-06", 1301,
    { daily: 69, std: 110, tt: 24, surv: 21 }, { daily: DAILY(69), std: STD(110), tt: TT(24), surv: SURV(21) }),
  day("lab-run-08", "~85th percentile; Time Trial strongest", "2026-09-08", 1410,
    { daily: 70, std: 100, tt: 31, surv: 17 }, { daily: DAILY(59), std: STD(98), tt: TT(25), surv: SURV(18) }),
  day("lab-run-09", "one mode insufficient (Survival: 60 players)", "2026-09-09", 1330,
    { daily: 67, std: 95, tt: 26, surv: 20 }, { daily: DAILY(64), std: STD(96), tt: TT(24), surv: SURV(20), survUsers: 60 }),
  day("lab-run-10", "heavy ties at the Survival ceiling", "2026-09-10", 1380,
    { daily: 79, std: 110, tt: 28, surv: 28 }, { daily: DAILY(70), std: STD(104), tt: TT(25), surv: SURV(20, 28, 0.22) }),
  day("lab-run-11", "Survival strongest", "2026-09-11", 1356,
    { daily: 83, std: 105, tt: 27, surv: 33 }, { daily: DAILY(74), std: STD(104), tt: TT(26), surv: SURV(21) }),
  day("lab-run-12", "~98th percentile; Standard strongest", "2026-09-12", 1390,
    { daily: 74, std: 120, tt: 25, surv: 24 }, { daily: DAILY(70), std: STD(88), tt: TT(24), surv: SURV(23) }),
  day("lab-run-13", "no strongest mode (lead under 10 points)", "2026-09-13", 1402,
    { daily: 84, std: 120, tt: 31, surv: 28 }, { daily: DAILY(80), std: STD(116), tt: TT(29), surv: SURV(26) }),
  day("lab-run-14", "extreme outlier + sparse tails (Time Trial top-coded)", "2026-09-14", 1455,
    { daily: 72, std: 110, tt: 24, surv: 26 }, { daily: DAILY(52), std: STD(80), tt: { min: 4, max: 40, centre: 12, spread: 3, users: 0 }, surv: SURV(14), ttTopCode: 22 }),
];

const BY_RUN = new Map(FIXTURES.map((f) => [f.runId, f]));

export const ANALYTICS_LAB_POPULATION: AnalyticsLabPopulationSource = {
  forRun: (runId) => BY_RUN.get(runId) ?? null,
};

/** Every fixture, for tests and the lab's own inspection. */
export const ANALYTICS_LAB_POPULATION_FIXTURES: readonly AnalyticsLabPopulationFixture[] = FIXTURES;
