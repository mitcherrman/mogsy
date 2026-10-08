/**
 * DV2-P2B — what a Daily History row leads with, and what it says about the
 * run's optional activities. Pure reads of the parsed record.
 *
 * THE COMPATIBILITY BOUNDARY IS `main`
 * ────────────────────────────────────
 * A record WITHOUT `main` (v1–v4, or any payload from a backend before B2)
 * keeps its headline exactly as it always was: `record.basic`.
 *
 * A record WITH `main` (plan v5+) is the MAIN Daily: its headline score is
 * the server's frozen `main.dailyScore`, and its correct / answered /
 * accuracy are the persisted Standard stage's own. `record.basic` is the
 * aggregate of every settled stage — it grows as optional stages settle and
 * is never the headline. If such a record somehow carries no single Standard
 * stage, the headline keeps the frozen score and shows no C/A or accuracy
 * rather than borrowing the aggregate.
 */
import type { DailyHistoryRecord, HistoryStage } from "@/lib/history/contracts";

export interface DailyHeadline {
  /** `main`: the v5+ main Daily. `legacy`: `record.basic`, as before. */
  source: "main" | "legacy";
  score: number;
  /** Null only for a main record without its Standard stage (neutral). */
  correct: number | null;
  answered: number | null;
  /** Null at zero answered, as everywhere in History, or when neutral. */
  accuracy: number | null;
}

/** The record's one Standard stage, or null when there is not exactly one. */
function mainStage(record: DailyHistoryRecord): HistoryStage | null {
  const standard = record.stages.filter((s) => s.kind === "standard");
  return standard.length === 1 ? standard[0] : null;
}

export function dailyHeadline(record: DailyHistoryRecord): DailyHeadline {
  if (record.main === null) {
    const { score, correct, answered, accuracy } = record.basic;
    return { source: "legacy", score, correct, answered, accuracy };
  }
  const standard = mainStage(record);
  return {
    source: "main",
    score: record.main.dailyScore,
    correct: standard ? standard.basic.correct : null,
    answered: standard ? standard.basic.answered : null,
    accuracy: standard ? standard.basic.accuracy : null,
  };
}

/**
 * The optional activities of a main Daily whose parent is still active:
 *
 *   `open`      today's Daily — they can still be played
 *   `unplayed`  an earlier day's — the live Daily resumes only today's run,
 *               so they were simply not played
 *
 * Null for everything else: a resolved parent, a legacy record, or a payload
 * without a `parent` block (older backend — never read as "active").
 */
export type OptionalActivities = "open" | "unplayed";

/** The UTC calendar day — the Daily's own day boundary. */
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export function optionalActivities(record: DailyHistoryRecord, now: Date = new Date()): OptionalActivities | null {
  if (record.main === null || record.parent?.status !== "active") return null;
  return record.planDate >= utcDay(now) ? "open" : "unplayed";
}

export const OPTIONAL_ACTIVITIES_COPY: Readonly<Record<OptionalActivities, string>> = {
  open: "Optional challenges still open",
  unplayed: "Optional challenges not played",
};

/**
 * Whether the run's own "Run analysis" (the Daily Overview) is withheld: the
 * server said there is no run-level analysis BECAUSE the parent's optional
 * activities are open (B2 `not_applicable`). Its settled stages keep their own
 * analysis. Any other `not_applicable` run keeps the existing behaviour.
 */
export function runOverviewWithheld(record: DailyHistoryRecord): boolean {
  return record.capability.state === "not_applicable" && record.parent?.status === "active";
}
