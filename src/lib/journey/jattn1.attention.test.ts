/**
 * JATTN1 — THE BOARD'S ATTENTION GRAMMAR, as pure semantics, on REAL captures
 * from the JATTN1 backend (`__fixtures__/jattn1/`: `focus.target_stat`, the
 * damage facts' ability objects) and, for compatibility, the older JP5 ones:
 *
 *   CHANGED / SAVED / RELEVANT are three separate states of one object;
 *   a stated premise is not Saved; a wrong answer's reveal still Saves;
 *   the open child's fact never leaks; raw damage is placed by its structured
 *   object (the field-name anchor is legacy-only); a comparison is relevant on
 *   both sides; `focus.target_stat` alone decides the target cue; an item's
 *   stat lines join their purchase by item id; the saved line speaks only
 *   public values.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound, type SegmentStateView } from "@/lib/ranked-public/contracts";
import { journeyViewFor } from "./adapter";
import { boardAttention, boardObjectKey, persistentBoardFacts, savedBoardAnnouncement } from "./attention";
import { itemGainTags } from "./beat";
import { readJourneyJ3 } from "./j3";
import { journeyKnowledge } from "./knowledge";
import { championPortraitPopup } from "./portraitPopup";
import type { CaptureSnapshot } from "./realFixtures";
import type { JourneyTransition } from "./contract";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const answersOf = (n: string) => {
  const [dir, file] = n.split("/");
  return JSON.parse(readFileSync(join(FIX, dir, "answers", `${file}.answers.json`), "utf8")) as
    { index: number; correct_answer: string }[];
};
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const seg = (s: CaptureSnapshot) => readPublicRound(s.envelope).segmentState;

/** The production path: segment → board view + K2 knowledge → the attention grammar. */
function at(n: string, label: string) {
  const state = seg(snap(n, label))!;
  return attentionOf(state);
}
function attentionOf(state: SegmentStateView) {
  const view = journeyViewFor(state.journey, {
    ownNextChallengeIndex: state.ownNextChallengeIndex, ownCardStartedAt: state.ownCardStartedAt,
    ownFinished: state.ownFinished,
  }, state.ownChallengeReveals)!;
  const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
  return { state, view, knowledge, attention: boardAttention(view.board, knowledge, state.journey) };
}

const REF = "jattn1/zed_ahri.reference";
const REF_WRONG = "jattn1/zed_ahri.reference.wrong";
const EXT = "jattn1/ashe_jinx.extended";
const EXT_WRONG = "jattn1/ashe_jinx.extended.wrong";
const DAILY = "jattn1/voli.standard";
const SURVIVAL = "jattn1/voli.survival";
const ALL = [REF, REF_WRONG, "jattn1/zed_ahri.reference.timeout", EXT, EXT_WRONG, DAILY, "jattn1/pantheon.standard",
  SURVIVAL, "jattn1/ahri.survival"];

describe("the wire: `focus.target_stat` (additive to v1)", () => {
  const combatFocus = (n: string, label: string, child: number) => seg(snap(n, label))!.journey!.children[child].state.focus;

  it("reads armor on a post-mitigation child, nothing on a raw one, and null on an older payload", () => {
    expect(combatFocus(REF, "child3-live", 3)).toMatchObject({ engine: "combat", targetSide: "opponent", targetStat: "armor" });
    expect(combatFocus(REF, "child1-live", 1)).toMatchObject({ engine: "combat", targetStat: null });
    // The JP5 backend never sent the key: it reads null — never guessed.
    expect(combatFocus("jp5/zed_ahri.reference", "child3-live", 3)).toMatchObject({ engine: "combat", targetStat: null });
  });

  it("fails closed on a target stat outside armor | magic_resist", () => {
    const raw = structuredClone((snap(REF, "child3-live").envelope.payload as {
      segment_state: { challenges: { journey: { children: { state: { focus: Record<string, unknown> } }[] } } };
    }).segment_state.challenges.journey);
    raw.children[3].state.focus.target_stat = "attack_damage";
    expect(() => readJourneyJ3(raw)).toThrow(/target_stat/);
    raw.children[3].state.focus.target_stat = "magic_resist";
    expect(readJourneyJ3(raw).children[3].state.focus).toMatchObject({ targetStat: "magic_resist" });
  });
});

