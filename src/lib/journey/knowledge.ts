/**
 * K2 — JOURNEY KNOWLEDGE MARKS (`journey_knowledge_object.v1`, backend K1).
 *
 * WHAT A MARK MEANS. The Journey has ESTABLISHED usable knowledge about a game
 * object — a fact revealed after the child that asked it settled. It is NOT a
 * correctness badge: a wrong answer or a timeout still establishes the fact,
 * and nothing here reads `is_correct`.
 *
 * THE JOIN (K1 handoff §1.3; the backend's reference is `_marks()` in
 * `test_journey_k1_knowledge_objects.py`):
 *
 *   for each reached child c:
 *     c.learner.established[] with object, source "revealed"   → mark
 *     c.learner.asks_fact with object AND reveal(asks.child)    → mark
 *   drop the fact the OPEN child asks                           (S4)
 *   de-duplicate by fact
 *   display := reveal(child).correct_answer_display ?? reveal(child).correct_answer
 *
 * THE DISPLAYED VALUE IS THE REVEAL'S, VERBATIM. The ledger's `value` is the
 * canonical unrounded number (a haste cooldown of 10.909… the learner was
 * shown as "11"), so it is never printed and never rounded here. A fact whose
 * reveal is not in the payload has no display and no mark — nothing is
 * inferred, and a value the client should not know is never merely hidden.
 *
 * V1 KINDS. Only facts that sit on a visible object as a compact number:
 * `ability_cooldown`, `ability_cooldown_under_haste`, `champion_stat_at_level`.
 * Deferred: the stated `ability_damage_formula` (a formula does not fit a
 * two-line popover), and every `object: null` fact (Combat damage, cooldown
 * compare). No item fact kind exists, so no item is ever marked.
 */
import type { JourneyJ3, J3AsksFact, J3FactContext, J3KnowledgeObject } from "./j3";
import { JOURNEY_KNOWLEDGE_OBJECT_CONTRACT } from "./j3";
import type { AbilitySlot, JourneySide } from "./contract";
import { isJourneyStatKey, JOURNEY_STAT_META } from "./stats";

export const KNOWLEDGE_MARK_KINDS = [
  "ability_cooldown",
  "ability_cooldown_under_haste",
  "champion_stat_at_level",
] as const;
export type KnowledgeMarkKind = (typeof KNOWLEDGE_MARK_KINDS)[number];
const isMarkKind = (k: string): k is KnowledgeMarkKind => (KNOWLEDGE_MARK_KINDS as readonly string[]).includes(k);

/** The settled reveal fields the join reads — nothing else of a reveal. */
export interface KnowledgeReveal {
  challengeIndex: number;
  correctAnswer: string | null;
  correctAnswerDisplay?: string | null;
}

export interface KnowledgeFact {
  fact: string;
  kind: KnowledgeMarkKind;
  /** The child whose reveal established it (0-based). */
  child: number;
  /** The reveal's player-facing value, verbatim. */
  display: string;
  unit: "seconds" | null;
  context: J3FactContext;
}

export interface KnowledgeObjectMark {
  /** K1's stable object key: `<side>:<champion_id>[:<slot>]`. */
  key: string;
  object: J3KnowledgeObject;
  /** Ascending by the child that established each. */
  facts: KnowledgeFact[];
}

/** Object key → its established facts. Empty = no marks anywhere. */
export type JourneyKnowledge = ReadonlyMap<string, KnowledgeObjectMark>;
export const NO_KNOWLEDGE: JourneyKnowledge = new Map();

/**
 * One segment state → the marks it supports. `openIndex` is the server's
 * `own_card_index` (the card still answerable, or null once finished).
 */
export function journeyKnowledge(
  journey: JourneyJ3 | null | undefined,
  reveals: readonly KnowledgeReveal[],
  openIndex: number | null,
): JourneyKnowledge {
  if (!journey || journey.reask || journey.knowledgeContract !== JOURNEY_KNOWLEDGE_OBJECT_CONTRACT) return NO_KNOWLEDGE;
  const byChild = new Map(reveals.map((r) => [r.challengeIndex, r] as const));
  const display = (child: number): string | null => {
    const r = byChild.get(child);
    if (!r) return null;
    return r.correctAnswerDisplay ?? r.correctAnswer ?? null;
  };
  const facts = new Map<string, KnowledgeFact & { object: J3KnowledgeObject }>();
  let openFact: string | null = null;
  const add = (f: { fact: string; kind: string; object: J3KnowledgeObject | null; context: J3FactContext; unit: "seconds" | null },
    child: number) => {
    if (!f.object || !isMarkKind(f.kind) || facts.has(f.fact)) return;
    const shown = display(child);
    if (shown === null || shown === "") return;
    facts.set(f.fact, { fact: f.fact, kind: f.kind, child, display: shown, unit: f.unit, context: f.context, object: f.object });
  };
  for (const c of journey.children) {
    const asks: J3AsksFact | null = c.learner.asksFact;
    if (openIndex !== null && c.index === openIndex && asks) openFact = asks.fact;
    // Stated facts of a v1 kind carry their value on the card, not in a
    // reveal; the only one K1 produces is the formula (deferred), so a stated
    // fact is never marked in V1.
    for (const e of c.learner.established) {
      if (e.source === "revealed" && e.knowledge) add({ fact: e.fact, kind: e.kind, ...e.knowledge }, e.child);
    }
    if (asks && byChild.has(asks.child)) add(asks, asks.child);
  }
  if (openFact !== null) facts.delete(openFact);
  const out = new Map<string, KnowledgeObjectMark>();
  for (const { object, ...fact } of facts.values()) {
    const mark = out.get(object.key) ?? { key: object.key, object, facts: [] };
    mark.facts.push(fact);
    out.set(object.key, mark);
  }
  for (const m of out.values()) m.facts.sort((a, b) => a.child - b.child || a.fact.localeCompare(b.fact));
  return out;
}

