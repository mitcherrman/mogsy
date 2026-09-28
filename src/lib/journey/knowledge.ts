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
 *
 * JP2 — THE BOARD IS THE MEMORY SURFACE. Two more kinds, so a chain that
 * teaches a formula and then applies it reads off the board instead of off a
 * dependency panel:
 *
 *   `ability_damage_formula` — REVEALED only (a formula the learner was taught
 *     by a reveal, e.g. a recognition question). Its K1 object is the ability.
 *     The line wraps; the text is the reveal's, in the Journey's AD wording.
 *     A formula merely STATED as a premise is still not marked: it is on the
 *     question that states it.
 *   `ability_raw_damage` — JREF1's raw result. K1 publishes it with
 *     `object: null`, so it is ANCHORED instead by the establishing child's
 *     own asked field (`state.withheld`: `abilities.<slot>.raw_damage`,
 *     reason `asked`) — the backend's value-free statement of exactly which
 *     board object the answer belongs to. Only that one field name anchors:
 *     a matchup's `cooldown` is asked of BOTH sides (its answer is a champion,
 *     not a number), and Combat damage after armor relates two objects (K1's
 *     reason for `object: null`), so neither is ever marked this way.
 *
 * Still deferred: Combat damage after armor, cooldown compare, stated facts.
 * No item fact kind exists, so no item is ever marked.
 */
import type { JourneyJ3, J3AsksFact, J3FactContext, J3KnowledgeObject } from "./j3";
import { JOURNEY_KNOWLEDGE_OBJECT_CONTRACT } from "./j3";
import type { AbilitySlot, JourneySide } from "./contract";
import { isJourneyStatKey, JOURNEY_STAT_META } from "./stats";
import { explicitAdText } from "./statWording";