describe("CHANGED / SAVED / RELEVANT are separate states", () => {
  it("Ashe W after the level beat: changed (rank 3), saved (earlier facts) and relevant (the question) — three flags", () => {
    const { attention } = at(EXT, "child6-live");
    expect(attention.of({ kind: "ability", side: "subject", slot: "W" })).toEqual({ changed: true, saved: true, relevant: true });
    // The level changed; the question is not about it.
    expect(attention.of({ kind: "level", side: "subject" })).toEqual({ changed: true, saved: false, relevant: false });
    // Jinx's armor was SAVED at Step 3; this question is not about her.
    expect(attention.of({ kind: "portrait", side: "opponent" })).toEqual({ changed: false, saved: true, relevant: false });
  });

  it("the Pickaxe: the new item is CHANGED only — never saved (no item fact kind), not the question", () => {
    const { attention, view } = at(EXT, "child4-live");
    const slot = view.board.sides[0].items.find((i) => i.name === "Pickaxe")!.slot;
    expect(attention.of({ kind: "item", side: "subject", slot })).toEqual({ changed: true, saved: false, relevant: false });
    // The transition is only on the child right after it: one child later it is gone.
    expect(at(EXT, "child5-live").attention.of({ kind: "item", side: "subject", slot }).changed).toBe(false);
  });

  it("the resting CHANGED face lasts for the child after the beat — ability tiles included", () => {
    // The beat before Step 7 raised W and unlocked R; on the child's own open the beat is over.
    const { attention, view } = at(EXT, "child6-open");
    expect(view.board.transition?.beat.until ?? null).toBeNull();
    expect(attention.of({ kind: "ability", side: "subject", slot: "W" }).changed).toBe(true);
    expect(attention.of({ kind: "ability", side: "subject", slot: "R" }).changed).toBe(true);
  });
});

