/**
 * JOURNEY-UI3 — the REAL J3 wire, through the REAL public-round parser and the
 * adapter. Every snapshot was captured from the real HTTP route on the
 * canonical DB (`__fixtures__/j3/CAPTURE.md`), with the backend's public guard
 * unmodified.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ3, type JourneyCursor, type JourneyView } from "./adapter";
import { readJourneyJ3 } from "./j3";
import type { CaptureSnapshot } from "./realFixtures";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j3");
const J2_DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j2");
const load = (name: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));
const answers = (name: string): { index: number; correct_answer: unknown }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${name}.answers.json`), "utf8"));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const snap = (name: string, label: string) => {
  const s = load(name).find((x) => x.label === label);
  if (!s) throw new Error(`${name}: no ${label}`);
  return s;
};
type Wire = Record<string, unknown>;
const segWire = (s: CaptureSnapshot | { envelope: Wire }) => (s.envelope.payload as Wire).segment_state as Wire;
const journeyWire = (s: CaptureSnapshot | { envelope: Wire }) => (segWire(s).challenges as Wire).journey as Wire;
const cursorOf = (s: CaptureSnapshot): JourneyCursor => {
  const seg = readPublicRound(s.envelope).segmentState!;
  return { ownNextChallengeIndex: seg.ownNextChallengeIndex, ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished };
};
const view = (s: CaptureSnapshot): JourneyView | null => {
  const seg = readPublicRound(s.envelope).segmentState!;
  return seg.journey ? adaptJourneyJ3(seg.journey, cursorOf(s)) : null;
};
/** Does any object in the tree carry this exact KEY? (Not a substring scan.) */
const hasKey = (node: unknown, key: string): boolean => {
  if (!node || typeof node !== "object") return false;
  if (Array.isArray(node)) return node.some((v) => hasKey(v, key));
  return Object.entries(node as Wire).some(([k, v]) => k === key || hasKey(v, key));
};

const FILES = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")).sort();

describe("every real J3 capture parses through the production parser", () => {
  it("covers five Standard Journeys, five Survival Journeys, a strike-out, a pool exhaustion and a Review re-ask", () => {
    expect(FILES).toEqual([
      "lucian.standard", "lucian.survival", "olaf.standard", "olaf.survival",
      "pantheon.standard", "pantheon.survival", "pantheon.survival.strikeout",
      "review.reask", "voli.standard", "voli.standard.exhaust", "voli.survival", "zed.standard", "zed.survival",
    ]);
  });

  it.each(FILES)("%s: every snapshot reads; a live Journey block is J3 and agrees with the challenges prefix", (name) => {
    for (const s of load(name)) {
      const round = readPublicRound(s.envelope);
      const seg = round.segmentState;
      if (!seg) {
        // The match settled (last child answered, strike-out, or pool out).
        expect(round.matchOver, `${name} ${s.label}`).toBe(true);
        continue;
      }
      const reached = (seg.block as { challenges: unknown[] }).challenges.length;
      if (reached === 0) { expect(seg.journey?.children.length ?? 0).toBe(0); continue; }
      expect(seg.journey!.stateContract, `${name} ${s.label}`).toBe("journey_public_state.v1");
      expect(seg.journey!.children.length, `${name} ${s.label}`).toBe(reached);
    }
  });
});

