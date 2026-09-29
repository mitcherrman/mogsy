/**
 * JP4 — WHAT A BOARD HALF MAY SHOW BESIDE ITS FIXED OBJECTS.
 *
 * Every champion half has the same fixed objects in the same places —
 * portrait, name, level, Q W E R, six item slots, the shard page — and ONE
 * fixed anchor row for state beyond them. This is the rule for that row, so
 * the two halves stay mirrored however much state a step has:
 *
 *   SHOW   an input the current question needs      "Bonus AD 21"
 *          a value this question asks               "Armor ?"
 *          a value learned at THIS reveal           "Armor 24"  (the moment)
 *          a relied-on value learned EARLIER         [Armor] !   (recall it —
 *                                                     the value is one hover
 *                                                     away, never printed)
 *   HIDE   a zero modifier the question is not about (Lethality 0)
 *          a raw damage learned earlier: the ability's own `!` carries it
 *
 * At most `BOARD_ANCHOR_LIMIT` anchors, most important first; everything is
 * still in the State sheet. Pure: reads the served state and K2's knowledge,
 * never correctness, never a computed value.
 */
import type { AbilitySlot, JourneyPublicState, JourneySide, JourneyStat } from "./contract";
import type { JourneyStatKey } from "./stats";
import { markKey, type JourneyMarks } from "./beat";
import {
  learnedRawDamage, learnedStatFact, type JourneyKnowledge, type KnowledgeFact,
} from "./knowledge";

/** One anchor row holds this many anchors on every board density. */
export const BOARD_ANCHOR_LIMIT = 2;

/**
 * `value` a served input · `asked` this question's `?` · `revealed` learned at
 * this reveal (value shown, glows once) · `learned` learned earlier and relied
 * on now (icon + `!`, value on recall) · `recall` relied on, not learned here.
 */
export type AnchorFace = "value" | "asked" | "revealed" | "learned" | "recall";

export type BoardAnchor =
  | { kind: "stat"; key: JourneyStatKey; face: AnchorFace; stat: JourneyStat; fact: KnowledgeFact | null;
    focused: boolean; changed: boolean;
    /** MOTION-V1 — the transition's from/to on this stat, kept all child long. */
    delta: { from: number; to: number } | null;
    /** J3 — an item's served delta on this stat (`stat_change`). */
    gain: number | null }
  | { kind: "readout"; slot: AbilitySlot; face: Exclude<AnchorFace, "value" | "learned">;
    fact: KnowledgeFact | null; focused: boolean; changed: false };

const PRIORITY: Record<AnchorFace, number> = { asked: 4, revealed: 4, learned: 3, recall: 3, value: 1 };

export function boardAnchors(
  state: JourneyPublicState, side: JourneySide, knowledge: JourneyKnowledge, marks: JourneyMarks,
): BoardAnchor[] {
  const id = side.side;
  const step = state.step.index;
  const focused = (kind: "stat" | "ability", key: string) =>
    state.focus.refs.some((r) => r.side === id && r.kind === kind && String(r.key) === key);
  const out: BoardAnchor[] = [];
  for (const stat of side.stats) {
    const delta = marks.stat.get(markKey(id, stat.key)) ?? null;
    const gain = marks.gain.get(markKey(id, stat.key)) ?? null;
    const changed = delta !== null || gain !== null;
    const isFocused = focused("stat", stat.key);
    if (stat.withheld) {
      const fact = learnedStatFact(knowledge, side, stat, step);
      const face: AnchorFace = stat.withheldReason === "asked"
        ? (fact ? "revealed" : "asked")
        : (fact ? "learned" : "recall");
      out.push({ kind: "stat", key: stat.key, face, stat, fact, focused: isFocused, changed, delta: null, gain: null });
      continue;
    }
    // A zero modifier is not state worth a place unless the question is about it.
    if (stat.value === 0 && !isFocused && !changed) continue;
    out.push({ kind: "stat", key: stat.key, face: "value", stat, fact: null, focused: isFocused, changed, delta, gain });
  }
  for (const r of side.readouts ?? []) {
    const fact = learnedRawDamage(knowledge, side, r.slot);
    if (r.reason === "recalled") {
      // Learned earlier: the ability's `!` IS the recall. Nothing is reprinted.
      if (fact) continue;
      out.push({ kind: "readout", slot: r.slot, face: "recall", fact: null, focused: focused("ability", r.slot), changed: false });
      continue;
    }
    const now = fact !== null && fact.child === step;
    out.push({ kind: "readout", slot: r.slot, face: now ? "revealed" : "asked", fact: now ? fact : null,
      focused: focused("ability", r.slot), changed: false });
  }
  const score = (a: BoardAnchor) => PRIORITY[a.face] * 4 + (a.focused ? 2 : 0) + (a.changed ? 1 : 0);
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => score(y.a) - score(x.a) || x.i - y.i)
    .slice(0, BOARD_ANCHOR_LIMIT)
    // Chosen by importance, drawn in reading order (stats, then abilities).
    .sort((x, y) => x.i - y.i)
    .map(({ a }) => a);
}