describe("SAVED", () => {
  it("a stated premise stat is inspectable but NOT saved (Zed's bonus AD at Step 2)", () => {
    const { attention, state } = at(REF, "child1-live");
    expect(state.journey!.children[1].state.sides.player.stats).toHaveProperty("bonus_attack_damage");
    expect(attention.of({ kind: "portrait", side: "subject" }).saved).toBe(false);
  });

  it("a revealed fact is saved even after a WRONG answer (and a timeout)", () => {
    const wrong = at(EXT_WRONG, "child0-reveal");
    expect(wrong.state.ownChallengeReveals[0].isCorrect).toBe(false);
    expect(wrong.attention.of({ kind: "ability", side: "subject", slot: "W" }).saved).toBe(true);
    const timeout = at("jattn1/zed_ahri.reference.timeout", "child3-timeout-reveal");
    expect(timeout.knowledge.get("player:zed:E")!.facts.map((f) => f.kind)).toContain("ability_raw_damage");
  });

  it("the OPEN child's fact never leaks: no live snapshot of any capture marks what that child asks", () => {
    let checked = 0;
    for (const n of ALL) {
      for (const s of load(n)) {
        const state = seg(s);
        if (!state?.journey || state.ownCardIndex === null || !/-(open|live)$/.test(s.label)) continue;
        const open = state.journey.children.find((c) => c.index === state.ownCardIndex);
        if (!open) continue;
        const { knowledge } = attentionOf(state);
        const facts = [...knowledge.values()].flatMap((m) => m.facts);
        expect(facts.every((f) => f.child < open.index), `${n} ${s.label}`).toBe(true);
        if (open.learner.asksFact) expect(facts.map((f) => f.fact), `${n} ${s.label}`).not.toContain(open.learner.asksFact.fact);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it("raw damage is placed by its STRUCTURED object: breaking the legacy field-name anchor changes nothing", () => {
    const s = snap(REF, "child1-reveal");
    const state = seg(s)!;
    expect(state.journey!.children[1].learner.asksFact?.object?.key).toBe("player:zed:E");
    const marked = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
    expect(marked.get("player:zed:E")!.facts.map((f) => f.kind)).toEqual(["ability_damage_formula", "ability_raw_damage"]);
    // Rename the withheld field the old regex anchored on: the mark stays, from the object.
    const journey = structuredClone(state.journey!);
    journey.children[1].state.withheld = journey.children[1].state.withheld.map((w) => ({ ...w, field: "abilities.E.renamed" }));
    const structured = journeyKnowledge(journey, state.ownChallengeReveals, state.ownCardIndex);
    expect(structured.get("player:zed:E")!.facts.map((f) => [f.kind, f.child, f.context.rank]))
      .toEqual([["ability_damage_formula", 0, undefined], ["ability_raw_damage", 1, 1]]);
  });

  it("an older payload (raw damage with `object: null`) still marks through the legacy anchor", () => {
    const state = seg(snap("jp5/zed_ahri.reference", "child1-reveal"))!;
    expect(state.journey!.children[1].learner.asksFact).toBeNull();
    const k = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
    expect(k.get("player:zed:E")!.facts.map((f) => f.kind)).toContain("ability_raw_damage");
  });

  it("damage AFTER armor carries an ability object now, but is still never a board mark", () => {
    for (const n of ALL) {
      for (const s of load(n)) {
        const state = seg(s);
        if (!state?.journey) continue;
        const k = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
        for (const m of k.values()) for (const f of m.facts) expect(f.kind, `${n} ${s.label}`).not.toBe("ability_damage");
      }
    }
    const final = seg(snap(REF, "child3-live"))!.journey!.children[3].learner.asksFact!;
    expect([final.kind, final.object?.key]).toEqual(["ability_damage", "player:zed:E"]);
  });

  it("the reveal's saved line names the object and the public value — never a verdict", () => {
    const state = seg(snap(EXT_WRONG, "child0-reveal"))!;
    const shown = state.ownChallengeReveals[0].correctAnswerDisplay ?? state.ownChallengeReveals[0].correctAnswer;
    const line = lineAt(state, 0);
    expect(line).toBe(`Saved to the board: Ashe W cooldown, ${shown} seconds`);
    expect(line).not.toMatch(/correct|learned|wrong/i);
    // Before the reveal there is nothing to say.
    expect(lineAt(seg(snap(EXT_WRONG, "child0-live"))!, 0)).toBeNull();
    // A champion stat.
    expect(lineAt(seg(snap(EXT, "child2-reveal"))!, 2)).toMatch(/^Saved to the board: Jinx armor at level \d+, [\d.]+$/);
  });
});

/** The production saved line for child `i` (masterySliceModule's own call). */
function lineAt(state: SegmentStateView, i: number) {
  const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
  return savedBoardAnnouncement(persistentBoardFacts(state.journey, knowledge, i), i,
    (side) => state.journey!.children.find((c) => c.index === i)!.state.sides[side].champion);
}

describe("ONE Saved rule: saved ⇔ behind a persistent gold `!`", () => {
  it("every persistent board fact, on every snapshot of every capture, is a fact its object's `!` lists", () => {
    let n = 0;
    for (const name of ALL) {
      for (const s of load(name)) {
        const state = seg(s);
        if (!state?.journey) continue;
        const step = state.ownRevealingCardIndex ?? state.ownCardIndex ?? state.challengeCount - 1;
        const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
        for (const f of persistentBoardFacts(state.journey, knowledge, step)) {
          n++;
          if (f.object.type === "ability") {
            // The ability `!` opens a card of exactly these facts.
            expect(knowledge.get(f.objectKey)!.facts.map((x) => x.fact), `${name} ${s.label}`).toContain(f.fact.fact);
          } else {
            const popup = championPortraitPopup(state.journey, knowledge, f.object.side, step)!;
            expect(popup.learned, `${name} ${s.label}`).toBe(true);           // the portrait's `!`
            expect(popup.learnedFacts).toContain(f.fact.fact);
          }
          expect(["ability_cooldown", "ability_cooldown_under_haste", "champion_stat_at_level",
            "ability_damage_formula", "ability_raw_damage"]).toContain(f.fact.kind);
        }
      }
    }
    expect(n).toBeGreaterThan(200);
  });

  it("damage AFTER armor has a structured object but saves nothing: no persistent fact, no saved line", () => {
    for (const [name, label, child] of [[EXT, "child3-reveal", 3], [EXT, "child5-reveal", 5], [REF, "child3-reveal", 3],
      ["jattn1/zed_ahri.reference.timeout", "child3-timeout-reveal", 3], [DAILY, "child1-reveal", 1]] as const) {
      const state = seg(snap(name, label))!;
      expect(state.journey!.children[child].learner.asksFact?.kind, `${name} ${label}`).toBe("ability_damage");
      const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
      expect(persistentBoardFacts(state.journey, knowledge, child).filter((f) => f.fact.child === child), `${name} ${label}`).toEqual([]);
      expect(lineAt(state, child), `${name} ${label}`).toBeNull();
    }
  });

  it("a champion stat the portrait popup does not list is not Saved either (the `!` would not show it)", () => {
    const state = structuredClone(seg(snap(EXT, "child2-reveal"))!);
    const asks = state.journey!.children[2].learner.asksFact!;
    asks.context = { ...asks.context, stat: "lethality" };                // not a portrait-popup row
    const knowledge = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
    expect(knowledge.get("opponent:jinx")!.facts.map((f) => f.context.stat)).toContain("lethality");
    expect(persistentBoardFacts(state.journey, knowledge, 2).filter((f) => f.fact.child === 2)).toEqual([]);
    expect(lineAt(state, 2)).toBeNull();
  });

  it("wrong and timed-out reveals of a persistent fact are Saved exactly like right ones", () => {
    expect(lineAt(seg(snap(EXT_WRONG, "child0-reveal"))!, 0)).toMatch(/^Saved to the board: Ashe W cooldown, /);
    expect(lineAt(seg(snap(EXT_WRONG, "child1-reveal"))!, 1)).toMatch(/^Saved to the board: Ashe W raw damage, \d+$/);
    // A timed-out cooldown (K1 capture: Volibear Q, the pool spent on Step 1).
    const timeout = seg(snap("k1/voli.standard.timeout", "child0-timeout-reveal"))!;
    expect(timeout.ownChallengeReveals[0].playerAnswer).toBeNull();
    expect(lineAt(timeout, 0)).toMatch(/^Saved to the board: Volibear Q cooldown, \d+ seconds$/);
  });
});

describe("RELEVANT NOW", () => {
  const relevant = (n: string, label: string) => at(n, label).attention.entries()
    .filter(([, a]) => a.relevant).map(([k]) => k).sort();

  it("Ashe R vs Jinx R: BOTH compared R tiles, symmetrically — and nothing names Jinx R's value", () => {
    expect(relevant(EXT, "child10-live")).toEqual(["ability:opponent:R", "ability:subject:R"]);
    const { knowledge, state } = at(EXT, "child10-live");
    expect(knowledge.has("opponent:jinx:R")).toBe(false);
    const answer = String(answersOf(EXT)[9].correct_answer);       // Ashe R (revealed at Step 10)
    expect(knowledge.get("player:ashe:R")!.facts[0].display).toBe(answer);
    // The Jinx R cooldown fact exists nowhere in the reached payload.
    expect(JSON.stringify(state.journey)).not.toMatch(/ability_cooldown:jinx:R/);
  });

  it("every comparison in every capture is relevant on both sides or neither", () => {
    for (const n of ALL) {
      for (const s of load(n).filter((x) => /-(open|live)$/.test(x.label))) {
        const state = seg(s);
        if (!state?.journey || state.ownCardIndex === null) continue;
        const child = state.journey.children.find((c) => c.index === state.ownCardIndex);
        if (child?.state.focus?.engine !== "matchup") continue;
        const r = relevant(n, s.label);
        const slot = child.state.focus.slot;
        expect(r, `${n} ${s.label}`).toEqual([`ability:opponent:${slot}`, `ability:subject:${slot}`]);
      }
    }
  });

  it("`focus.target_stat` alone decides the target's cue: after armor yes, raw damage no, older payload no", () => {
    expect(relevant(REF, "child3-live")).toEqual(["ability:subject:E", "portrait:opponent"]);
    expect(relevant(REF, "child1-live")).toEqual(["ability:subject:E"]);
    // A JP5 payload's identical question names no target stat: no cue is invented.
    expect(relevant("jp5/zed_ahri.reference", "child3-live")).toEqual(["ability:subject:E"]);
  });

  it("a champion stat question points at that champion only", () => {
    expect(relevant(EXT, "child2-live")).toEqual(["level:opponent", "portrait:opponent"]);
  });

  it("cue keys never carry a value", () => {
    for (const [key] of at(EXT, "child3-live").attention.entries()) expect(key).toMatch(/^(ability|item|portrait|level):(subject|opponent)(:[QWER0-5])?$/);
    expect(boardObjectKey({ kind: "item", side: "subject", slot: 2 })).toBe("item:subject:2");
  });
});

describe("CHANGED: an item's stat lines join their purchase by item id", () => {
  const t = (events: JourneyTransition["events"]): JourneyTransition => ({ fromNode: "a", toNode: "b", label: null, events, beat: { ms: 0, until: null } });

  it("the real Pickaxe beat: `stat_change.source.item_id` → the Pickaxe's slot", () => {
    const { view } = at(EXT, "child4-beat");
    const change = view.board.transition!.events.find((e) => e.kind === "stat_change")!;
    expect(change).toMatchObject({ source: "Pickaxe", sourceItemId: 1037 });
    const slot = view.board.sides[0].items.find((i) => i.itemId === 1037)!.slot;
    expect([...itemGainTags(view.board.transition)]).toEqual([[`subject:${slot}`, ["+25 AD"]]]);
  });

  it("by id, not by name: a renamed purchase still joins; a same-named other item does not", () => {
    const tags = itemGainTags(t([
      { kind: "purchase", side: "subject", group: null, items: [{ slot: 1, itemId: 1037, name: "Pickaxe (display)" }] },
      { kind: "purchase", side: "subject", group: null, items: [{ slot: 2, itemId: 9999, name: "Pickaxe" }] },
      { kind: "stat_change", side: "subject", key: "attack_damage", delta: 25, source: "Pickaxe", sourceItemId: 1037 },
    ]));
    expect([...tags]).toEqual([["subject:1", ["+25 AD"]]]);
  });

  it("an older stat line with no id still joins by name", () => {
    const tags = itemGainTags(t([
      { kind: "purchase", side: "subject", group: null, items: [{ slot: 0, itemId: 1037, name: "Pickaxe" }] },
      { kind: "stat_change", side: "subject", key: "attack_damage", delta: 25, source: "Pickaxe" },
    ]));
    expect([...tags]).toEqual([["subject:0", ["+25 AD"]]]);
  });
});
