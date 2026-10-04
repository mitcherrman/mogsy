import { describe, expect, it } from "vitest";
import { comparePatchVersions, parsePatchVersion, resolveLaterHistory } from "./continuity";
import { classifyChange } from "./eligibility";
import { championCard, report, statLine } from "./fixtures/builders";
import {
  CONTINUITY_PROPERTY_FAMILY,
  V1_PROPERTIES,
  classifyBaseStatLine,
  companionOf,
  isProjectableFamily,
  isV1Property,
} from "./families";

describe("V1 property registry", () => {
  it("covers exactly the supported families and columns", () => {
    expect(Object.fromEntries(Object.entries(V1_PROPERTIES).map(([k, s]) => [k, s.column]))).toEqual({
      base_health: "hp",
      health_growth: "hp_per_level",
      base_ad: "ad",
      ad_growth: "ad_per_level",
      base_armor: "armor",
      armor_growth: "armor_per_level",
      base_mr: "magic_resist",
      mr_growth: "magic_resist_per_level",
      base_mana: "mp",
      mana_growth: "mp_per_level",
      base_attack_speed: "attack_speed",
      attack_speed_growth: "attack_speed_per_level",
    });
  });

  it("excludes regen, ratio, move speed and range from V1", () => {
    for (const p of [
      "base_health_regen",
      "health_regen_growth",
      "base_mana_regen",
      "mana_regen_growth",
      "attack_speed_ratio",
      "base_move_speed",
      "base_attack_range",
      "total_cost",
      "",
    ]) {
      expect(isV1Property(p)).toBe(false);
    }
    expect(isV1Property(null)).toBe(false);
  });

  it("pairs each projectable half with its companion; attack speed has none", () => {
    expect(companionOf("base_ad")).toBe("ad_growth");
    expect(companionOf("mana_growth")).toBe("base_mana");
    expect(companionOf("attack_speed_growth")).toBeNull();
    expect(isProjectableFamily("attack_speed")).toBe(false);
    expect(isProjectableFamily("mana")).toBe(true);
  });

  it("knows all 19 registered base-stat properties and keeps regen out of mana", () => {
    expect(Object.keys(CONTINUITY_PROPERTY_FAMILY)).toHaveLength(19);
    expect(CONTINUITY_PROPERTY_FAMILY.base_mana).toBe("mana");
    expect(CONTINUITY_PROPERTY_FAMILY.base_mana_regen).toBe("mana_regen");
    for (const key of Object.keys(V1_PROPERTIES)) {
      expect(CONTINUITY_PROPERTY_FAMILY[key]).toBe(V1_PROPERTIES[key as keyof typeof V1_PROPERTIES].family);
    }
  });
});

describe("controlled Base Stats line classification", () => {
  it("uses the authoritative mogzy_property first", () => {
    expect(classifyBaseStatLine("base_armor", "Whatever")).toEqual({ kind: "family", family: "armor" });
    expect(classifyBaseStatLine("some_future_property", "Armor")).toEqual({ kind: "unclassified" });
  });

  it.each([
    ["Health Regeneration", "health_regen"],
    ["Base Mana Regeneration", "mana_regen"],
    ["Mana", "mana"],
    ["Attack Speed Ratio", "attack_speed_ratio"],
    ["Attack Speed", "attack_speed"],
    ["Move Speed", "move_speed"],
    ["  attack damage:  ", "ad"],
    ["Health per level", "health"],
  ])("exact label %j → %s", (label, family) => {
    expect(classifyBaseStatLine(null, label)).toEqual({ kind: "family", family });
  });

  it.each(["Monster Damage", "Basic Attack Damage Modifier", "Attack Cast Time", "Model Size"])(
    "documented no-column label %j",
    (label) => {
      expect(classifyBaseStatLine(null, label)).toEqual({ kind: "no_canonical_column" });
    },
  );

  it.each([
    "Total Attack Animation",
    "Attack Damage Bonus",
    "Healthy",
    "Base Health Pool",
    "Armor Penetration",
    "",
  ])("never fuzzy-matches %j", (label) => {
    expect(classifyBaseStatLine(null, label)).toEqual({ kind: "unclassified" });
  });

  it("never lets wording promote a line into a calculation", () => {
    const change = statLine(null, "Base Attack Damage", "60", "58");
    expect(classifyChange(championCard("Smolder", [change]), change)).toEqual({
      ok: false,
      reason: "property_unmapped",
    });
  });
});

describe("patch versions and coverage", () => {
  it("parses and compares numerically, not lexically", () => {
    expect(parsePatchVersion("26.9")).toEqual([26, 9]);
    expect(parsePatchVersion("v26.9")).toBeNull();
    expect(parsePatchVersion("")).toBeNull();
    expect(comparePatchVersions("26.10", "26.9")).toBeGreaterThan(0);
    expect(comparePatchVersions("26.19", "26.19")).toBe(0);
    expect(comparePatchVersions("25.24", "26.1")).toBeLessThan(0);
    expect(comparePatchVersions("26.x", "26.1")).toBeNull();
  });

  it("requires every expected later version, ignores P and earlier, keeps extras", () => {
    const r = (v: string) => report(v, []);
    expect(resolveLaterHistory("26.12", [r("26.13")], ["26.13"])).toMatchObject({ ok: true });
    // P itself and earlier reports are not evidence about later patches.
    const withP = resolveLaterHistory("26.12", [r("26.12"), r("26.11"), r("26.13")], ["26.12", "26.13"]);
    expect(withP.ok && withP.reports.map((x) => x.patch_version)).toEqual(["26.13"]);
    // An extra, newer report than the expected list is kept.
    const extra = resolveLaterHistory("26.12", [r("26.14"), r("26.13")], ["26.13"]);
    expect(extra.ok && extra.reports.map((x) => x.patch_version)).toEqual(["26.13", "26.14"]);
    // P is the latest patch: nothing to cover.
    expect(resolveLaterHistory("26.19", [], ["26.19"])).toEqual({ ok: true, reports: [] });
    expect(resolveLaterHistory("26.12", [r("26.13")], ["26.13", "26.14"])).toEqual({
      ok: false,
      reason: "history_incomplete",
    });
    expect(resolveLaterHistory("26.12", null, [])).toMatchObject({ ok: false });
    expect(resolveLaterHistory("26.12", [], undefined)).toMatchObject({ ok: false });
    expect(resolveLaterHistory("bad", [], [])).toMatchObject({ ok: false });
  });
});