export const KNOWLEDGE_MARK_KINDS = [
  "ability_cooldown",
  "ability_cooldown_under_haste",
  "champion_stat_at_level",
  "ability_damage_formula",
  "ability_raw_damage",
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
  // One fact per (kind, establishing child, object), whichever channel names
  // it first — an anchored raw result and its later ledger entry are one fact.
  const seen = new Set<string>();
  let openFact: string | null = null;
  const anchors = anchoredObjects(journey);
  const add = (f: { fact: string; kind: string; object: J3KnowledgeObject | null; context: J3FactContext; unit: "seconds" | null },
    child: number) => {
    const anchor = !f.object && f.kind === RAW_DAMAGE_KIND ? anchors.get(child) ?? null : null;
    const object = f.object ?? anchor?.object ?? null;
    if (!object || !isMarkKind(f.kind) || facts.has(f.fact)) return;
    const identity = `${f.kind}@${child}@${object.key}`;
    if (seen.has(identity)) return;
    const shown = display(child);
    if (shown === null || shown === "") return;
    seen.add(identity);
    const context = anchor && f.context.rank === undefined ? { ...f.context, rank: anchor.rank } : f.context;
    facts.set(f.fact, { fact: f.fact, kind: f.kind, child, display: shown, unit: f.unit, context, object });
  };
  for (const c of journey.children) {
    const asks: J3AsksFact | null = c.learner.asksFact;
    if (openIndex !== null && c.index === openIndex && asks) openFact = asks.fact;
    // Stated facts carry their value on the card that states them, not in a
    // reveal, so a stated fact is never marked.
    for (const e of c.learner.established) {
      if (e.source === "revealed") add({ fact: e.fact, kind: e.kind, object: null, context: {}, unit: null, ...e.knowledge }, e.child);
    }
    if (asks && byChild.has(asks.child)) add(asks, asks.child);
    // JP2 — a revealed child whose asked value has no K1 object but whose
    // asked FIELD names one (the raw result): marked from its own reveal, so
    // the fact is on the board from the reveal on, not only once a later
    // child's ledger lists it.
    if (!asks && anchors.has(c.index) && byChild.has(c.index) && c.index !== openIndex) {
      add({ fact: `asked:${c.index}:${anchors.get(c.index)!.field}`, kind: RAW_DAMAGE_KIND, object: null, context: {}, unit: null }, c.index);
    }
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

const RAW_DAMAGE_KIND = "ability_raw_damage";
/** The one asked-field shape that anchors an object-less fact (see the header). */
const RAW_DAMAGE_FIELD = /^abilities\.([QWER])\.raw_damage$/;

/**
 * Each reached child whose OWN asked field is an ability's raw damage → that
 * ability as a knowledge object, read from the child's own public state (its
 * side's champion id and the ability's rank there). Value-free: a field name
 * and the state's identity, nothing else.
 */
function anchoredObjects(journey: JourneyJ3): Map<number, { object: J3KnowledgeObject; rank: number; field: string }> {
  const out = new Map<number, { object: J3KnowledgeObject; rank: number; field: string }>();
  for (const c of journey.children) {
    const asked = c.state.withheld.filter((w) => w.reason === "asked");
    if (asked.length !== 1) continue;
    const m = RAW_DAMAGE_FIELD.exec(asked[0].field);
    if (!m) continue;
    const side = c.state.sides[asked[0].side];
    const slot = m[1] as AbilitySlot;
    const ability = side.abilities.find((a) => a.slot === slot);
    if (!ability) continue;
    out.set(c.index, {
      object: { type: "ability", key: `${asked[0].side}:${side.championId}:${slot}`, side: asked[0].side, championId: side.championId, slot },
      rank: ability.rank,
      field: asked[0].field,
    });
  }
  return out;
}

/** The K1 key of a board object (`subject` is K1's `player`). */
export function knowledgeKeyFor(side: Pick<JourneySide, "side" | "championId">, slot: AbilitySlot | null = null): string {
  const k1 = side.side === "subject" ? "player" : "opponent";
  return slot ? `${k1}:${side.championId}:${slot}` : `${k1}:${side.championId}`;
}

// ── the popover's lines (pure: formatting only, no arithmetic) ─────────────

export type KnowledgeIcon = "cooldown" | "haste" | "stat" | "formula" | "damage";

export interface KnowledgeLine {
  icon: KnowledgeIcon;
  /** What the value is, when the icon alone does not say ("Armor", "Raw damage"). */
  label: string | null;
  /** Leading context the header could not factor out (e.g. "R2", "Lv5"). */
  lead: string | null;
  /** The value, with its unit: "5s", "50", a formula. */
  value: string;
  /** Trailing context: "10 AH". */
  tail: string | null;
  /** 1-based step that established it. */
  step: number;
  /** A long value (a formula) wraps instead of widening the popover. */
  wrap: boolean;
  /** Screen-reader sentence. */
  spoken: string;
}

export interface KnowledgeCard {
  /** "E · Shadow Slash · R1", "R", "Lv3". */
  title: string;
  lines: KnowledgeLine[];
}

/** A fact's provenance, as the Journey says it: "learned Step 2" (JP3). */
export const stepLabel = (step: number) => `learned Step ${step}`;

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

/**
 * One object's facts as a popover card. `abilityName` (the board's own label
 * for the ability) only titles the card; nothing is read from it.
 */
export function knowledgeCard(mark: KnowledgeObjectMark, abilityName: string | null = null,
  championName: string | null = null): KnowledgeCard {
  const { object, facts } = mark;
  if (object.type === "ability") {
    // A formula holds at every rank, so it never splits the header's rank.
    const ranked = facts.filter((f) => f.kind !== "ability_damage_formula");
    const rank = common(ranked.map((f) => f.context.rank ?? null));
    const title = [object.slot, abilityName, rank ? `R${rank}` : null].filter(Boolean).join(" · ");
    const name = abilityName ?? object.slot;
    return {
      title,
      lines: facts.map((f) => {
        const step = f.child + 1;
        const rankWords = f.context.rank ? ` at rank ${f.context.rank}` : "";
        const lead = f.kind !== "ability_damage_formula" && rank === undefined && f.context.rank ? `R${f.context.rank}` : null;
        if (f.kind === "ability_damage_formula") {
          const value = explicitAdText(f.display);
          return { icon: "formula", label: "Formula", lead: null, value, tail: null, step, wrap: true,
            spoken: `${name} damage formula: ${value}, ${stepLabel(step)}` };
        }
        if (f.kind === "ability_raw_damage") {
          return { icon: "damage", label: "Raw damage", lead, value: f.display, tail: null, step, wrap: false,
            spoken: `${name} raw damage before armor${rankWords}: ${f.display}, ${stepLabel(step)}` };
        }
        const value = withUnit(f.display, f.unit);
        const ah = f.kind === "ability_cooldown_under_haste" && f.context.abilityHaste !== undefined
          ? `${plain(f.context.abilityHaste)} AH` : null;
        return {
          icon: ah ? "haste" : "cooldown", label: null, lead, value, tail: ah, step, wrap: false,
          spoken: `${object.slot} cooldown${rankWords}${ah ? ` with ${ah.replace("AH", "ability haste")}` : ""}: ${value}, ${stepLabel(step)}`,
        };
      }),
    };
  }
  const level = common(facts.map((f) => f.context.level));
  return {
    title: [championName, level !== undefined ? `Lv${level}` : null].filter(Boolean).join(" · "),
    lines: facts.map((f) => ({
      icon: "stat",
      label: statLabel(f.context.stat),
      lead: level === undefined && f.context.level !== undefined ? `Lv${f.context.level}` : null,
      value: withUnit(f.display, f.unit),
      tail: null,
      step: f.child + 1,
      wrap: false,
      spoken: `${statLong(f.context.stat)}${f.context.level !== undefined ? ` at level ${f.context.level}` : ""}: ${withUnit(f.display, f.unit)}, ${stepLabel(f.child + 1)}`,
    })),
  };
}

// ── JP3 — THE BOARD AS THE LEARNER'S NOTEBOOK ─────────────────────────────
//
// One grammar: a gold `!` means the learner established knowledge about THIS
// piece of game state earlier in the Journey. It sits on the most specific
// board object the fact is about — an ability's facts on its icon, a stat's
// fact on that stat's chip, anything else on the champion's portrait — and a
// learned value FILLS the board's `?` for it (Armor ? → Armor 24). Joins only:
// the facts and their displays are K2's, never recomputed or inferred.

/** A board stat that is withheld (`?` or recalled), as the chip sees it. */
export interface WithheldStatRef {
  key: string;
  withheldReason?: "asked" | "recalled" | null;
  recalledFrom?: { child: number } | null;
}

/**
 * The learned fact that fills a WITHHELD stat chip, or null. An asked stat is
 * filled by the fact its own child establishes (present only once that child
 * is revealed — K2 drops the open child's fact); a recalled stat by the fact
 * the server says it recalls (the establishing child).
 */
export function learnedStatFact(
  knowledge: JourneyKnowledge, side: Pick<JourneySide, "side" | "championId">, stat: WithheldStatRef, stepIndex: number,
): KnowledgeFact | null {
  const mark = knowledge.get(knowledgeKeyFor(side));
  if (!mark) return null;
  const child = stat.withheldReason === "asked" ? stepIndex
    : stat.withheldReason === "recalled" ? stat.recalledFrom?.child ?? null : null;
  if (child === null) return null;
  return mark.facts.find((f) => f.kind === "champion_stat_at_level" && f.context.stat === stat.key && f.child === child) ?? null;
}

/** The latest learned raw-damage fact on one ability, or null. */
export function learnedRawDamage(
  knowledge: JourneyKnowledge, side: Pick<JourneySide, "side" | "championId">, slot: AbilitySlot,
): KnowledgeFact | null {
  const mark = knowledge.get(knowledgeKeyFor(side, slot));
  const raws = mark ? mark.facts.filter((f) => f.kind === "ability_raw_damage") : [];
  return raws.length ? raws[raws.length - 1] : null;
}

/** One object's mark without the given facts (drawn elsewhere); null when none remain. */
export function markWithout(mark: KnowledgeObjectMark | null, drawn: ReadonlySet<string>): KnowledgeObjectMark | null {
  if (!mark) return null;
  const facts = mark.facts.filter((f) => !drawn.has(f.fact));
  return facts.length ? { ...mark, facts } : null;
}

/** A single fact as its own mark (a stat chip's `!`). */
export const markOf = (mark: KnowledgeObjectMark, fact: KnowledgeFact): KnowledgeObjectMark =>
  ({ key: mark.key, object: mark.object, facts: [fact] });
