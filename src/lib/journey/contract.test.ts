import { describe, expect, it } from "vitest";
import {
  JourneyContractError, journeySide, readJourneyPublicState, tryReadJourneyPublicState,
} from "./contract";
import {
  ARC_A_ALT_LEVEL_UP, ARC_A_CHILD_1, ARC_A_CHILD_2, ARC_A_STEPS, ARC_C_CHILD_0_WITHHELD,
  ARC_C_CHILD_2_PREMISE, ARC_F_CHILD_0, ARC_F_CHILD_1_UNLOCK, withBeat,
} from "./fixtures";
import { beatActiveAt, beatRemainingMs, eventDelaysMs, eventLine, transitionMarks } from "./beat";
import { formatStatValue, JOURNEY_STAT_KEYS } from "./stats";

type Wire = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rejects = (wire: unknown, message: RegExp) =>
  expect(() => readJourneyPublicState(wire)).toThrow(message);

describe("journey.public.v0 — every fixture reads through the real reader", () => {
  it("reads the whole arc A run, arc C and arc F", () => {
    for (const w of [...ARC_A_STEPS, ARC_A_ALT_LEVEL_UP, ARC_C_CHILD_0_WITHHELD,
      ARC_C_CHILD_2_PREMISE, ARC_F_CHILD_0, ARC_F_CHILD_1_UNLOCK]) {
      const s = readJourneyPublicState(w);
      expect(s.sides.map((x) => x.side)).toEqual(["subject", "opponent"]);
      expect(s.sides.every((x) => x.abilities.map((a) => a.slot).join("") === "QWER")).toBe(true);
    }
  });

  it("keeps one journey key across the run, so the board mounts once", () => {
    const keys = new Set(ARC_A_STEPS.map((w) => readJourneyPublicState(w).journeyKey));
    expect(keys.size).toBe(1);
  });

  it("carries DIFFERENT ranks per side (the Matchup defect cannot recur)", () => {
    const s = readJourneyPublicState(ARC_A_CHILD_1);
    expect(journeySide(s, "subject").abilities.map((a) => a.rank)).toEqual([3, 1, 1, 1]);
    expect(journeySide(s, "opponent").abilities.map((a) => a.rank)).toEqual([3, 0, 2, 1]);
  });

  it("normalises a payload that lists the opponent first", () => {
    const w = clone(ARC_A_CHILD_1) as Wire;
    w.sides = [...(w.sides as Wire[])].reverse();
    expect(readJourneyPublicState(w).sides[0].championName).toBe("Jarvan IV");
  });
});

