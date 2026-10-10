/**
 * JATTN1 — THE BOARD'S ATTENTION GRAMMAR: three different things a board
 * object can say, never folded into one cue.
 *
 *   CHANGED       the simulated game state just changed: a level, an ability
 *                 rank / unlock, a purchased item (and the stat lines it
 *                 granted). Green — the existing beat motion, change stamp and
 *                 gain tags, and one resting face: a thin green inner rim on
 *                 every changed object for the child right after the
 *                 transition (`state.transition`; gone with the next child).
 *   SAVED         a revealed fact is retained on the board for later
 *                 inspection. Gold — the persistent `!` (`knowledge.ts`), plus
 *                 a brief anchored "Saved" tag during the reveal hold. NOT
 *                 "correct": a wrong answer or a timeout saves the same fact.
 *                 A stat merely STATED by a premise is inspectable (the
 *                 portrait popup lists it) but is not Saved.
 *   RELEVANT NOW  this object is what the current question is about. Ice —
 *                 outset corner brackets, drawn in once when the child opens.
 *                 Read ONLY from the server's `focus` (and `focus.target_stat`
 *                 for a Combat target), so a comparison marks both compared
 *                 sides symmetrically and no cue ever names a value.
 *
 * Pure: every input is already on screen or in the served payload; nothing
 * here reads an answer, a reveal's correctness, or a value. Identical in every
 * host (Daily Standard, Survival, admin playtest, Journey Library): nothing
 * here knows which one it is in.
 */
import type { AbilitySlot, JourneyPublicState, JourneySideId } from "./contract";
import { markKey, transitionMarks } from "./beat";
import { knowledgeKeyFor, type JourneyKnowledge } from "./knowledge";
import type { JourneyJ3 } from "./j3";
import { championPortraitPopup, type ChampionPortraitPopup } from "./portraitPopup";

export interface ObjectAttention {
  changed: boolean;
  saved: boolean;
  relevant: boolean;
}

/** The board objects the grammar speaks about, keyed by kind and side. */
export type BoardObjectRef =
  | { kind: "ability"; side: JourneySideId; slot: AbilitySlot }
  | { kind: "portrait"; side: JourneySideId }
  | { kind: "level"; side: JourneySideId }
  | { kind: "item"; side: JourneySideId; slot: number };

export const boardObjectKey = (o: BoardObjectRef): string =>
  (o.kind === "ability" ? `ability:${o.side}:${o.slot}`
    : o.kind === "item" ? `item:${o.side}:${o.slot}` : `${o.kind}:${o.side}`);

const NONE: ObjectAttention = Object.freeze({ changed: false, saved: false, relevant: false });

export interface BoardAttention {
  of(o: BoardObjectRef): ObjectAttention;
  /** Every object with any state, for tests and the inspector. */
  entries(): [string, ObjectAttention][];
}

/** The accessible suffix an object carries while the RELEVANT cue is on it. */
export const RELEVANT_LABEL = "relevant to this question";

/** The board's two portrait popups, when the caller already built them. */
export type PortraitPopups = Partial<Record<JourneySideId, ChampionPortraitPopup | null>>;

/**
 * One board state → each object's three states. `knowledge` is K2's join (the
 * Saved facts, never the open child's); `journey` is the reached prefix, for
 * the portrait's champion-stat facts (`championPortraitPopup().learned`) —
 * or `popups`, the same popups already built for this state.
 */
export function boardAttention(state: JourneyPublicState, knowledge: JourneyKnowledge,
  journey: JourneyJ3 | null, popups?: PortraitPopups): BoardAttention {
  const out = new Map<string, ObjectAttention>();
  const put = (o: BoardObjectRef, patch: Partial<ObjectAttention>) => {
    const key = boardObjectKey(o);
    out.set(key, { ...(out.get(key) ?? NONE), ...patch });
  };

  // RELEVANT NOW — the server's focus, nothing else (no `relies_on` tier yet).
  for (const r of state.focus.refs) {
    if (r.kind === "ability") put({ kind: "ability", side: r.side, slot: r.key }, { relevant: true });
    // A champion's stats live in its portrait popup: the portrait is the object.
    if (r.kind === "stat") put({ kind: "portrait", side: r.side }, { relevant: true });
    if (r.kind === "level") put({ kind: "level", side: r.side }, { relevant: true });
    if (r.kind === "item") put({ kind: "item", side: r.side, slot: r.key }, { relevant: true });
  }

  // CHANGED — the transition INTO this node, for the child right after it.
  const marks = transitionMarks(state.transition);
  for (const side of state.sides) {
    const id = side.side;
    if (marks.level[id]) put({ kind: "level", side: id }, { changed: true });
    for (const a of side.abilities) {
      if (marks.rank.has(markKey(id, a.slot)) || marks.unlocked.has(markKey(id, a.slot))) {
        put({ kind: "ability", side: id, slot: a.slot }, { changed: true });
      }
    }
    for (const it of side.items) {
      if (marks.newItems.has(markKey(id, it.slot))) put({ kind: "item", side: id, slot: it.slot }, { changed: true });
    }
  }

  // SAVED — a revealed fact retained on the object (never a stated premise).
  for (const side of state.sides) {
    const id = side.side;
    for (const a of side.abilities) {
      if (knowledge.has(knowledgeKeyFor(side, a.slot))) put({ kind: "ability", side: id, slot: a.slot }, { saved: true });
    }
    const popup = popups && id in popups ? popups[id]
      : championPortraitPopup(journey, knowledge, id === "subject" ? "player" : "opponent", state.step.index);
    if (popup?.learned) put({ kind: "portrait", side: id }, { saved: true });
  }

  return {
    of: (o) => out.get(boardObjectKey(o)) ?? NONE,
    entries: () => [...out.entries()],
  };
}
