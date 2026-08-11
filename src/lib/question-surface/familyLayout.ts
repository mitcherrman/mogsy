/**
 * Family layout selection (RA7) — pure, payload-driven, fail-closed.
 *
 * WHY THIS EXISTS
 * The scenario band has two presentations today, chosen by `selectScenario`:
 * a cinematic Broadcast card for rich content, and the short CompactScenarioBand
 * for everything else. Both are SUBJECT-shaped: they draw one champion, one
 * ability, one item row. That shape is right for an identity question and wrong
 * for the two families that dominate Ranked:
 *
 *  - a post-mitigation damage question is a RELATION (attacker → ability →
 *    target) plus three quantities, and rendered as a subject it became a
 *    full-bleed splash of the attacker with an empty "Loadout · Items" row;
 *  - a purchase/sell-swap question is a TRANSACTION over time, and rendered as
 *    a subject it became one undifferentiated item row that asserts the champion
 *    owns everything in it, including what they sold.
 *
 * This module decides which family layout a payload can support. It is a pure
 * function of the payload — never of the prompt text, the category string, the
 * option order, or any mode flag — and it returns `null` for anything it cannot
 * fully support, which is what routes that question back to the existing
 * cinematic/compact presentation unchanged.
 *
 * HIDDEN INFORMATION
 * Every input here is a pre-reveal, question-safe field the backend already
 * projects: role-tagged entities, transaction statuses, and the RA7 premise
 * facts (quantities the prompt states verbatim). Nothing in this module reads
 * `correctAnswer`, reveal state, or option content, so a layout decision cannot
 * vary with the answer and cannot change when the round reveals.
 */

import type { QuizQuestion } from "@/lib/quiz/api";
import {
  getQuestionMediaEntities,
  type AbilityMediaEntity,
  type ChampionMediaEntity,
  type ItemMediaEntity,
  type MediaEntityStatus,
} from "@/components/quiz-broadcast/scenario-cards/questionMediaEntities";
import {
  getQuestionPremiseFacts,
  type QuestionPremiseFacts,
} from "@/components/quiz-broadcast/scenario-cards/questionPremiseFacts";

/**
 * A post-mitigation damage premise: two named sides, an optional ability owned
 * by the attacker, and the quantities the question gives the reader.
 */
export interface CombatFamilyLayout {
  kind: "combat";
  attacker: ChampionMediaEntity;
  target: ChampionMediaEntity;
  /**
   * The ability the attacker casts, when the premise states one. Optional
   * because it genuinely is: a passive ("Jhin's Whisper (fourth shot)") has no
   * canonical `champion_abilities` row, so the backend resolves no ability and
   * the question is still a complete, drawable attacker→target premise.
   */
  ability: AbilityMediaEntity | null;
  /** Items the premise attributes to the target — a defensive purchase. */
  targetItems: ItemMediaEntity[];
  facts: QuestionPremiseFacts & { damageType: NonNullable<QuestionPremiseFacts["damageType"]> };
}

/**
 * One item in a transaction premise, with every stage the premise states for
 * it. Usually exactly one — the backend de-duplicates by name within a
 * collection — but an item CAN legitimately have a history ("started with
 * Doran's Ring … sold Doran's Ring"), and drawing the same icon twice in two
 * columns reads as two items rather than one item's story.
 */
export interface LifecycleEntry {
  item: ItemMediaEntity;
  /** Stages in chronological order; the last one is where the entry renders. */
  statuses: MediaEntityStatus[];
}

/** One stage of the transaction, with the items that END in it. */
export interface LifecycleGroup {
  status: MediaEntityStatus;
  entries: LifecycleEntry[];
}

/**
 * A purchase-history / sell-swap premise: one champion and their items, grouped
 * into the chronological stages the premise states.
 */
export interface LifecycleFamilyLayout {
  kind: "lifecycle";
  champion: ChampionMediaEntity | null;
  groups: LifecycleGroup[];
}

export type FamilyLayout = CombatFamilyLayout | LifecycleFamilyLayout;

/**
 * Chronological order of the transaction stages, and the ONLY stages a
 * lifecycle layout draws. It is the reading order of the premise sentence
 * ("started with … still has … sold … bought"), fixed here so the card's
 * sequence is deterministic and cannot vary with payload order.
 *
 * `current` is deliberately absent as an ORDERING concern below but present
 * here: an inventory question with no sale states no transaction at all, and is
 * handled by requiring at least one non-`current` stage before a lifecycle
 * layout is selected. A mixed payload that somehow carried both keeps `current`
 * first, where "what they simply have" belongs.
 */
const LIFECYCLE_ORDER: MediaEntityStatus[] = [
  "starting",
  "current",
  "retained",
  "purchased",
  "sold",
];

