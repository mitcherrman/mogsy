import { describe, expect, it } from "vitest";
import {
  ASSEMBLY_CAPTURE, arrangedBoard, buildLabRound, findRound, gradeLabRound, labRounds, promptFor, roundOrder, splitHandle, teamMark,
} from "./labAuthority";
import { ASSEMBLY_SLOT_ORDER } from "@/lib/pro-play-assembly/capture";

const SSG_ROSTER = "rl-2017-finals-samsung-galaxy";
const SSG_G3 = "dm-2017-finals-g3-samsung-galaxy";

describe("the frozen PA1 capture", () => {
  it("is PA1's contract and rules, from the PA1 content commit", () => {
    expect(ASSEMBLY_CAPTURE.authority.contract_version).toBe("assembly_content.v1");
    expect(ASSEMBLY_CAPTURE.authority.rules_version).toBe("pa1.1");
    expect(ASSEMBLY_CAPTURE.authority.pa1_content_commit).toBe("a34965e54fefec7e448f3a2c873f03710df2ed54");
  });
  it("is the pilot sample: Worlds Finals, 2015 onward; nine roster sides and twenty-six draft team-games", () => {
    expect(labRounds("roster_lock").map((r) => r.id)).toEqual([
      "rl-2015-finals-rox-tigers", "rl-2016-finals-samsung-galaxy", "rl-2017-finals-samsung-galaxy",
      "rl-2018-finals-invictus-gaming", "rl-2019-finals-funplus-phoenix", "rl-2019-finals-g2-esports",
      "rl-2021-finals-edward-gaming", "rl-2022-finals-kiwoom-drx", "rl-2025-finals-kt-rolster",
    ]);
    expect(labRounds("draft_memory")).toHaveLength(26);
    for (const r of ASSEMBLY_CAPTURE.rounds) {
      expect(r.subject.league_slug).toBe("World Championship");
      expect(r.subject.stage).toBe("Finals");
      expect(r.subject.season).toBeGreaterThanOrEqual(2015);
    }
  });
  it("keeps PA1's refusals as refusals (Wolf, Ghost, Faker's gap, substitutions, missing roles) — nothing overridden", () => {
    const reasons = new Set(ASSEMBLY_CAPTURE.refusals.map((r) => r.primary_reason));
    expect([...reasons].sort()).toEqual(["identity_conflict", "missing_role", "registry_gap", "substitution"]);
    const refusedKeys = ASSEMBLY_CAPTURE.refusals.map((r) => `${r.season}:${r.team_key}`);
    expect(refusedKeys).toContain("2017:SK Telecom T1");
    expect(refusedKeys).toContain("2024:T1");
    expect(labRounds("roster_lock").map((r) => r.subject.team_key)).not.toContain("T1");
    expect(labRounds("roster_lock").map((r) => r.subject.team_key)).not.toContain("SK Telecom T1");
  });
  it("holds PA1's certified Samsung Galaxy 2017 lineup and the Game 3 composition", () => {
    const roster = findRound(SSG_ROSTER)!;
    expect(roster.lineup.map((p) => [p.slot_id, p.entity_key])).toEqual([
      ["top", "CuVee"], ["jungle", "Ambition"], ["mid", "Crown"], ["adc", "Ruler"], ["support", "CoreJJ"],
    ]);
    const g3 = findRound(SSG_G3)!;
    expect(g3.lineup.map((p) => [p.slot_id, p.entity_key])).toEqual([
      ["top", "Cho'Gath"], ["jungle", "Sejuani"], ["mid", "Malzahar"], ["adc", "Varus"], ["support", "Lulu"],
    ]);
    expect(g3.family === "draft_memory" ? g3.notes.pick_order : "").toMatch(/no pick order is implied/);
  });
  it("every tray is role-balanced, answer-complete, and carries no tell on the public card", () => {
    for (const r of ASSEMBLY_CAPTURE.rounds) {
      expect(r.trays.length).toBeGreaterThan(0);
      for (const t of r.trays) {
        expect(t.cards).toHaveLength(t.size);
        expect(t.cards.map((c) => c.token)).toEqual(t.cards.map((_, i) => `t${i}`));
        expect(new Set(t.cards.map((c) => c.entity_key)).size).toBe(t.size);
        const answers = Object.values(t.private.answer);
        expect(new Set(answers).size).toBe(5);
        for (const a of answers) expect(t.cards.some((c) => c.token === a)).toBe(true);
        const perRole: Record<string, number> = {};
        for (const m of Object.values(t.private.cards)) perRole[m.role_anchor] = (perRole[m.role_anchor] ?? 0) + 1;
        expect(new Set(Object.values(perRole)).size).toBe(1);
        for (const c of t.cards) expect(Object.keys(c).sort()).toEqual(["entity_key", "entity_type", "label", "token"]);
      }
    }
  });
});

