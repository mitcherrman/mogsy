/**
 * Contract for the Combat Lab action-variant grouping.
 *
 * The grouping is a display arrangement, so what matters is that it only claims
 * relationships the action metadata actually proves, and that it never disturbs
 * the action objects it is arranging — those carry the ids the page casts with.
 */
import { describe, expect, it } from "vitest";
import { actionStageKey, groupChampionActions } from "./actionGroups";

/** The real `/api/meta/combat-lab-actions` entries for Aatrox. */
const AATROX = [
  { id: "aatrox_q1", label: "Q1 - The Darkin Blade" },
  { id: "aatrox_q1_sweetspot", label: "Q1 Sweetspot" },
  { id: "aatrox_q2", label: "Q2 - The Darkin Blade" },
  { id: "aatrox_q2_sweetspot", label: "Q2 Sweetspot" },
  { id: "aatrox_q3", label: "Q3 - The Darkin Blade" },
  { id: "aatrox_q3_sweetspot", label: "Q3 Sweetspot" },
];

/** Hwei's subject casts — siblings under a subject, with no base cast. */
const HWEI = [
  { id: "hwei_qq", label: "QQ - Devastating Fire" },
  { id: "hwei_qw", label: "QW - Severing Bolt" },
  { id: "hwei_qe", label: "QE - Molten Fissure" },
  { id: "hwei_r", label: "R - Spiraling Despair" },
];

/** Champions whose labels carry no slot token at all. */
const UNTOKENED = [
  { id: "sylas_hijack", label: "Hijack Target" },
  { id: "sylas_cast_hijacked_ultimate", label: "Cast Hijacked Ultimate" },
  { id: "zeri_basic_zap", label: "Basic Zap" },
  { id: "zeri_charged_attack", label: "Charged Attack" },
];

describe("actionStageKey", () => {
  it("treats a digit token as its own stage", () => {
    expect(actionStageKey("Q1")).toBe("Q1");
    expect(actionStageKey("Q3")).toBe("Q3");
  });

  it("folds a two-key token into its subject", () => {
    expect(actionStageKey("QQ")).toBe("Q");
    expect(actionStageKey("WE")).toBe("W");
  });

  it("keeps a plain slot as its own stage and refuses anything else", () => {
    expect(actionStageKey("R")).toBe("R");
    expect(actionStageKey(null)).toBeNull();
    expect(actionStageKey("")).toBeNull();
    expect(actionStageKey("XY")).toBeNull();
  });
});

describe("groupChampionActions — Aatrox staged variants", () => {
  const groups = groupChampionActions(AATROX);

  it("produces one group per stage, in source order", () => {
    expect(groups.map((g) => g.token)).toEqual(["Q1", "Q2", "Q3"]);
    expect(groups.every((g) => g.grouped)).toBe(true);
  });

  it("puts the normal cast and its sweetspot in the same group", () => {
    for (const g of groups) {
      expect(g.members.map((m) => m.variantLabel)).toEqual(["Normal", "Sweetspot"]);
    }
  });

  it("hoists the shared ability name out of the tiles", () => {
    expect(groups.map((g) => g.abilityName)).toEqual([
      "The Darkin Blade",
      "The Darkin Blade",
      "The Darkin Blade",
    ]);
  });

  it("keeps the stage token on each tile as its key badge", () => {
    expect(groups[0].members.map((m) => m.keyLabel)).toEqual(["Q1", "Q1"]);
  });

  it("resolves the parent slot so the stored Q art is used", () => {
    expect(groups.map((g) => g.slot)).toEqual(["Q", "Q", "Q"]);
  });

  it("preserves every action id and object identity", () => {
    const out = groups.flatMap((g) => g.members.map((m) => m.action));
    expect(out.map((a) => a.id)).toEqual(AATROX.map((a) => a.id));
    out.forEach((a, i) => expect(a).toBe(AATROX[i]));
  });

  it("preserves every original label for titles and accessible names", () => {
    const labels = groups.flatMap((g) => g.members.map((m) => m.label));
    expect(labels).toEqual(AATROX.map((a) => a.label));
  });
});

describe("groupChampionActions — sibling sub-actions", () => {
  const groups = groupChampionActions(HWEI);

  it("folds the three Q subject casts into one Q stage", () => {
    const q = groups.find((g) => g.token === "Q");
    expect(q?.grouped).toBe(true);
    expect(q?.members.map((m) => m.action.id)).toEqual(["hwei_qq", "hwei_qw", "hwei_qe"]);
  });

  it("keeps each sibling's own token and name — none of them is 'Normal'", () => {
    const q = groups.find((g) => g.token === "Q")!;
    expect(q.members.map((m) => m.keyLabel)).toEqual(["QQ", "QW", "QE"]);
    expect(q.members.map((m) => m.variantLabel)).toEqual([
      "Devastating Fire",
      "Severing Bolt",
      "Molten Fissure",
    ]);
    expect(q.members.some((m) => m.isBase)).toBe(false);
    expect(q.abilityName).toBeNull();
  });

  it("leaves a stage with a single member ungrouped", () => {
    const r = groups.find((g) => g.members[0].action.id === "hwei_r")!;
    expect(r.grouped).toBe(false);
    expect(r.token).toBeNull();
    expect(r.members[0].keyLabel).toBe("R");
    expect(r.members[0].variantLabel).toBe("Spiraling Despair");
  });
});

describe("groupChampionActions — fallback", () => {
  it("leaves actions whose labels carry no slot token independent", () => {
    const groups = groupChampionActions(UNTOKENED);
    expect(groups).toHaveLength(UNTOKENED.length);
    expect(groups.every((g) => !g.grouped)).toBe(true);
    expect(groups.map((g) => g.members[0].variantLabel)).toEqual([
      "Hijack Target",
      "Cast Hijacked Ultimate",
      "Basic Zap",
      "Charged Attack",
    ]);
  });

  it("does not group two actions merely because their ids share a prefix", () => {
    const groups = groupChampionActions([
      { id: "zeri_basic_zap", label: "Basic Zap" },
      { id: "zeri_basic_zap_charged", label: "Charged Zap" },
    ]);
    expect(groups.every((g) => !g.grouped)).toBe(true);
  });

  it("handles an empty action list", () => {
    expect(groupChampionActions([])).toEqual([]);
  });

  it("falls back to the id when an action has no label", () => {
    const groups = groupChampionActions([{ id: "mystery_action" }]);
    expect(groups[0].grouped).toBe(false);
    expect(groups[0].members[0].variantLabel).toBe("mystery_action");
  });

  it("names a variant from its id suffix when the label repeats the ability name", () => {
    const groups = groupChampionActions([
      { id: "riven_q1", label: "Q1 - Broken Wings" },
      { id: "riven_q1_empowered", label: "Q1 - Broken Wings" },
    ]);
    expect(groups[0].members.map((m) => m.variantLabel)).toEqual(["Normal", "Empowered"]);
  });

  it("refuses to pick a base when two members both qualify as stems", () => {
    // Neither id extends the other, so there is no base and nothing is renamed.
    const groups = groupChampionActions([
      { id: "champ_q1_alpha", label: "Q1 Alpha" },
      { id: "champ_q1_beta", label: "Q1 Beta" },
    ]);
    expect(groups[0].grouped).toBe(true);
    expect(groups[0].members.some((m) => m.isBase)).toBe(false);
    expect(groups[0].members.map((m) => m.variantLabel)).toEqual(["Alpha", "Beta"]);
  });
});