describe("the J2 cost blocker is gone — and stays gone", () => {
  const beat = snap("zed.standard", "child3-beat");

  it("a real purchase transition passes the backend guard, the generic walk and the J3 allowlist", () => {
    const j = journeyWire(beat);
    expect((j.transitions as Wire[]).map((t) => t.kind)).toEqual(["purchase"]);
    // The real HTTP payload: no `cost` key anywhere in the envelope.
    expect(hasKey(beat.envelope, "cost")).toBe(false);
    const seg = readPublicRound(beat.envelope).segmentState!;
    expect(seg.journey!.transitions[0].events.map((e) => e.type))
      .toEqual(["item_acquired", "stat_change", "stat_change"]);
    expect(readJourneyJ3(j).transitions[0].presentation).toBe("first_back");
  });

  it.each(FILES)("%s: no `cost`, `price` or gold key in any captured Journey payload", (name) => {
    for (const s of load(name)) {
      for (const key of ["cost", "price", "gold", "total_cost"]) {
        expect(hasKey(s.envelope, key), `${name} ${s.label} ${key}`).toBe(false);
      }
    }
  });

  it("a `cost` reintroduced on a purchase fails the WHOLE segment (no carve-out any more)", () => {
    for (const inject of [
      (j: Wire) => { (((j.transitions as Wire[])[0].changes as Wire[])[0].items_added as Wire[])[0].cost = 1000; },
      (j: Wire) => { ((j.transitions as Wire[])[0].events as Wire[])[0].cost = 1000; },
      (j: Wire) => { (((j.children as Wire[])[0].state as Wire).sides as Wire).player = {
        ...((((j.children as Wire[])[0].state as Wire).sides as Wire).player as Wire), cost: 1 }; },
    ]) {
      const e = clone(beat.envelope);
      inject(journeyWire({ envelope: e }));
      expect(() => readPublicRound(e)).toThrow(/hidden field: cost/);
    }
  });

  it("the superseded J2 block is refused by the production parser", () => {
    const j2 = (JSON.parse(readFileSync(join(J2_DIR, "olaf.standard.v2.json"), "utf8")) as CaptureSnapshot[])
      .find((x) => x.label === "child2-open")!;
    const e = clone(snap("zed.standard", "child2-open").envelope);
    (segWire({ envelope: e }).challenges as Wire).journey = journeyWire(j2);
    expect(() => readPublicRound(e)).toThrow(/not a journey_public_state\.v1 block/);
  });
});

describe("the J3 reader is a typed allowlist (fail closed)", () => {
  const base = () => clone(journeyWire(snap("zed.standard", "child2-open")));
  const child = (j: Wire, i = 0) => (j.children as Wire[])[i];
  const refuse = (mutate: (j: Wire) => void, why: RegExp) => {
    const j = base();
    mutate(j);
    expect(() => readJourneyJ3(j)).toThrow(why);
  };

  it("refuses unknown and answer-bearing keys at every level", () => {
    refuse((j) => { j.answer = 1; }, /does not publish: "answer"/);
    refuse((j) => { child(j).correct_answer = "27"; }, /does not publish: "correct_answer"/);
    refuse((j) => { (child(j).state as Wire).damage = 55; }, /does not publish: "damage"/);
    refuse((j) => { ((child(j).state as Wire).sides as Wire).opponent = {
      ...(((child(j).state as Wire).sides as Wire).opponent as Wire), cooldown: 5 }; }, /does not publish: "cooldown"/);
  });

  it("refuses an asked stat that carries a value", () => {
    refuse((j) => {
      (((child(j, 0).state as Wire).sides as Wire).opponent as Wire).stats = { armor: 27.195 };
    }, /states the ASKED stat opponent\.armor/);
  });

  it("refuses a `recalled` marker the state does not name, and a named recall that is not `recalled`", () => {
    refuse((j) => { (((child(j, 1).state as Wire).sides as Wire).opponent as Wire).stats = { armor: "recalled" }; },
      /reads "recalled" but the state names no such recall/);
    refuse((j) => { (((child(j, 2).state as Wire).sides as Wire).opponent as Wire).stats = { armor: 27.195 }; },
      /must read "recalled"/);
  });

  it("refuses a stat outside the closed premise vocabulary (no cooldown, no damage key exists)", () => {
    refuse((j) => { (((child(j, 2).state as Wire).sides as Wire).player as Wire).stats = { ability_damage: 55 }; },
      /not a public premise stat/);
  });

  it("refuses an unwithheld ask, a retired `recall` transition, and a non-contiguous prefix", () => {
    refuse((j) => { (child(j).asks as Wire).withheld = false; }, /asks must be withheld/);
    refuse((j) => { (j.children as Wire[]).splice(1, 1); }, /contiguous reached prefix/);
    const t = clone(journeyWire(snap("zed.standard", "child3-beat")));
    ((t.transitions as Wire[])[0]).kind = "recall";
    expect(() => readJourneyJ3(t)).toThrow(/recall is retired/);
  });
});