/**
 * Stages that state a TRANSACTION. A premise made only of `current` items is a
 * static loadout — there is no chronology to draw, so it keeps the existing
 * presentation rather than getting a one-row "timeline".
 */
const TRANSACTION_STAGES: ReadonlySet<MediaEntityStatus> = new Set<MediaEntityStatus>([
  "starting",
  "retained",
  "purchased",
  "sold",
]);

function onlyOneWithRole(
  champions: ChampionMediaEntity[],
  role: "attacker" | "target",
): ChampionMediaEntity | null {
  const matches = champions.filter((c) => c.role === role);
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Pick the family layout a payload can support, or `null`.
 *
 * The two family rules are checked in a fixed order because they are not
 * mutually exclusive by accident: an after-purchase damage question states a
 * purchased item, so it would satisfy a naive "has a transaction status" test.
 * Combat is therefore decided first, and the lifecycle rule additionally
 * requires a one-sided premise (no attacker/target champions), which is what
 * the transaction families actually are.
 */
export function selectFamilyLayout(
  source: QuizQuestion | null | undefined,
): FamilyLayout | null {
  if (!source) return null;
  const entities = getQuestionMediaEntities(source);
  if (!entities) return null;

  const combat = selectCombatLayout(source, entities);
  if (combat) return combat;
  return selectLifecycleLayout(entities);
}

function selectCombatLayout(
  source: QuizQuestion,
  entities: NonNullable<ReturnType<typeof getQuestionMediaEntities>>,
): CombatFamilyLayout | null {
  const facts = getQuestionPremiseFacts(source);
  // Both quantities AND the damage type are required. Without the type there is
  // no defensive stat to label, and a tablet reading "60 → 100" of an unnamed
  // stat is exactly the half-complete diagram this layout must never render.
  if (!facts?.damageType || facts.rawDamage === undefined) return null;
  if (facts.targetResist === undefined) return null;

  const attacker = onlyOneWithRole(entities.champions, "attacker");
  const target = onlyOneWithRole(entities.champions, "target");
  if (!attacker || !target) return null;

  // The ability must belong to the attacker to be drawn beside them. An
  // ability the payload attributes elsewhere is dropped rather than
  // mis-attributed; the layout then renders without an ability, which is a
  // shape it already supports.
  const ability =
    entities.abilities.find(
      (a) => a.role === "attacker" && (!a.champion || a.champion === attacker.name),
    ) ?? null;

  return {
    kind: "combat",
    attacker,
    target,
    ability,
    targetItems: entities.items.filter((i) => i.role === "target"),
    facts: { ...facts, damageType: facts.damageType },
  };
}

function selectLifecycleLayout(
  entities: NonNullable<ReturnType<typeof getQuestionMediaEntities>>,
): LifecycleFamilyLayout | null {
  const items = entities.items;
  if (!items.length) return null;
  // A two-sided premise is a combat scenario that failed the combat rule (for
  // example a damage question whose payload predates RA7 and has no facts). It
  // must fall back rather than be redrawn as a shopping timeline.
  if (entities.champions.some((c) => c.role === "attacker" || c.role === "target")) {
    return null;
  }
  if (items.some((i) => i.role !== "subject")) return null;
  // Every item must state what happened to it: a timeline with an unplaceable
  // entry is exactly the half-complete diagram the fallback policy forbids.
  if (items.some((i) => !i.status)) return null;
  if (!items.some((i) => i.status && TRANSACTION_STAGES.has(i.status))) return null;

  // Collapse an item's history onto ONE entry, keyed by canonical id where the
  // payload has one and by name otherwise. Declaration order decides which
  // record supplies the icon; the stages are sorted chronologically so the
  // entry lands in the stage the item ENDS in, whatever order they arrived in.
  const byKey = new Map<string, LifecycleEntry>();
  for (const item of items) {
    const key = String(item.id ?? item.name);
    const existing = byKey.get(key);
    if (existing) {
      if (item.status && !existing.statuses.includes(item.status)) {
        existing.statuses.push(item.status);
      }
      continue;
    }
    byKey.set(key, { item, statuses: item.status ? [item.status] : [] });
  }
  const entries = [...byKey.values()].map((entry) => ({
    ...entry,
    statuses: [...entry.statuses].sort(
      (a, b) => LIFECYCLE_ORDER.indexOf(a) - LIFECYCLE_ORDER.indexOf(b),
    ),
  }));

  const groups: LifecycleGroup[] = LIFECYCLE_ORDER.map((status) => ({
    status,
    entries: entries.filter((e) => e.statuses[e.statuses.length - 1] === status),
  })).filter((group) => group.entries.length > 0);

  if (!groups.length) return null;

  return {
    kind: "lifecycle",
    champion: entities.champions.find((c) => c.role === "subject") ?? null,
    groups,
  };
}