describe("the lab's round and grader", () => {
  it("mints opaque per-round tokens and exposes no private field on the public content", () => {
    const r = buildLabRound(findRound(SSG_ROSTER)!, "seed-a");
    const r2 = buildLabRound(findRound(SSG_ROSTER)!, "seed-b");
    expect(r.content.cards.every((c) => /^pa_[0-9a-z]+$/.test(c.token))).toBe(true);
    expect(r.content.cards.map((c) => c.token)).not.toEqual(r2.content.cards.map((c) => c.token));
    expect(JSON.stringify(r.content)).not.toMatch(/answer|tier|role_anchor|private/);
    expect(r.content.positions.map((p) => p.id)).toEqual([...ASSEMBLY_SLOT_ORDER]);
    expect(r.content.cardKind).toBe("identity");
    expect(r.content.prompt).toBe("Reconstruct Samsung Galaxy's starting lineup in the 2017 World Championship Final.");
    expect(r.content.eyebrow).toBe("Roster Lock · Worlds 2017 Finals");
    expect(r.content.subject.label).toBe("Samsung Galaxy");
    expect(r.content.subject.monogram).toBe("SSG");
    expect(r.content.subject.media).toBeNull(); // no SSG crest in the media authority: a monogram seal, never a stand-in
  });
  it("builds Draft Memory as icon cards with champion art and the Game 3 prompt", () => {
    const r = buildLabRound(findRound(SSG_G3)!, "seed", { size: 15 });
    expect(r.content.cardKind).toBe("icon");
    expect(r.content.cards).toHaveLength(15);
    expect(r.content.prompt).toBe("Reconstruct Samsung Galaxy's Game 3 composition in the 2017 World Championship Final.");
    expect(r.content.cards.find((c) => c.label === "Cho'Gath")?.media?.src).toMatch(/assets\/champions\/Chogath\/icon\.png$/);
    expect(promptFor(findRound(SSG_G3)!)).not.toMatch(/pick|ban|order/i);
  });
  it("honours the tray options: size and the bench tier", () => {
    const r10 = buildLabRound(findRound(SSG_ROSTER)!, "s", { size: 10, bench: false });
    const r15 = buildLabRound(findRound(SSG_ROSTER)!, "s", { size: 15, bench: true });
    expect(r10.content.cards).toHaveLength(10);
    expect(r10.secret.tray.include_bench).toBe(false);
    expect(r15.content.cards).toHaveLength(15);
    expect(r15.secret.tray.include_bench).toBe(true);
    expect(Object.values(r15.secret.cards).some((m) => m.tier === "bench")).toBe(true);
  });
  it("grades every position against its own answer: one board outcome, per-position evidence, notes for wrong picks only", () => {
    const r = buildLabRound(findRound(SSG_ROSTER)!, "grade");
    const right = gradeLabRound(r.secret, { assignment: arrangedBoard(r, "right") });
    expect(right.isCorrect).toBe(true);
    expect(Object.values(right.positionCorrect).every(Boolean)).toBe(true);
    expect(right.cardNotes).toEqual({});
    expect(right.verdictText).toMatch(/lineup holds/);
    const wrongBoard = arrangedBoard(r, "wrong");
    const wrong = gradeLabRound(r.secret, { assignment: wrongBoard });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.positionCorrect).toEqual({ top: false, jungle: true, mid: false, adc: true, support: false });
    expect(wrong.verdictText).toBe("2 of 5 in position.");
    expect(wrong.canonical).toEqual(r.secret.answer);
    expect(wrong.assignment).toEqual(wrongBoard);
    expect(Object.keys(wrong.cardNotes!).sort()).toEqual([wrongBoard.top, wrongBoard.mid, wrongBoard.support].sort());
    expect(wrong.cardNotes![wrongBoard.top]).toMatch(/mid laner in this series — right player, wrong position/);
    expect(wrong.context.title).toMatch(/Samsung Galaxy vs SK Telecom T1/);
    expect(wrong.context.lines[0]).toMatch(/Best of 3/);
  });
  it("words Draft Memory evidence by tier and never implies a pick order", () => {
    const r = buildLabRound(findRound(SSG_G3)!, "grade");
    const board = arrangedBoard(r, "wrong");
    const out = gradeLabRound(r.secret, { assignment: board });
    expect(out.context.lines[0]).toMatch(/Game 3 · 2017-11-04 · patch 7\.18 · blue side/);
    expect(out.context.lines.join(" ")).toMatch(/no pick order/);
    expect(out.cardNotes![board.top]).toMatch(/did play it in this game — at Mid/);
  });
  it("refuses a response with a card the round never dealt", () => {
    const r = buildLabRound(findRound(SSG_ROSTER)!, "x");
    const board = { ...arrangedBoard(r, "right"), top: "pa_nope" };
    expect(() => gradeLabRound(r.secret, { assignment: board })).toThrow(/never dealt/);
  });
  it("orders rounds deterministically per seed and resolves crests only through the dated media authority", () => {
    expect(roundOrder("a", "roster_lock").map((r) => r.id)).toEqual(roundOrder("a", "roster_lock").map((r) => r.id));
    expect(roundOrder("a", "draft_memory").every((r) => r.family === "draft_memory")).toBe(true);
    expect(teamMark("Invictus Gaming").media?.src).toMatch(/assets\/esports\/teams\//);
    expect(teamMark("Samsung Galaxy").media).toBeNull();
    expect(teamMark("Samsung Galaxy").monogram).toBe("SSG");
  });
  it("leads a disambiguated display name with the handle", () => {
    expect(splitHandle("Blank (Kang Sun-gu)")).toEqual({ handle: "Blank", rest: "Kang Sun-gu" });
    expect(splitHandle("Faker")).toEqual({ handle: "Faker", rest: null });
  });
});
