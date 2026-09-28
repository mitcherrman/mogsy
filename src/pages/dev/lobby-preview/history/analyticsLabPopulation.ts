/**
 * HUB6.3E — the Analytics Lab's POPULATION RECIPES (replaces HUB6.3D's
 * temporary, camel-cased fixture).
 *
 * The lab's population now arrives the way production's will: inside
 * `item.population` / `stage.population` of HUB6.3C's real
 * `GET /api/history/v1` (`00c794cd`), read by the production parser. Nothing
 * on this page computes a percentile, a median, a quantile or a histogram.
 *
 * WHAT A RECIPE IS
 * ────────────────
 * For each lab Daily, per cohort type (`rolling_28d`, `same_day`): how many
 * players the cohort holds, and where this player's value should stand among
 * them (a target midrank percentile per subject and metric).
 * `scripts/hub63-generate-analytics-lab.py` turns that into a value → count
 * table AROUND THE PLAYER'S REAL VALUE (read with HUB6.3C's own
 * `population.load_observations`), then stores it with HUB6.3C's own
 * `_write_date` → `summarize` (median, quantiles, privacy-merged histogram,
 * frequency) and drives the real route. The percentile the page shows is the
 * backend's midrank over that table, not the target — targets only steer the
 * table's centre.
 *
 * No synthetic users and no user records: a cohort is only a list of
 * values, exactly what HUB6.3C's `summarize` receives. The recipes are part
 * of the hashed lab input (`analyticsLabInput`), so the golden records what
 * it was built from.
 */

export type PopulationSubject = "core" | "standard" | "time_trial" | "survival";
export type CohortTypeName = "rolling_28d" | "same_day";

/** HUB6.3C's metric list per subject (`population.METRICS`), in order. */
export const POPULATION_METRICS: Readonly<Record<PopulationSubject, readonly string[]>> = {
  core: ["correct", "accuracy", "longest_streak"],
  standard: ["score", "correct", "accuracy", "longest_streak"],
  time_trial: ["correct", "questions_played", "accuracy", "longest_streak"],
  survival: ["depth", "correct", "accuracy", "longest_streak"],
};

/** HUB6.3C's sufficiency floor, in distinct users (`population.MIN_USERS`). */
export const POPULATION_MIN_USERS = 100;

export interface CohortRecipe {
  /** Players in the cohort (the player included). Below 100: insufficient. */
  users: number;
  /** A different count for one subject (e.g. Survival alone insufficient). */
  usersBySubject?: Partial<Record<PopulationSubject, number>>;
  /** Target midrank percentile (0–1) per subject and metric. */
  targets: Record<PopulationSubject, Record<string, number>>;
  /** A share of the cohort tied exactly at the player's value, nobody above
   *  (Survival's supply ceiling). */
  ties?: { subject: PopulationSubject; metric: string; share: number };
  /** The player far above everyone else: the rest stop well short, so the
   *  player lands in HUB6.3C's open-ended overflow bin. */
  outlier?: { subject: PopulationSubject; metric: string };
}

export interface RunPopulationRecipe {
  runId: string;
  planDate: string;
  /** What this Daily exists to show (for the lab's own documentation). */
  scenario: string;
  /** False: no aggregate for this date — the backend says
   *  `aggregate_not_built`. */
  built: boolean;
  cohorts: Partial<Record<CohortTypeName, CohortRecipe>>;
}

const clamp = (p: number) => Math.max(0.03, Math.min(0.97, Math.round(p * 1000) / 1000));

/**
 * Targets for one cohort: each subject's PRIMARY (core: correct) at the given
 * percentile, the secondaries a fixed, deterministic step away — so a room's
 * dials differ, as real metrics would.
 */
export function targets(p: { core: number; standard: number; time_trial: number; survival: number }):
  CohortRecipe["targets"] {
  const steps = [0, -0.07, 0.05, -0.11];
  const out = {} as CohortRecipe["targets"];
  for (const subject of Object.keys(POPULATION_METRICS) as PopulationSubject[]) {
    out[subject] = Object.fromEntries(POPULATION_METRICS[subject].map((metric, i) =>
      [metric, i === 0 ? p[subject] : clamp(p[subject] + steps[i % steps.length])]));
  }
  return out;
}

const rolling = (users: number, p: Parameters<typeof targets>[0], extra: Partial<CohortRecipe> = {}): CohortRecipe =>
  ({ users, targets: targets(p), ...extra });

/** A same-day cohort too small to use: the backend says insufficient. */
const smallDay = (users: number): CohortRecipe =>
  ({ users, targets: targets({ core: 0.5, standard: 0.5, time_trial: 0.5, survival: 0.5 }) });

const all = (p: number) => ({ core: p, standard: p, time_trial: p, survival: p });

