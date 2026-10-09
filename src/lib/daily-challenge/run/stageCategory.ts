/**
 * DV2-P0 — THE DAILY'S PRESENTATION CATEGORY AUTHORITY.
 *
 * The approved Daily V2 product grouping, written down once so no screen
 * invents its own:
 *
 *   MAIN      Standard
 *   BONUS     Survival · Time Trial · Order Forge
 *   TRAINING  Weak Areas · Review (backend kind `review`, shown to players as "Recently Missed")
 *
 * `training` is the INTERNAL stage category. The future user-facing REVIEW
 * umbrella (Weak Areas + Recently Missed) is a P2 presentation concern and is
 * deliberately not encoded here.
 *
 * A category is a property of the KIND; it says nothing about stage status
 * or completion.
 *
 * DV2-P2A — the player-facing SECTIONS are drawn from it, for plan v5+ runs
 * only (`hasMainDaily`): main → TODAY'S CHALLENGE, bonus → MORE CHALLENGES,
 * training → REVIEW. A v1–v4 run is one linear challenge and is never drawn
 * in sections, whatever kinds it contains.
 */
import type { DailyRun, DailyStage, DailyStageKind } from "./contracts";
import { DAILY_STAGE_KINDS } from "./contracts";

export type DailyStageCategory = "main" | "bonus" | "training";

export const DAILY_STAGE_CATEGORY: Readonly<Record<DailyStageKind, DailyStageCategory>> = {
  standard: "main",
  survival: "bonus",
  time_trial: "bonus",
  order_forge: "bonus",
  weak_areas: "training",
  review: "training",
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

// ── DV2-P2A: the player-facing sections (plan v5+ only) ─────────────────────

export type DailySectionId = "today" | "more" | "review";

const SECTION_OF: Readonly<Record<DailyStageCategory, DailySectionId>> = {
  main: "today",
  bonus: "more",
  training: "review",
};

/** The section headings, exactly as players read them. */
export const DAILY_SECTION_LABEL: Readonly<Record<DailySectionId, string>> = {
  today: "Today's Challenge",
  more: "More Challenges",
  review: "Review",
};

/** Which section a stage belongs to. Only meaningful for a v5+ run. */
export function dailySection(stage: Pick<DailyStage, "kind">): DailySectionId {
  return SECTION_OF[stageCategory(stage.kind)];
}

export interface DailySectionGroup {
  id: DailySectionId;
  label: string;
  /** The section's stages that are in THIS run, in the server's order. */
  stages: DailyStage[];
}

/**
 * The run's stages grouped into its sections, in play order. A section with no
 * stage in this run is left out (an ineligible player has no Weak Areas, but
 * always has Recently Missed). The reader has already refused a v5 run whose
 * sections step back, so grouping never reorders a stage.
 */
export function dailySections(run: Pick<DailyRun, "stages">): DailySectionGroup[] {
  return (["today", "more", "review"] as const)
    .map((id) => ({ id, label: DAILY_SECTION_LABEL[id], stages: run.stages.filter((s) => dailySection(s) === id) }))
    .filter((g) => g.stages.length > 0);
}
