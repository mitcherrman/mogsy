/**
 * JOURNEY-UI2 — the REAL J2 wire, through the REAL public-round parser and the
 * adapter. Every snapshot here was captured from a real Bot match on the
 * canonical DB (`__fixtures__/j2/CAPTURE.md`).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicRound, RankedPublicParseError } from "@/lib/ranked-public/contracts";
import { adaptJourneyJ2, type JourneyView } from "./adapter";
import { readJourneyJ2 } from "./j2";
import type { CaptureSnapshot } from "./realFixtures";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/j2");
const load = (name: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));
const answers = (name: string): { index: number; correct_answer: unknown }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${name}.answers.json`), "utf8"));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const snap = (name: string, label: string) => {
  const s = load(name).find((x) => x.label === label);
  if (!s) throw new Error(`${name}: no ${label}`);
  return s;
};
const view = (s: CaptureSnapshot): JourneyView | null => {
  const seg = readPublicRound(s.envelope).segmentState!;
  return seg.journey ? adaptJourneyJ2(seg.journey, {
    ownNextChallengeIndex: seg.ownNextChallengeIndex,
    ownCardStartedAt: seg.ownCardStartedAt, ownFinished: seg.ownFinished,
  }) : null;
};
type Wire = Record<string, unknown>;
const segWire = (s: CaptureSnapshot) =>
  ((s.envelope.payload as Wire).segment_state as Wire);

describe("every real capture parses through the real public-round parser", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

  it("covers the six J2 recipes, the Survival stop and the Standard block clock", () => {
    expect(files.sort()).toEqual([
      "ahri.standard.v2", "lucian.standard.v2", "olaf.standard.block", "olaf.standard.v2",
      "senna.standard.v2", "volibear.standard.v2", "volibear.survival.stop", "zed.standard.v2",
    ]);
  });

  it.each(files)("%s: every snapshot reads, and its Journey block adapts", (name) => {
    for (const s of load(name)) {
      const seg = readPublicRound(s.envelope).segmentState!;
      expect(seg.journey, `${name} ${s.label}`).not.toBeNull();
      expect(seg.journey!.version).toBe("mastery_journey.v1");
      // The public prefix: the challenges list and the Journey children agree.
      expect(seg.journey!.children.length).toBe((seg.block as { challenges: unknown[] }).challenges.length);
    }
  });
});

describe("the parser carve-out is exactly one path wide", () => {
  const beat = snap("olaf.standard.v2", "child3-beat");

  it("J2's `items_added[].cost` narration is accepted inside the Journey block", () => {
    expect(JSON.stringify(beat.envelope)).toContain('"cost":1050');
    expect(() => readPublicRound(beat.envelope)).not.toThrow();
  });

  it("…and `cost` anywhere else in the segment still fails the pre-reveal walk", () => {
    const e = clone(beat.envelope) as Wire;
    const ch = ((e.payload as Wire).segment_state as Wire).challenges as Wire;
    (ch.challenges as Wire[])[0].cost = 1050;
    expect(() => readPublicRound(e)).toThrow(/hidden field: cost/);
  });

  it("an answer-bearing or unknown key inside the Journey block fails the read", () => {
    for (const [where, key] of [["child", "correct_answer"], ["child", "answer"], ["block", "private"],
      ["state", "armor"], ["asks", "value"]] as const) {
      const e = clone(beat.envelope) as Wire;
      const j = (((e.payload as Wire).segment_state as Wire).challenges as Wire).journey as Wire;
      const child = (j.children as Wire[])[0];
      const target = where === "block" ? j : where === "child" ? child
        : where === "state" ? ((child.state as Wire).player as Wire) : (child.asks as Wire);
      target[key] = 1;
      expect(() => readPublicRound(e), `${where}.${key}`).toThrow(RankedPublicParseError);
    }
  });

  it("an asked field that is not marked withheld fails the read", () => {
    const e = clone(beat.envelope) as Wire;
    const j = (((e.payload as Wire).segment_state as Wire).challenges as Wire).journey as Wire;
    ((j.children as Wire[])[0].asks as Wire).withheld = false;
    expect(() => readPublicRound(e)).toThrow(/must be withheld/);
  });
});

describe("the adapter: reached prefix, beat, marks, focus — from server data only", () => {
  it("before child 0 opens there is nothing to stand on: no board", () => {
    expect(view(snap("olaf.standard.v2", "child0-open"))).toBeNull();
  });

  it("child 1 open: the reached node, focus on the asked ability of BOTH sides (Matchup)", () => {
    const v = view(snap("olaf.standard.v2", "child1-open"))!;
    expect(v.board.step).toMatchObject({ index: 1, count: 5 });
    expect(v.board.sides.map((s) => s.championName)).toEqual(["Olaf", "Jarvan IV"]);
    expect(v.board.sides[0].abilities.map((a) => [a.slot, a.rank, a.maxRank])).toEqual(
      [["Q", 3, null], ["W", 1, null], ["E", 1, null], ["R", 1, null]]);
    expect(v.board.focus.refs).toEqual([
      { side: "subject", kind: "ability", key: "R" }, { side: "opponent", kind: "ability", key: "R" }]);
    expect(v.board.transition).toBeNull();
    expect(v.pendingChildIndex).toBeNull();
  });

  it("during the beat: the next child does not exist; the board shows the node AFTER the transition; `until` is the server's open instant", () => {
    const s = snap("olaf.standard.v2", "child3-beat");
    const seg = segWire(s);
    const v = view(s)!;
    expect(v.pendingChildIndex).toBe(3);
    expect(v.children.map((c) => c.index)).toEqual([0, 1, 2]);
    expect(v.board.transition!.beat).toEqual({ ms: 2500, until: seg.own_card_started_at });
    expect(Date.parse(seg.own_card_started_at as string)).toBeGreaterThan(Date.parse(s.at));
    expect(v.board.sides[0].items.map((i) => [i.slot, i.name, i.itemId])).toEqual([[0, "Caulfield's Warhammer", 3133]]);
    expect(v.board.transition!.events).toEqual([{
      kind: "purchase", side: "subject", group: "recall",
      items: [{ slot: 0, itemId: 3133, name: "Caulfield's Warhammer", cost: 1050 }],
    }]);
    expect(v.board.focus.refs).toEqual([]);
  });

  it("the child after it opens: beat over (no instant), marks kept for this child", () => {
    const v = view(snap("olaf.standard.v2", "child3-open"))!;
    expect(v.pendingChildIndex).toBeNull();
    expect(v.board.step.index).toBe(3);
    expect(v.board.transition!.beat.until).toBeNull();
    expect(v.board.transition!.events[0].kind).toBe("purchase");
    // …and gone from the child after that.
    expect(view(snap("olaf.standard.v2", "child4-open"))!.board.transition).toBeNull();
  });

  it("a level-6 transition carries level, rank-ups and R unlocks for BOTH sides, as served", () => {
    const beat = load("volibear.standard.v2").find((x) => x.label === "child4-beat")!;
    const ev = view(beat)!.board.transition!.events;
    expect(ev).toEqual(expect.arrayContaining([
      { kind: "level", side: "subject", from: 3, to: 6 },
      { kind: "ability_rank", side: "subject", slot: "W", from: 1, to: 3 },
      { kind: "ability_unlock", side: "subject", slot: "R" },
      { kind: "level", side: "opponent", from: 3, to: 6 },
      { kind: "ability_unlock", side: "opponent", slot: "R" },
    ]));
    expect(view(beat)!.board.sides.map((s) => s.level)).toEqual([6, 6]);
  });

  it("a Champion 'stat at level' child puts `?` on the asked side — never a value", () => {
    const v = view(snap("volibear.standard.v2", "child0-reveal"))!;
    expect(v.board.sides[1].championName).toBe("Garen");
    expect(v.board.sides[1].stats).toEqual([{ key: "armor", withheld: true, value: null }]);
    expect(v.board.focus.refs).toEqual(expect.arrayContaining([{ side: "opponent", kind: "stat", key: "armor" }]));
  });

  it("Combat: attacker/target from the asked subject; the recalled formula names its teacher", () => {
    const s = snap("olaf.standard.v2", "child4-open");
    const v = view(s)!;
    expect(v.board.focus.combat).toEqual({ attacker: "subject", target: "opponent" });
    const c4 = v.children[4];
    expect(c4.formula).toBeNull();
    expect(c4.recalled).toEqual([expect.objectContaining({ what: "ability_damage", establishedInChild: 2, slot: "Q" })]);
    expect(v.children[2].formula).toMatchObject({ flatByRank: [70, 120, 170, 220, 270], damageType: "physical" });
  });

  it("Survival stop: the reached prefix is the PLAYED prefix; no pending child, no beat", () => {
    const s = snap("volibear.survival.stop", "child1-reveal");
    const payload = s.envelope.payload as Wire;
    expect((payload.ruleset as Wire).own_stage_finished).toBe(true);
    const v = view(s)!;
    expect(v.children.map((c) => c.index)).toEqual([0, 1]);
    expect(v.pendingChildIndex).toBeNull();
    expect(v.board.transition).toBeNull();
  });
});

describe("answer safety of the adapted board", () => {
  it.each(["olaf.standard.v2", "volibear.standard.v2", "zed.standard.v2", "lucian.standard.v2",
    "senna.standard.v2", "ahri.standard.v2"])("%s: no child's answer appears on its own board before its reveal", (name) => {
    const ans = answers(name);
    for (const s of load(name)) {
      const v = view(s);
      if (!v) continue;
      const seg = segWire(s);
      const board = JSON.stringify(v.board);
      // The child on screen is not yet answered at "-open"/"-beat": its answer
      // must not be on the board. (A number can legitimately equal a public
      // input — a level — so only non-trivial answers are checked.)
      const current = seg.own_next_challenge_index as number;
      const a = ans[current]?.correct_answer;
      if (a === undefined || !/open|beat/.test(s.label)) continue;
      const text = typeof a === "number" ? String(a) : String(a);
      if (/^\d$/.test(text) || /^(tie|[a-z]+)$/.test(text)) continue;
      expect(board, `${name} ${s.label}`).not.toContain(`"${text}"`);
      expect(board, `${name} ${s.label}`).not.toContain(`:${text},`);
    }
  });

  it("the J2 reader rejects a future child slipped into the prefix out of order", () => {
    const e = clone(snap("olaf.standard.v2", "child1-open").envelope) as Wire;
    const j = (((e.payload as Wire).segment_state as Wire).challenges as Wire).journey as Wire;
    (j.children as Wire[])[1].index = 4;
    expect(() => readJourneyJ2(j)).toThrow(/contiguous reached prefix/);
  });
});