export const ANALYTICS_LAB_POPULATION_RECIPES: readonly RunPopulationRecipe[] = [
  { runId: "lab-run-01", planDate: "2026-09-01", scenario: "insufficient population (40 players)", built: true,
    cohorts: { rolling_28d: rolling(40, all(0.5)), same_day: smallDay(40) } },
  { runId: "lab-run-02", planDate: "2026-09-02", scenario: "exactly sufficient (100 players)", built: true,
    cohorts: { rolling_28d: rolling(100, { core: 0.56, standard: 0.52, time_trial: 0.6, survival: 0.47 }), same_day: smallDay(31) } },
  { runId: "lab-run-03", planDate: "2026-09-03", scenario: "rolling available; same day insufficient (88)", built: true,
    cohorts: { rolling_28d: rolling(240, { core: 0.61, standard: 0.58, time_trial: 0.55, survival: 0.63 }), same_day: smallDay(88) } },
  { runId: "lab-run-04", planDate: "2026-09-04", scenario: "Time Trial strongest (moderate lead)", built: true,
    cohorts: { rolling_28d: rolling(420, { core: 0.66, standard: 0.55, time_trial: 0.8, survival: 0.49 }), same_day: smallDay(64) } },
  { runId: "lab-run-05", planDate: "2026-09-05", scenario: "≈20th percentile", built: true,
    cohorts: { rolling_28d: rolling(1284, { core: 0.2, standard: 0.23, time_trial: 0.18, survival: 0.26 }), same_day: smallDay(72) } },
  { runId: "lab-run-06", planDate: "2026-09-06", scenario: "≈50th percentile", built: true,
    cohorts: {
      rolling_28d: rolling(1301, { core: 0.5, standard: 0.49, time_trial: 0.52, survival: 0.5 }),
      same_day: rolling(146, { core: 0.47, standard: 0.5, time_trial: 0.55, survival: 0.44 }),
    } },
  { runId: "lab-run-07", planDate: "2026-09-07", scenario: "aggregate not built for this date", built: false, cohorts: {} },
  { runId: "lab-run-08", planDate: "2026-09-08", scenario: "≈85th percentile; Time Trial strongest", built: true,
    cohorts: {
      rolling_28d: rolling(1410, { core: 0.85, standard: 0.6, time_trial: 0.88, survival: 0.55 }),
      same_day: rolling(152, { core: 0.82, standard: 0.64, time_trial: 0.9, survival: 0.5 }),
    } },
  { runId: "lab-run-09", planDate: "2026-09-09", scenario: "one mode insufficient (Survival: 60 players)", built: true,
    cohorts: {
      rolling_28d: rolling(1330, { core: 0.7, standard: 0.64, time_trial: 0.76, survival: 0.6 }, { usersBySubject: { survival: 60 } }),
      same_day: smallDay(70),
    } },
  { runId: "lab-run-10", planDate: "2026-09-10", scenario: "heavy ties at the Survival ceiling (22%)", built: true,
    cohorts: {
      rolling_28d: rolling(1380, { core: 0.74, standard: 0.52, time_trial: 0.66, survival: 0.9 },
        { ties: { subject: "survival", metric: "depth", share: 0.22 } }),
      same_day: smallDay(81),
    } },
  { runId: "lab-run-11", planDate: "2026-09-11", scenario: "Survival strongest", built: true,
    cohorts: {
      rolling_28d: rolling(1356, { core: 0.8, standard: 0.61, time_trial: 0.7, survival: 0.94 }),
      same_day: rolling(161, { core: 0.78, standard: 0.58, time_trial: 0.73, survival: 0.95 }),
    } },
  { runId: "lab-run-12", planDate: "2026-09-12", scenario: "≈98th percentile; Standard strongest", built: true,
    cohorts: {
      rolling_28d: rolling(1390, { core: 0.97, standard: 0.98, time_trial: 0.71, survival: 0.66 }),
      same_day: smallDay(94),
    } },
  { runId: "lab-run-13", planDate: "2026-09-13", scenario: "no strongest mode (lead under 10 points)", built: true,
    cohorts: {
      rolling_28d: rolling(1402, { core: 0.76, standard: 0.74, time_trial: 0.77, survival: 0.7 }),
      same_day: rolling(158, { core: 0.72, standard: 0.73, time_trial: 0.79, survival: 0.71 }),
    } },
  { runId: "lab-run-14", planDate: "2026-09-14", scenario: "extreme outlier (Time Trial correct in the overflow bin)", built: true,
    cohorts: {
      rolling_28d: rolling(1455, { core: 0.88, standard: 0.71, time_trial: 0.99, survival: 0.8 },
        { outlier: { subject: "time_trial", metric: "correct" } }),
      same_day: rolling(173, { core: 0.84, standard: 0.66, time_trial: 0.97, survival: 0.83 }),
    } },
];
