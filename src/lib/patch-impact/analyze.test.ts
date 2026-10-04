import { describe, expect, it } from "vitest";
import { mkCard, mkChange } from "@/lib/patch-reports/test-fixtures";
import { analyzeChampionStatChange, type PatchImpactInput } from "./analyze";
import { canonicalRow, championCard, report, statLine } from "./fixtures/builders";
import type { ImpactUnavailableReason, PatchImpactAnalysis } from "./types";

const P = "26.12";

function run(
  card: ReturnType<typeof championCard>,
  change: ReturnType<typeof statLine>,
  o: Partial<PatchImpactInput> = {},
): PatchImpactAnalysis {
  return analyzeChampionStatChange({
    card,
    change,
    patchVersion: P,
    canonical: [canonicalRow(card.mogzy_entity_ref ?? "Nobody")],
    laterReports: [],
    laterVersionsExpected: [],
    ...o,
  });
}

function projected(a: PatchImpactAnalysis) {
  expect(a.status).toBe("projected");
  if (a.status !== "projected") throw new Error("not projected");
  return a;
}

function paramOnly(a: PatchImpactAnalysis, reason: ImpactUnavailableReason) {
  expect(a).toMatchObject({ status: "parameter_only", projectionUnavailable: reason });
  if (a.status !== "parameter_only") throw new Error("not parameter_only");
  return a;
}

describe("projection shapes", () => {
  it("base-stat change: companion growth from live canonical", () => {
    const change = statLine("base_ad", "Base AD", "60", "58");
    const card = championCard("Smolder", [change]);
    const a = projected(run(card, change, { canonical: [canonicalRow("Smolder", { ad_per_level: 2.3 })] }));
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0]).toMatchObject({ family: "ad", half: "base", before: 60, after: 58, provenance: "riot_line" });
    expect(a.projection.inputs.growthBefore).toEqual({ value: 2.3, provenance: "canonical_current" });
    expect(a.projection.inputs.growthAfter).toEqual({ value: 2.3, provenance: "canonical_current" });
    expect(a.projection.levels).toHaveLength(18);
    for (const p of a.projection.levels) expect(p.absDelta).toBeCloseTo(-2, 9);
    expect(a.projection.crossoverLevel).toBeNull();
    expect(a.projection.trust).toEqual({
      usesMogzyData: true,
      canonicalEntity: "Smolder",
      laterVersionsChecked: [],
    });
  });

  it("growth-stat change: companion base from live canonical", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const card = championCard("Lee Sin", [change]);
    const a = projected(run(card, change, { canonical: [canonicalRow("Lee Sin", { ad: 66, ad_per_level: 3.4 })] }));
    expect(a.facts[0]).toMatchObject({ half: "growth", before: 3.7, after: 3.4 });
    const l18 = a.projection.levels[17];
    expect(l18.before).toBeCloseTo(128.9, 6);
    expect(l18.after).toBeCloseTo(123.8, 6);
    expect(l18.absDelta).toBeCloseTo(-5.1, 6);
    expect(a.projection.levels[0].absDelta).toBe(0);
  });

  it("base + growth changed in one compound line: both Riot, no Mogzy data", () => {
    const change = statLine("base_ad", "Attack Damage", "63 + 3.5/Level", "61 + 3.9/Level");
    const card = championCard("Vi", [change]);
    // Canonical is deliberately absent: a compound line needs none.
    const a = projected(run(card, change, { canonical: null, laterReports: null, laterVersionsExpected: null }));
    expect(a.facts.map((f) => [f.half, f.before, f.after])).toEqual([
      ["base", 63, 61],
      ["growth", 3.5, 3.9],
    ]);
    expect(a.projection.trust.usesMogzyData).toBe(false);
    for (const k of ["baseBefore", "baseAfter", "growthBefore", "growthAfter"] as const) {
      expect(a.projection.inputs[k].provenance).toBe("riot_line");
    }
    expect(a.projection.levels[0].absDelta).toBeCloseTo(-2, 9);
    expect(a.projection.crossoverLevel).toBe(8);
  });

  it("a compound line states the unchanged half too, but only moved halves become facts", () => {
    const change = statLine("armor_growth", "Armor Growth", "33 + 4.5/Level", "33 + 5/Level");
    const a = projected(run(championCard("Master Yi", [change]), change, { canonical: null }));
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0]).toMatchObject({ half: "growth", property: "armor_growth" });
  });

  it("base + growth as two scalar lines in one card: each takes the other from Riot", () => {
    const base = statLine("base_armor", "Base Armor", "21", "19");
    const growth = statLine("armor_growth", "Armor Growth", "4.5", "4.1");
    const card = championCard("Anivia", [base, growth]);
    const a = projected(run(card, base, { canonical: null }));
    expect(a.projection.inputs.growthBefore).toEqual({ value: 4.5, provenance: "riot_same_card" });
    expect(a.projection.inputs.growthAfter).toEqual({ value: 4.1, provenance: "riot_same_card" });
    expect(a.projection.trust.usesMogzyData).toBe(false);
    const b = projected(run(card, growth, { canonical: null }));
    expect(b.projection.inputs.baseBefore).toEqual({ value: 21, provenance: "riot_same_card" });
    expect(b.projection.inputs.baseAfter).toEqual({ value: 19, provenance: "riot_same_card" });
    // Both moved: the projection includes both effects.
    expect(b.projection.levels[17].before).toBeCloseTo(21 + 4.5 * 17, 9);
    expect(b.projection.levels[17].after).toBeCloseTo(19 + 4.1 * 17, 9);
  });

  it("level 1 and level 18 are exact", () => {
    const change = statLine("health_growth", "Health Growth", "99", "105");
    const a = projected(
      run(championCard("Fiora", [change]), change, { canonical: [canonicalRow("Fiora", { hp: 620 })] }),
    );
    expect(a.projection.levels[0]).toMatchObject({ level: 1, before: 620, after: 620 });
    expect(a.projection.levels[17]).toMatchObject({ level: 18 });
    expect(a.projection.levels[17].before).toBeCloseTo(2303, 6);
    expect(a.projection.levels[17].after).toBeCloseTo(2405, 6);
  });

  it("supports the mr family from canonical (no real line yet)", () => {
    const change = statLine("mr_growth", "Magic Resist Growth", "1.25", "1.5");
    const a = projected(
      run(championCard("Karthus", [change]), change, { canonical: [canonicalRow("Karthus", { magic_resist: 32 })] }),
    );
    expect(a.family).toBe("mr");
    expect(a.projection.inputs.baseBefore.value).toBe(32);
  });

  it("supports the mana family only with a mana resource", () => {
    const change = statLine("mana_growth", "Mana per level", "40", "45");
    const card = championCard("Lux", [change]);
    const a = projected(run(card, change, { canonical: [canonicalRow("Lux", { mp: 350 })] }));
    expect(a.family).toBe("mana");
    paramOnly(run(card, change, { canonical: [canonicalRow("Lux", { mp: 0 })] }), "no_resource");
  });

  it("zero-before parameter: relative delta unavailable, projection still fine", () => {
    const change = statLine("mana_growth", "Mana per level", "0", "5");
    const a = projected(
      run(championCard("Lux", [change]), change, { canonical: [canonicalRow("Lux", { mp: 300 })] }),
    );
    expect(a.facts[0].relDelta).toBeNull();
    expect(a.facts[0].relDeltaUnavailableReason).toBe("zero_baseline");
    expect(a.projection.levels[0].relDelta).toBe(0);
  });
});