/** The K1 key of a board object (`subject` is K1's `player`). */
export function knowledgeKeyFor(side: Pick<JourneySide, "side" | "championId">, slot: AbilitySlot | null = null): string {
  const k1 = side.side === "subject" ? "player" : "opponent";
  return slot ? `${k1}:${side.championId}:${slot}` : `${k1}:${side.championId}`;
}

// ── the popover's lines (pure: formatting only, no arithmetic) ─────────────

export type KnowledgeIcon = "cooldown" | "haste" | "stat";

export interface KnowledgeLine {
  icon: KnowledgeIcon;
  /** Leading context the header could not factor out (e.g. "R2", "Lv5"). */
  lead: string | null;
  /** The value, with its unit: "5s", "50". */
  value: string;
  /** Trailing context: "10 AH". */
  tail: string | null;
  /** 1-based step. */
  step: number;
  /** Screen-reader sentence. */
  spoken: string;
}

export interface KnowledgeCard {
  /** "E · R1", "R", "Lv3". */
  title: string;
  lines: KnowledgeLine[];
}

/** ① … ⑳, then (21). The step marker is the fact's whole provenance. */
export function stepMarker(step: number): string {
  return step >= 1 && step <= 20 ? String.fromCodePoint(0x2460 + step - 1) : `(${step})`;
}

const withUnit = (v: string, unit: "seconds" | null) => (unit === "seconds" ? `${v}s` : v);
const statLabel = (stat: string | undefined) =>
  (stat && isJourneyStatKey(stat) ? JOURNEY_STAT_META[stat].short : (stat ?? "").replace(/_/g, " "));
const statLong = (stat: string | undefined) =>
  (stat && isJourneyStatKey(stat) ? JOURNEY_STAT_META[stat].long : (stat ?? "").replace(/_/g, " "));
/** A context number as served (JSON 10.0 is already 10). Never rounded. */
const plain = (n: number) => String(n);

function common<T>(xs: T[]): T | undefined {
  return xs.length > 0 && xs.every((x) => x === xs[0]) ? xs[0] : undefined;
}

export function knowledgeCard(mark: KnowledgeObjectMark): KnowledgeCard {
  const { object, facts } = mark;
  if (object.type === "ability") {
    const rank = common(facts.map((f) => f.context.rank ?? null));
    const title = rank ? `${object.slot} · R${rank}` : object.slot;
    return {
      title,
      lines: facts.map((f) => {
        const lead = rank === undefined && f.context.rank ? `R${f.context.rank}` : null;
        const value = withUnit(f.display, f.unit);
        const ah = f.kind === "ability_cooldown_under_haste" && f.context.abilityHaste !== undefined
          ? `${plain(f.context.abilityHaste)} AH` : null;
        const rankWords = f.context.rank ? ` at rank ${f.context.rank}` : "";
        return {
          icon: ah ? "haste" : "cooldown", lead, value, tail: ah, step: f.child + 1,
          spoken: `${object.slot} cooldown${rankWords}${ah ? ` with ${ah.replace("AH", "ability haste")}` : ""}: ${value}, step ${f.child + 1}`,
        };
      }),
    };
  }
  const level = common(facts.map((f) => f.context.level));
  return {
    title: level !== undefined ? `Lv${level}` : "",
    lines: facts.map((f) => ({
      icon: "stat",
      lead: level === undefined && f.context.level !== undefined ? `Lv${f.context.level}` : null,
      value: `${statLabel(f.context.stat)} ${withUnit(f.display, f.unit)}`,
      tail: null,
      step: f.child + 1,
      spoken: `${statLong(f.context.stat)}${f.context.level !== undefined ? ` at level ${f.context.level}` : ""}: ${withUnit(f.display, f.unit)}, step ${f.child + 1}`,
    })),
  };
}