describe("public-state safety — a typed allowlist, not a banned-word list", () => {
  it("a withheld stat is read as withheld and carries NO value", () => {
    const s = readJourneyPublicState(ARC_C_CHILD_0_WITHHELD);
    const armor = journeySide(s, "opponent").stats[0];
    // The reader's own marker: the wire carried no `value` key (asserted below).
    expect(armor).toEqual({ key: "armor", withheld: true, value: null, withheldReason: "asked" });
    const wireArmor = (((ARC_C_CHILD_0_WITHHELD as Wire).sides as Wire[])[1].stats as Wire[])[0];
    expect("value" in wireArmor).toBe(false);
  });

  it("REFUSES a withheld stat that still carries its value (CSS-hiding is not withholding)", () => {
    const w = clone(ARC_C_CHILD_0_WITHHELD) as Wire;
    ((w.sides as Wire[])[1].stats as Wire[])[0] = { key: "armor", withheld: true, value: 44.195 };
    rejects(w, /withheld but carries a value/);
    ((w.sides as Wire[])[1].stats as Wire[])[0] = { key: "armor", withheld: true, value: null };
    rejects(w, /withheld but carries a value/);
  });

  it("refuses unknown keys at every level — answer-bearing ones included", () => {
    for (const [path, key] of [
      [[], "correct_answer"], [[], "answer"], [["step"], "reveal"],
      [["sides", 0], "explanation"], [["sides", 1, "stats", 0], "effective"],
      [["focus"], "solution"], [["sides", 0, "abilities", 0], "cooldown"],
    ] as const) {
      const w = clone(ARC_A_CHILD_1) as Wire;
      let target: Wire = w;
      for (const p of path) target = (target as never)[p];
      target[key] = 1;
      rejects(w, /does not allow/);
    }
  });

  it("has no key to publish a derived answer under — cooldowns, damage and effective resists", () => {
    for (const key of ["cooldown", "ability_cooldown", "damage", "post_mitigation_damage",
      "effective_armor", "effective_magic_resist", "total_damage"]) {
      expect(JOURNEY_STAT_KEYS as readonly string[]).not.toContain(key);
      const w = clone(ARC_A_CHILD_1) as Wire;
      ((w.sides as Wire[])[0].stats as Wire[]).push({ key, value: 1 });
      rejects(w, /not a public premise stat/);
    }
  });

  it("refuses a transition that restates a WITHHELD stat", () => {
    const w = clone(ARC_C_CHILD_0_WITHHELD) as Wire;
    w.step = { index: 0, count: 5, node_id: "n1" };
    w.transition = {
      from_node: "n0", to_node: "n1",
      events: [{ kind: "stat_delta", side: "opponent", key: "armor", from: 44.195, to: 59.195 }],
      beat: { ms: 1000, until: null },
    };
    rejects(w, /restates a WITHHELD stat/);
  });

  it("refuses events that contradict the board", () => {
    const w = clone(ARC_A_CHILD_2) as Wire;
    ((w.transition as Wire).events as Wire[])[1] = { kind: "stat_delta", side: "subject", key: "bonus_attack_damage", from: 0, to: 25 };
    rejects(w, /must end at the board's value/);
    const w2 = clone(ARC_A_CHILD_2) as Wire;
    (((w2.transition as Wire).events as Wire[])[0].items as Wire[])[0].item_id = 1031;
    rejects(w2, /does not hold/);
    const w3 = clone(ARC_A_ALT_LEVEL_UP) as Wire;
    ((w3.transition as Wire).events as Wire[])[0] = { kind: "level", side: "subject", from: 6, to: 8 };
    rejects(w3, /must rise to the side's level/);
  });

  it("refuses focus on facts the board does not show, and a self-targeting combat", () => {
    const w = clone(ARC_A_CHILD_1) as Wire;
    w.focus = { refs: [{ side: "subject", kind: "item", key: 3 }] };
    rejects(w, /empty item slot/);
    const w2 = clone(ARC_A_CHILD_1) as Wire;
    w2.focus = { refs: [], combat: { attacker: "subject", target: "subject" } };
    rejects(w2, /must differ/);
  });

  it("refuses structural breakage: two subjects, missing R, seven items, an unknown contract", () => {
    const two = clone(ARC_A_CHILD_1) as Wire;
    (two.sides as Wire[])[1].side = "subject";
    rejects(two, /exactly one subject and one opponent/);
    const noR = clone(ARC_A_CHILD_1) as Wire;
    ((noR.sides as Wire[])[0].abilities as Wire[]).pop();
    rejects(noR, /exactly Q, W, E, R/);
    const seven = clone(ARC_A_CHILD_1) as Wire;
    (seven.sides as Wire[])[0].items = Array.from({ length: 7 }, (_, i) => ({ slot: i % 6, item_id: 1000 + i, name: `i${i}` }));
    rejects(seven, /at most 6/);
    rejects({ ...(ARC_A_CHILD_1 as Wire), contract: "journey.public.v9" }, /unsupported contract/);
  });

  it("REFUSES item gold on a purchase event — the view model carries none (JOURNEY-UI3)", () => {
    const w = JSON.parse(JSON.stringify(ARC_A_CHILD_2)) as Wire;
    (((w.transition as Wire).events as Wire[])[0].items as Wire[])[0].cost = 1050;
    expect(() => readJourneyPublicState(w)).toThrow(/does not allow: "cost"/);
  });

  it("the tolerant reader returns null for a malformed block instead of throwing", () => {
    expect(tryReadJourneyPublicState(null)).toBeNull();
    expect(tryReadJourneyPublicState({ contract: "journey.public.v0" })).toBeNull();
    expect(() => readJourneyPublicState({})).toThrow(JourneyContractError);
  });
});

describe("the beat and its lasting marks", () => {
  it("the beat runs until the SERVER's instant and not a millisecond past it", () => {
    const now = Date.parse("2026-09-25T12:00:00.000Z");
    const s = readJourneyPublicState(withBeat(ARC_A_CHILD_2, now));
    expect(s.transition!.beat.until).toBe("2026-09-25T12:00:01.800Z");
    expect(beatActiveAt(s.transition, now)).toBe(true);
    expect(beatRemainingMs(s.transition, now + 800)).toBe(1000);
    expect(beatActiveAt(s.transition, now + 1800)).toBe(false);
    // No stamped instant = no beat; the client never invents one.
    expect(beatActiveAt(readJourneyPublicState(ARC_A_CHILD_2).transition, now)).toBe(false);
  });

  it("marks are the server's from/to, kept for the whole child", () => {
    const m = transitionMarks(readJourneyPublicState(ARC_A_ALT_LEVEL_UP).transition);
    expect(m.level.subject).toEqual({ from: 6, to: 7 });
    expect(m.rank.has("subject:Q")).toBe(true);
    expect(m.newItems.has("subject:1")).toBe(true);
    expect(m.stat.get("opponent:armor")).toEqual({ from: 91.59, to: 95.349 });
    expect(transitionMarks(null).stat.size).toBe(0);
  });

  it("event lines are short and name the side", () => {
    const s = readJourneyPublicState(ARC_A_CHILD_2);
    const name = (side: "subject" | "opponent") => journeySide(s, side).championName;
    expect(s.transition!.events.map((e) => eventLine(e, name))).toEqual([
      "Jarvan IV recalls · Caulfield's Warhammer",
      "Jarvan IV · Bonus AD 0 → 20",
      "Jarvan IV · AH 0 → 10",
    ]);
    const f = readJourneyPublicState(ARC_F_CHILD_1_UNLOCK);
    expect(eventLine(f.transition!.events[2], (x) => journeySide(f, x).championName)).toBe("Talon · R unlocked");
  });

  it("staging spreads events inside the beat", () => {
    expect(eventDelaysMs(3, 1800)).toEqual([0, 450, 900]);
    expect(eventDelaysMs(1, 1800)).toEqual([0]);
    expect(Math.max(...eventDelaysMs(8, 2400))).toBeLessThanOrEqual(2400 * 0.8);
  });

  it("formats the server's number without rounding a stated premise away", () => {
    expect(formatStatValue(44.195, "armor")).toBe("44.195");
    expect(formatStatValue(91.59, "armor")).toBe("91.59");
    expect(formatStatValue(20, "bonus_attack_damage")).toBe("20");
    expect(formatStatValue(30, "armor_penetration_percent")).toBe("30%");
    // JOURNEY-UI3 — J3 states attack damage with FOUR decimals; every digit stays.
    expect(formatStatValue(70.1625, "attack_damage")).toBe("70.1625");
    expect(formatStatValue(68.8675, "attack_damage")).toBe("68.8675");
    expect(formatStatValue(0.1 + 0.2, "armor")).toBe("0.3");   // float noise only is stripped
  });
});