describe("adapter: the board on real J3 data", () => {
  it("the board is the latest reached child's public state, Q/W/E/R in order with names", () => {
    const v = view(snap("zed.standard", "child2-open"))!;
    const [zed, ahri] = v.board.sides;
    expect(zed.championName).toBe("Zed");
    expect(zed.abilities.map((a) => `${a.slot}${a.rank}:${a.name}`))
      .toEqual(["Q1:Razor Shuriken", "W1:Living Shadow", "E1:Shadow Slash", "R0:Death Mark"]);
    // J3 publishes no max rank: never pips of a guessed length.
    expect(zed.abilities.every((a) => a.maxRank === null)).toBe(true);
    expect(ahri.championName).toBe("Ahri");
    expect(v.board.step).toMatchObject({ index: 2, count: 5 });
  });

  it("an asked stat is withheld `?` — no value anywhere in the view", () => {
    const s = snap("voli.standard", "child0-live");
    const v = view(s)!;
    const armor = v.board.sides[1].stats.find((x) => x.key === "armor")!;
    expect(armor).toMatchObject({ withheld: true, value: null, withheldReason: "asked" });
    expect(v.board.focus.refs).toContainEqual({ side: "opponent", kind: "stat", key: "armor" });
    const answer = String(answers("voli.standard")[0].correct_answer);
    expect(JSON.stringify(v.board)).not.toMatch(new RegExp(`"value":${answer}\\b`));
  });

  it("a RECALLED armor names the step that taught it (a reveal), never the number", () => {
    const v = view(snap("zed.standard", "child2-open"))!;
    const armor = v.board.sides[1].stats.find((x) => x.key === "armor")!;
    expect(armor).toMatchObject({
      withheld: true, value: null, withheldReason: "recalled", recalledFrom: { child: 0, source: "revealed" },
    });
    expect(JSON.stringify(v.board)).not.toContain("27.195");
    expect(v.children[2].recalled).toContainEqual(expect.objectContaining({
      what: "target_armor", source: "revealed", establishedInChild: 0,
    }));
    expect(v.board.focus.combat).toEqual({ attacker: "subject", target: "opponent" });
  });

  it("a wrong answer still teaches: the next child's ledger has the revealed fact; the view reads no correctness", () => {
    const s = snap("zed.standard", "child2-open");
    const seg = readPublicRound(s.envelope).segmentState!;
    // Child 1 was answered WRONG on purpose in this capture.
    expect(seg.ownChallengeReveals.find((r) => r.challengeIndex === 1)!.isCorrect).toBe(false);
    expect(seg.journey!.children[2].learner.established.map((e) => [e.child, e.source]))
      .toEqual([[0, "revealed"], [1, "revealed"]]);
    // The adapter never looks at reveals: flipping correctness changes nothing.
    const flipped = clone(s.envelope);
    for (const r of segWire({ envelope: flipped }).own_challenge_reveals as Wire[]) r.is_correct = !r.is_correct;
    const a = view(s);
    const b = view({ ...s, envelope: flipped });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("a future transition is absent before its prerequisite reveal, present during its beat", () => {
    expect(journeyWire(snap("zed.standard", "child2-reveal")).transitions).toEqual([]);
    expect(journeyWire(snap("zed.standard", "child2-reveal-late")).transitions).toEqual([]);
    const s = snap("zed.standard", "child3-beat");
    const v = view(s)!;
    expect(v.pendingChildIndex).toBe(3);
    // The next child is NOT in the payload; nothing opens it early.
    expect(v.children).toHaveLength(3);
    expect(v.board.transition!.beat.until).toBe(segWire(s).own_card_started_at);
    expect(v.board.transition!.beat.ms).toBe(2500);
  });

  it("the purchase beat applies the server's typed events; stat lines are DELTAS, not totals", () => {
    const v = view(snap("zed.standard", "child3-beat"))!;
    const zed = v.board.sides[0];
    expect(zed.items.map((i) => [i.slot, i.itemId, i.name])).toEqual([[0, 3134, "Serrated Dirk"]]);
    // The next child's premise stats are not published during the beat.
    expect(zed.stats).toEqual([]);
    expect(v.board.transition!.events).toEqual([
      { kind: "purchase", side: "subject", group: "first_back", items: [{ slot: 0, itemId: 3134, name: "Serrated Dirk" }] },
      { kind: "stat_change", side: "subject", key: "attack_damage", delta: 20, source: "Serrated Dirk" },
      { kind: "stat_change", side: "subject", key: "lethality", delta: 10, source: "Serrated Dirk" },
    ]);
  });

  it("the delta persists into the next child (marks), and its beat is over", () => {
    const v = view(snap("zed.standard", "child3-open"))!;
    expect(v.pendingChildIndex).toBeNull();
    expect(v.board.transition!.beat.until).toBeNull();
    expect(v.board.transition!.events.some((e) => e.kind === "purchase")).toBe(true);
    // The child's own premise now states the post-purchase values.
    expect(v.board.sides[0].stats.find((x) => x.key === "lethality")).toMatchObject({ value: 10 });
    expect(v.board.sides[0].items[0].name).toBe("Serrated Dirk");
  });

  it("a level transition raises both sides and unlocks both Rs, as served", () => {
    const v = view(snap("pantheon.standard", "child3-beat"))!;
    const [p, l] = v.board.sides;
    expect([p.level, l.level]).toEqual([6, 6]);
    expect(p.abilities.find((a) => a.slot === "R")!.rank).toBe(1);
    expect(l.abilities.find((a) => a.slot === "R")!.rank).toBe(1);
    expect(v.board.transition!.events.filter((e) => e.kind === "ability_unlock")).toHaveLength(2);
  });

  it("no transition after the viewer is finished (Survival `own_stage_finished` / pool out)", () => {
    const s = snap("zed.standard", "child3-beat");
    const j = readPublicRound(s.envelope).segmentState!.journey!;
    const v = adaptJourneyJ3(j, { ...cursorOf(s), ownFinished: true })!;
    expect(v.pendingChildIndex).toBeNull();
    expect(v.board.transition).toBeNull();
    // The pool-exhaustion capture: finished on child 2 of 5, nothing after it.
    const ex = snap("voli.standard.exhaust", "child1-timeout");
    const seg = readPublicRound(ex.envelope).segmentState!;
    expect(seg.ownFinished).toBe(true);
    expect(seg.journey!.children).toHaveLength(2);
    expect(seg.journey!.transitions).toEqual([]);
    expect(adaptJourneyJ3(seg.journey!, cursorOf(ex))!.board.transition).toBeNull();
  });

  it.each(FILES)("%s: no reached child's answer is a board value before its reveal", (name) => {
    const ans = answers(name);
    for (const s of load(name)) {
      const seg = readPublicRound(s.envelope).segmentState;
      if (!seg?.journey || seg.journey.children.length === 0) continue;
      const v = adaptJourneyJ3(seg.journey, cursorOf(s))!;
      const revealed = new Set(seg.ownChallengeReveals.map((r) => r.challengeIndex));
      const values = v.board.sides.flatMap((x) => x.stats.map((st) => st.value)).filter((n) => n !== null);
      for (const c of seg.journey.children) {
        if (revealed.has(c.index)) continue;
        const a = Number(ans[c.index].correct_answer);
        if (!Number.isFinite(a)) continue;
        expect(values, `${name} ${s.label} child ${c.index}`).not.toContain(a);
      }
    }
  });
});

describe("Daily Review re-asks a missed Journey child (`reask: true`) — captured LIVE", () => {
  // `review.reask.json` is the real `GET /api/ranked/matches/{id}` read of the
  // Daily Review child in the JOURNEY-UI3 live run (see CAPTURE.md). Before
  // this reader knew the re-ask shape, the whole Review match failed to parse.
  const s = snap("review.reask", "reask-live");

  it("parses through the production parser as a one-child, self-contained Journey", () => {
    const seg = readPublicRound(s.envelope).segmentState!;
    expect(seg.journey!.reask).toBe(true);
    expect(seg.journey!.children).toHaveLength(1);
    expect(seg.journey!.recipeId).toBeNull();
    const v = adaptJourneyJ3(seg.journey!, cursorOf(s))!;
    expect(v.board.title).toBe("Review");
    expect(v.board.journeyKey).toMatch(/^reask:jstate_/);
    expect(v.board.step).toMatchObject({ index: 0, count: 1 });
    expect(v.board.sides[1].stats.find((x) => x.key === "armor")).toMatchObject({ withheld: true, withheldReason: "asked" });
  });

  it("a re-ask may not recall, carry a transition, or omit its flag's value", () => {
    const j = () => clone(journeyWire(s));
    const withRecall = j();
    ((withRecall.children as Wire[])[0].withheld as Wire[]).push({
      fact: "f", what: "target_armor", side: "opponent", champion: "Caitlyn", source: "revealed", established_in_child: 0 });
    expect(() => readJourneyJ3(withRecall)).toThrow(/re-ask recalls nothing/);
    const withT = j();
    (withT.transitions as Wire[]).push(journeyWire(snap("zed.standard", "child3-beat")).transitions as Wire);
    expect(() => readJourneyJ3(withT)).toThrow();
    const noFlag = j();
    noFlag.reask = false;
    expect(() => readJourneyJ3(noFlag)).toThrow(/reask must be true/);
    const extra = j();
    extra.recipe_id = "x";
    expect(() => readJourneyJ3(extra)).toThrow(/does not publish: "recipe_id"/);
  });
});
