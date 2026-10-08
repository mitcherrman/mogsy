/**
 * DV2-P0 — THE DAILY'S PRESENTATION CATEGORY AUTHORITY.
 *
 * The approved Daily V2 product grouping, written down once so no screen
 * invents its own:
 *
 *   MAIN      Standard
 *   BONUS     Survival · Time Trial · Order Forge
 *   REVIEW    Weak Areas · Recently Missed (the user-facing name of kind `review`)
 *
 * PREPARATION ONLY. Nothing renders these groups yet: today's backend still
 * shuffles the stages and Standard is not guaranteed first, so a "Today's
 * Challenge complete → More Challenges" presentation would be false. The
 * grouped presentation is P2, after the backend contract lands. A category is
 * a property of the KIND; it says nothing about stage status or completion.
 */
import type { DailyStageKind } from "./contracts";
import { DAILY_STAGE_KINDS } from "./contracts";

export type DailyStageCategory = "main" | "bonus" | "review";

export const DAILY_STAGE_CATEGORY: Readonly<Record<DailyStageKind, DailyStageCategory>> = {
  standard: "main",
  survival: "bonus",
  time_trial: "bonus",
  order_forge: "bonus",
  weak_areas: "review",
  review: "review",
};

/** The category a stage kind belongs to. */
export function stageCategory(kind: DailyStageKind): DailyStageCategory {
  return DAILY_STAGE_CATEGORY[kind];
}

/**
 * The same lookup for a kind that arrives as a bare string (History rows, a
 * server newer than this client). Null for a kind this client does not know:
 * an unknown kind is never filed under a group by guesswork.
 */
export function stageCategoryOf(kind: string): DailyStageCategory | null {
  return (DAILY_STAGE_KINDS as readonly string[]).includes(kind)
    ? DAILY_STAGE_CATEGORY[kind as DailyStageKind]
    : null;
}