describe("later-report continuity", () => {
  const growthChange = statLine("ad_growth", "AD Growth", "3.7", "3.4");
  const card = championCard("Lee Sin", [growthChange]);
  const laterBase = (patch: string, before: string, after: string) =>
    report(patch, [championCard("Lee Sin", [statLine("base_ad", "Base AD", before, after)])]);
  const expected = ["26.13", "26.14"];

  it("holds the companion constant when no later patch touched it", () => {
    const a = projected(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 66 })],
        laterReports: [report("26.13", []), report("26.14", [])],
        laterVersionsExpected: expected,
      }),
    );
    expect(a.projection.inputs.baseBefore).toEqual({ value: 66, provenance: "canonical_current" });
    expect(a.projection.trust.laterVersionsChecked).toEqual(["26.13", "26.14"]);
  });

  it("recovers the value at P from the earliest later `before` (chain proven)", () => {
    const a = projected(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 70 })],
        laterReports: [laterBase("26.13", "66", "68"), laterBase("26.14", "68", "70")],
        laterVersionsExpected: expected,
      }),
    );
    expect(a.projection.inputs.baseBefore).toEqual({ value: 66, provenance: "riot_later_before", patch: "26.13" });
    expect(a.projection.inputs.baseAfter.value).toBe(66);
    expect(a.projection.trust.usesMogzyData).toBe(true);
  });

  it("accepts later reports out of order", () => {
    const a = run(card, growthChange, {
      canonical: [canonicalRow("Lee Sin", { ad: 70 })],
      laterReports: [laterBase("26.14", "68", "70"), laterBase("26.13", "66", "68")],
      laterVersionsExpected: expected,
    });
    expect(projected(a).projection.inputs.baseBefore.value).toBe(66);
  });

  it("breaks when links do not agree", () => {
    paramOnly(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 70 })],
        laterReports: [laterBase("26.13", "66", "68"), laterBase("26.14", "69", "70")],
        laterVersionsExpected: expected,
      }),
      "companion_chain_break",
    );
  });

  it("breaks when the last link disagrees with live canonical", () => {
    paramOnly(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 72 })],
        laterReports: [laterBase("26.13", "66", "68"), report("26.14", [])],
        laterVersionsExpected: expected,
      }),
      "companion_chain_break",
    );
  });

  it("breaks when one report changes the companion twice (order unknowable)", () => {
    const twice = report("26.13", [
      championCard("Lee Sin", [
        statLine("base_ad", "Base AD", "66", "68"),
        statLine("base_ad", "Base AD", "68", "70"),
      ]),
    ]);
    paramOnly(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 70 })],
        laterReports: [twice, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
      "companion_chain_break",
    );
  });

  it("a later change to the CHANGED half does not disturb the companion", () => {
    const laterGrowth = report("26.13", [championCard("Lee Sin", [statLine("ad_growth", "AD Growth", "3.4", "3.2")])]);
    projected(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 66 })],
        laterReports: [laterGrowth, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
    );
  });

  it("a later same-family UNMAPPED line blocks that family's projection", () => {
    const unmapped = report("26.13", [championCard("Lee Sin", [statLine(null, "Attack Damage", "66", "70")])]);
    paramOnly(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 70 })],
        laterReports: [unmapped, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
      "family_continuity_unproven",
    );
  });

  it("a later same-family line that is mapped but unparseable also blocks", () => {
    const garbled = report("26.13", [championCard("Lee Sin", [statLine("base_ad", "Base AD", "66", "70 (approx)")])]);
    paramOnly(
      run(card, growthChange, {
        laterReports: [garbled, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
      "family_continuity_unproven",
    );
  });

  it("a later UNRELATED-family uncertainty does NOT block (mana regen vs AD)", () => {
    const regen = report("26.13", [
      championCard("Lee Sin", [
        statLine(null, "Base Mana Regeneration", "9", "11"),
        statLine(null, "Health Regeneration", "8", "9"),
        statLine("base_move_speed", "Move Speed", "330", "335"),
        statLine(null, "Attack Speed Ratio", "0.85", "0.67"),
        statLine(null, "Model Size", "100%", "95%"),
        statLine("armor_growth", "Armor Growth", "4", "4.2"),
      ]),
    ]);
    projected(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin", { ad: 66 })],
        laterReports: [regen, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
    );
  });

  it("a totally unclassifiable later Base Stats line blocks the champion", () => {
    const mystery = report("26.13", [championCard("Lee Sin", [statLine(null, "Attack Windup Shape", "1", "2")])]);
    paramOnly(
      run(card, growthChange, {
        laterReports: [mystery, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
      "unclassified_base_stat_change",
    );
    // …including a mechanical line with no label the grammar knows.
    const mech = report("26.13", [
      championCard("Lee Sin", [statLine(null, "Total Attack Animation", null, null, { change_kind: "mechanical" })]),
    ]);
    paramOnly(
      run(card, growthChange, { laterReports: [mech, report("26.14", [])], laterVersionsExpected: expected }),
      "unclassified_base_stat_change",
    );
  });

  it("an unclassifiable line in P's own card blocks too (concurrent change)", () => {
    const concurrent = statLine(null, "Attack Windup Shape", "1", "2");
    const c = championCard("Lee Sin", [growthChange, concurrent]);
    paramOnly(run(c, growthChange), "unclassified_base_stat_change");
  });

  it("unclassified lines do not touch projections that use only Riot values", () => {
    const base = statLine("base_armor", "Armor", "32", "28");
    const growth = statLine("armor_growth", "Armor Growth", "4.7", "5");
    const mystery = statLine(null, "Attack Windup Shape", "1", "2");
    projected(run(championCard("Bel'Veth", [base, growth, mystery]), base, { canonical: null }));
    const compound = statLine("base_ad", "Attack Damage", "63 + 3.5/Level", "61 + 3.9/Level");
    projected(run(championCard("Vi", [compound, mystery]), compound, { canonical: null }));
  });

  it("a later same-name card with no ref is still the same champion", () => {
    const nullRef = report("26.13", [
      championCard("Lee Sin", [statLine(null, "Attack Damage", "66", "70")], { mogzy_entity_ref: null }),
    ]);
    paramOnly(
      run(card, growthChange, { laterReports: [nullRef, report("26.14", [])], laterVersionsExpected: expected }),
      "family_continuity_unproven",
    );
    // A different champion's lines never matter.
    const other = report("26.13", [championCard("Teemo", [statLine(null, "Attack Damage", "1", "2")])]);
    projected(
      run(card, growthChange, {
        canonical: [canonicalRow("Lee Sin")],
        laterReports: [other, report("26.14", [])],
        laterVersionsExpected: expected,
      }),
    );
  });

  it("mode-section cards are not champion history", () => {
    const mode = report("26.13", [
      mkCard("Lee Sin", {
        entity_type: "system",
        section_title: "Classic",
        mogzy_entity_ref: "Lee Sin",
        changes: [mkChange({ group_title: "", mogzy_property: "base_ad", before_raw: "1", after_raw: "2" })],
      }),
    ]);
    projected(
      run(card, growthChange, { laterReports: [mode, report("26.14", [])], laterVersionsExpected: expected }),
    );
  });

  it("a base-stat property outside the Base Stats group still blocks its family", () => {
    const odd = report("26.13", [
      championCard("Lee Sin", [statLine("base_ad", "Attack Damage", "66", "70", { group_title: "Q - Sonic Wave" })]),
    ]);
    paramOnly(
      run(card, growthChange, { laterReports: [odd, report("26.14", [])], laterVersionsExpected: expected }),
      "family_continuity_unproven",
    );
  });
});

describe("evidence gates", () => {
  const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
  const card = championCard("Lee Sin", [change]);

  it("not-yet-loaded evidence yields parameter facts only, never a partial projection", () => {
    const a = paramOnly(run(card, change, { canonical: undefined }), "history_incomplete");
    expect(a.facts).toHaveLength(1);
    paramOnly(run(card, change, { laterReports: null }), "history_incomplete");
    paramOnly(run(card, change, { laterVersionsExpected: undefined }), "history_incomplete");
  });

  it("a gap in the later reports is incomplete history", () => {
    paramOnly(
      run(card, change, { laterReports: [report("26.14", [])], laterVersionsExpected: ["26.13", "26.14"] }),
      "history_incomplete",
    );
  });

  it("duplicate later versions are incomplete history", () => {
    paramOnly(
      run(card, change, {
        laterReports: [report("26.13", []), report("26.13", [])],
        laterVersionsExpected: ["26.13"],
      }),
      "history_incomplete",
    );
  });

  it("a null mogzy_entity_ref is an unresolved identity, with or without data", () => {
    const locke = championCard("Locke", [statLine("base_health", "Health", "655", "620")], { mogzy_entity_ref: null });
    paramOnly(run(locke, locke.changes[0], { canonical: undefined }), "identity_unresolved");
    paramOnly(run(locke, locke.changes[0]), "identity_unresolved");
  });

  it("identity is an exact match against exactly one canonical row", () => {
    paramOnly(run(card, change, { canonical: [canonicalRow("lee sin")] }), "identity_unresolved");
    paramOnly(run(card, change, { canonical: [canonicalRow("Lee Sin"), canonicalRow("Lee Sin")] }), "identity_unresolved");
    paramOnly(run(card, change, { canonical: [] }), "identity_unresolved");
  });

  it("an unusable canonical value is refused", () => {
    paramOnly(run(card, change, { canonical: [canonicalRow("Lee Sin", { ad: Number.NaN })] }), "canonical_value_invalid");
    paramOnly(run(card, change, { canonical: [canonicalRow("Lee Sin", { ad: -1 })] }), "canonical_value_invalid");
  });

  it("RECONCILIATION_FAILED from P onward blocks canonical-dependent projections", () => {
    paramOnly(run(card, change, { reconciliationByVersion: { [P]: "RECONCILIATION_FAILED" } }), "reconciliation_failed");
    paramOnly(
      run(card, change, {
        laterReports: [report("26.13", [], "RECONCILIATION_FAILED")],
        laterVersionsExpected: ["26.13"],
      }),
      "reconciliation_failed",
    );
    // Other statuses do not block.
    projected(
      run(card, change, {
        laterReports: [report("26.13", [], "RECONCILED_WITH_HELDS")],
        laterVersionsExpected: ["26.13"],
        reconciliationByVersion: { [P]: "PUBLISHED_NOT_RECONCILED" },
      }),
    );
  });

  it("…but never a Riot-only projection, and never the parameter facts", () => {
    const compound = statLine("base_ad", "Attack Damage", "61 + 3.3/Level", "58 + 3.3/Level");
    const a = projected(
      run(championCard("Nautilus", [compound]), compound, {
        reconciliationByVersion: { [P]: "RECONCILIATION_FAILED" },
      }),
    );
    expect(a.facts).toHaveLength(1);
    const failed = paramOnly(run(card, change, { reconciliationByVersion: { [P]: "RECONCILIATION_FAILED" } }), "reconciliation_failed");
    expect(failed.facts[0]).toMatchObject({ before: 3.7, after: 3.4 });
  });

  it("mogzy_status / mogzy_current_raw never gate or feed the analysis", () => {
    const base = { canonical: [canonicalRow("Lee Sin", { ad: 66 })] };
    const baseline = run(card, change, base);
    for (const status of ["matches", "applied", "pending", "mismatch", "unresolved", "needs_interpretation", "not_represented"] as const) {
      const c = statLine("ad_growth", "AD Growth", "3.7", "3.4", { mogzy_status: status, mogzy_current_raw: "999" });
      expect(run(championCard("Lee Sin", [c]), c, base)).toMatchObject({
        status: "projected",
        facts: [{ before: 3.7, after: 3.4 }],
      });
    }
    // Same output as the baseline, ignoring the card id.
    expect(JSON.stringify(baseline)).toContain("canonical_current");
  });

  it("a canonical value that disagrees with Riot's `after` does not change Riot's parameter facts", () => {
    const a = projected(run(card, change, { canonical: [canonicalRow("Lee Sin", { ad_per_level: 9 })] }));
    expect(a.facts[0]).toMatchObject({ before: 3.7, after: 3.4 });
  });
});

describe("eligibility edges through analyze()", () => {
  it("no mogzy_property → unavailable, whatever the wording says", () => {
    const change = statLine(null, "Base Attack Damage", "60", "58");
    expect(run(championCard("Smolder", [change]), change)).toEqual({
      status: "unavailable",
      reason: "property_unmapped",
    });
  });

  it("a non-Champions section → unavailable (Classic Heimerdinger turret rank values)", () => {
    const change = mkChange({
      group_title: "",
      property_name: "Base Attack Damage",
      mogzy_property: "base_ad",
      before_raw: "30 / 38 / 46 / 54 / 62",
      after_raw: "28 / 36 / 44 / 52 / 60",
    });
    const card = mkCard("Heimerdinger", {
      entity_type: "system",
      section_title: "Classic",
      mogzy_entity_ref: null,
      changes: [change],
    });
    expect(analyzeChampionStatChange({ card, change, patchVersion: "26.16" })).toEqual({
      status: "unavailable",
      reason: "out_of_scope",
    });
  });

  it("a champion card in a mode section → unavailable", () => {
    const change = statLine("base_ad", "Base AD", "60", "58");
    const card = championCard("Smolder", [change], { section_title: "Arena" });
    expect(run(card, change)).toEqual({ status: "unavailable", reason: "out_of_scope" });
  });

  it("ability lines and mechanical lines → unavailable", () => {
    const ability = statLine("base_ad", "Base AD", "60", "58", { group_title: "Q - Sonic Wave" });
    expect(run(championCard("Lee Sin", [ability]), ability)).toMatchObject({ reason: "out_of_scope" });
    const slotted = statLine("base_ad", "Base AD", "60", "58", { ability_slot: "Q" });
    expect(run(championCard("Lee Sin", [slotted]), slotted)).toMatchObject({ reason: "out_of_scope" });
    const mech = statLine("base_ad", "Base AD", null, null, { change_kind: "mechanical" });
    expect(run(championCard("Lee Sin", [mech]), mech)).toMatchObject({ reason: "out_of_scope" });
  });

  it("unsupported properties → unavailable", () => {
    for (const property of ["base_move_speed", "base_attack_range", "attack_speed_ratio", "base_health_regen", "mana_regen_growth", "total_cost"]) {
      const change = statLine(property, "X", "1", "2");
      expect(run(championCard("Lee Sin", [change]), change)).toEqual({
        status: "unavailable",
        reason: "property_unsupported",
      });
    }
  });

  it("attack speed: parameter facts only, projection deferred", () => {
    const change = statLine("attack_speed_growth", "Attack Speed Growth", "2.35%", "1.5%");
    const a = paramOnly(run(championCard("LeBlanc", [change]), change), "projection_deferred");
    expect(a.family).toBe("attack_speed");
    expect(a.facts).toHaveLength(1);
    expect(a.facts[0].unit).toBe("percent_points");
    expect(a.facts[0].absDelta).toBeCloseTo(-0.85, 9);
    expect(a.facts[0].relDelta! * 100).toBeCloseTo(-36.17, 1);
    // base attack speed: same
    const base = statLine("base_attack_speed", "Attack Speed", "0.625", "0.65");
    paramOnly(run(championCard("Jhin", [base]), base), "projection_deferred");
  });

  it("malformed or ambiguous raw values fail closed", () => {
    const cases: Array<[string | null, string | null]> = [
      ["60 / 65", "58 / 63"],
      ["58-60", "55-57"],
      ["~60", "58"],
      ["60", "58 (halved)"],
      ["34 + 5/Level", "36"],
      [null, "58"],
      ["60", null],
      ["", ""],
      ["-5", "-3"],
      ["60", "58%"],
    ];
    for (const [before, after] of cases) {
      const change = statLine("base_ad", "Base AD", before, after);
      expect(run(championCard("Smolder", [change]), change)).toEqual({
        status: "unavailable",
        reason: "unparseable_value",
      });
    }
  });

  it("an unchanged value is not an Impact line", () => {
    const change = statLine("base_ad", "Base AD", "60", "60");
    expect(run(championCard("Smolder", [change]), change)).toEqual({
      status: "unavailable",
      reason: "no_parameter_change",
    });
  });

  it("duplicate or overlapping lines for one half are ambiguous, not guessed", () => {
    const a = statLine("base_ad", "Base AD", "60", "58");
    const dup = statLine("base_ad", "Attack Damage", "60", "57");
    paramOnly(run(championCard("Smolder", [a, dup]), a), "ambiguous_card_lines");
    const compound = statLine("ad_growth", "AD Growth", "3 + 3/Level", "3 + 3.5/Level");
    paramOnly(run(championCard("Smolder", [a, compound]), a), "ambiguous_card_lines");
    // a compound line plus a scalar of its family
    paramOnly(run(championCard("Smolder", [compound, a]), compound), "ambiguous_card_lines");
  });

  it("a second, unparseable line of the same family in the card blocks a Riot-only pair", () => {
    const base = statLine("base_armor", "Armor", "32", "28");
    const growth = statLine("armor_growth", "Armor Growth", "4.7", "5");
    const stray = statLine("base_armor", "Armor", "n/a", "n/a");
    paramOnly(run(championCard("Bel'Veth", [base, growth, stray]), base), "family_continuity_unproven");
  });
});

describe("purity and copy", () => {
  it("does not mutate inputs and is deterministic", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const card = championCard("Lee Sin", [change]);
    const input: PatchImpactInput = {
      card,
      change,
      patchVersion: P,
      canonical: [canonicalRow("Lee Sin", { ad: 70 })],
      laterReports: [
        report("26.13", [championCard("Lee Sin", [statLine("base_ad", "Base AD", "66", "70")])]),
      ],
      laterVersionsExpected: ["26.13"],
      reconciliationByVersion: { [P]: "RECONCILED" },
    };
    const snapshot = structuredClone(input);
    const first = analyzeChampionStatChange(input);
    const second = analyzeChampionStatChange(input);
    expect(input).toEqual(snapshot);
    expect(second).toEqual(first);
    expect(first.status).toBe("projected");
  });

  it("emits no comparative-strength wording", () => {
    const change = statLine("ad_growth", "AD Growth", "3.7", "3.4");
    const text = JSON.stringify([
      run(championCard("Lee Sin", [change]), change),
      run(championCard("Lee Sin", [change]), change, { canonical: null }),
    ]).toLowerCase();
    expect(text).not.toMatch(/power|stronger|weaker/);
  });

  it("never produces NaN or Infinity anywhere in a projection", () => {
    const change = statLine("mana_growth", "Mana per level", "0", "0.5");
    const a = projected(
      run(championCard("Lux", [change]), change, { canonical: [canonicalRow("Lux", { mp: 0.0001 })] }),
    );
    const flat = JSON.stringify(a, (_k, v) => (typeof v === "number" && !Number.isFinite(v) ? "BAD" : v));
    expect(flat).not.toContain("BAD");
  });
});
