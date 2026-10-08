/**
 * DCMOD-E — WHAT EACH STAGE IS CALLED, so players learn the game modes.
 *
 * One table, used by every surface that names a stage: the Daily intro's
 * lineup, the stage intro tag, the in-match header tag, the stage result and
 * the final recap. A mode is always named the same way, which is how "Time
 * Trial" becomes something a player recognises rather than a word on one
 * screen.
 *
 * Copy only. Rules numbers (a bank's length, a strike allowance) are read off
 * the stage's frozen ruleset and never restated here.
 */
import type { DailyRuleset, DailyStage, DailyStageKind } from "./contracts";
import { stageCategory, type DailyStageCategory } from "./stageCategory";

export interface StageIdentity {
  kind: DailyStageKind;
  /** The tag: "TIME TRIAL". Rendered uppercase by CSS. */
  label: string;
  /** Reusable ruleset stages vs the Daily's own special stages. */
  family: "ruleset" | "special";
  /** The product grouping (`stageCategory`). Nothing draws it yet. */
  category: DailyStageCategory;
  /** One sentence of rules, for the stage intro. */
  rule: string;
}

const IDENTITY: Record<DailyStageKind, Omit<StageIdentity, "rule" | "category"> & { rule: (r: DailyRuleset | null) => string }> = {
  standard: {
    kind: "standard", label: "Standard", family: "ruleset",
    rule: () => "Every answer scores. Play the whole stage.",
  },
  time_trial: {
    kind: "time_trial", label: "Time Trial", family: "ruleset",
    rule: (r) => {
      const s = r?.timeBankMs ? Math.round(r.timeBankMs / 1000) : null;
      return s
        ? `One ${s}-second bank for the whole stage. It only runs while you can answer.`
        : "One time bank for the whole stage. It only runs while you can answer.";
    },
  },
  survival: {
    kind: "survival", label: "Survival", family: "ruleset",
    rule: (r) => (r?.maxStrikes
      ? `${r.maxStrikes} mistakes end the stage.`
      : "Too many mistakes end the stage."),
  },
  // DV2-P0: the one rule every card stage shares. It says nothing about which
  // stat or how many cards: those are on the stage's own content line.
  order_forge: {
    kind: "order_forge", label: "Order Forge", family: "special",
    rule: () => "Order the cards from highest to lowest by the shown stat.",
  },
  // DV2-P0: the two Review-section stages are told apart by WHERE their questions
  // come from. Weak Areas reads your history; Recently Missed reads this Daily.
  weak_areas: {
    kind: "weak_areas", label: "Weak Areas", family: "special",
    rule: () => "From your history — fresh questions from areas you've struggled with before.",
  },
  review: {
    kind: "review", label: "Recently Missed", family: "special",
    rule: () => "From today — retry the knowledge you missed in this Daily.",
  },
};

export function stageIdentity(stage: Pick<DailyStage, "kind" | "ruleset">): StageIdentity {
  const row = IDENTITY[stage.kind];
  return {
    kind: row.kind, label: row.label, family: row.family,
    category: stageCategory(row.kind), rule: row.rule(stage.ruleset),
  };
}

/**
 * What a SKIPPED stage's recap row says. Only the reasons the server states
 * are worded; a reason this client does not recognise, or none at all, reads
 * as the neutral "Not played" — never a claim that the stage was unneeded, which is
 * true of a perfect Review and false of a Weak Areas that could not be built.
 */
export function skippedStageNote(stage: Pick<DailyStage, "kind" | "skipReason">): string {
  switch (stage.skipReason) {
    case "perfect":
      return stage.kind === "review" ? "Nothing missed" : "Not played";
    case "weak_areas_unavailable":
      return stage.kind === "weak_areas" ? "Not enough past misses" : "Not played";
    case "review_items_unavailable":
      return stage.kind === "review" ? "Couldn't be replayed" : "Not played";
    default:
      return "Not played";
  }
}

/**
 * The secondary ruleset tag a SPECIAL stage shows when it is played under a
 * non-standard ruleset ("WEAK AREAS · SURVIVAL"). Null otherwise: a reusable
 * stage IS its ruleset, and a special stage played as Standard needs no tag.
 */
export function specialStageRulesetLabel(stage: Pick<DailyStage, "kind" | "ruleset">): string | null {
  if (IDENTITY[stage.kind].family !== "special") return null;
  const id = stage.ruleset?.id;
  return id && id !== "standard" ? IDENTITY[id].label : null;
}

/** "Champion Mastery — Ahri", or the title alone, or null. */
export function stageContentLine(stage: Pick<DailyStage, "content">): string | null {
  const c = stage.content;
  if (!c) return null;
  return c.focus ? `${c.title} — ${c.focus}` : c.title;
}
