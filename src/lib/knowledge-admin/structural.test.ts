import { describe, expect, it } from "vitest";
import {
  isStructuralProperty,
  parseStructuralPayload,
  structuralPlanFrom,
} from "./structural";

const payload = (obj: unknown) => JSON.stringify(obj);

describe("isStructuralProperty", () => {
  it("detects the structural prefix", () => {
    expect(isStructuralProperty("structural:ability_create")).toBe(true);
    expect(isStructuralProperty("cooldown")).toBe(false);
    expect(isStructuralProperty(null)).toBe(false);
    expect(isStructuralProperty(undefined)).toBe(false);
  });
});

describe("parseStructuralPayload — happy paths", () => {
  it("parses a champion identity creation", () => {
    const res = parseStructuralPayload(
      "structural:champion_identity",
      payload({
        target: "structural",
        kind: "champion_identity",
        champion: "Zenara",
        fields: { title: "the Starlit Warden", resource_type: "Mana", attack_type: "Ranged" },
      }),
    );
    expect(res.ok).toBe(true);
    expect(res.payload?.champion).toBe("Zenara");
    expect(res.payload?.slot).toBeNull();
    expect(res.payload?.fields.map((f) => [f.label, f.value])).toEqual([
      ["Title", "the Starlit Warden"],
      ["Resource type", "Mana"],
      ["Attack type", "Ranged"],
    ]);
    expect(res.payload?.skipped).toEqual([]);
  });

  it("parses an ability creation with cooldown/cost/range and skipped fields", () => {
    const res = parseStructuralPayload(
      "structural:ability_create",
      payload({
        target: "structural",
        kind: "ability_create",
        champion: "Zenara",
        slot: "Q",
        fields: {
          ability_name: "Starfall Lance",
          description: "Hurls a lance of starlight.",
          cooldown: "9 / 8 / 7 / 6 / 5",
          cost: "50 / 55 / 60 / 65 / 70",
          range_text: "",
        },
      }),
    );
    expect(res.ok).toBe(true);
    const p = res.payload!;
    expect(p.slot).toBe("Q");
    const byField = Object.fromEntries(p.fields.map((f) => [f.field, f.value]));
    expect(byField.ability_name).toBe("Starfall Lance");
    expect(byField.cooldown).toBe("9 / 8 / 7 / 6 / 5");
    expect(byField.cost).toBe("50 / 55 / 60 / 65 / 70");
    // Empty range_text = deterministic parser refused it → surfaced as skipped
    expect(p.skipped.map((s) => s.field)).toEqual(["range_text"]);
    expect(p.skipped[0].reason).toMatch(/value pipeline/);
  });

  it("parses a role/tag replacement", () => {
    const res = parseStructuralPayload(
      "structural:role_tags",
      payload({ target: "structural", kind: "role_tags", champion: "Zenara", roles: ["Mage", "Artillery"] }),
    );
    expect(res.ok).toBe(true);
    expect(res.payload?.roles).toEqual(["Mage", "Artillery"]);
  });

  it("lower-case slot is normalised", () => {
    const res = parseStructuralPayload(
      "structural:ability_create",
      payload({ target: "structural", kind: "ability_create", champion: "Z", slot: "r", fields: { ability_name: "Ult" } }),
    );
    expect(res.ok).toBe(true);
    expect(res.payload?.slot).toBe("R");
  });
});

describe("parseStructuralPayload — fail-closed on anything not understood", () => {
  const CASES: [string, string | null, string | null, RegExp][] = [
    ["missing payload", "structural:role_tags", null, /missing/],
    ["invalid JSON", "structural:role_tags", "{nope", /not valid JSON/],
    ["non-object payload", "structural:role_tags", "[1,2]", /not an object/],
    ["wrong target", "structural:role_tags", payload({ target: "component", kind: "role_tags", champion: "Z", roles: ["Mage"] }), /target/],
    ["unknown kind", "structural:champion_delete", payload({ target: "structural", kind: "champion_delete", champion: "Z" }), /unknown structural kind/],
    ["kind/property mismatch", "structural:role_tags", payload({ target: "structural", kind: "ability_create", champion: "Z", slot: "Q", fields: { ability_name: "X" } }), /does not match property/],
    ["missing champion", "structural:role_tags", payload({ target: "structural", kind: "role_tags", roles: ["Mage"] }), /no champion/],
    ["empty roles", "structural:role_tags", payload({ target: "structural", kind: "role_tags", champion: "Z", roles: [] }), /no roles/],
    ["blank role entry", "structural:role_tags", payload({ target: "structural", kind: "role_tags", champion: "Z", roles: ["Mage", " "] }), /empty role/],
    ["bad slot", "structural:ability_create", payload({ target: "structural", kind: "ability_create", champion: "Z", slot: "P", fields: { ability_name: "X" } }), /invalid slot/],
    ["no ability_name", "structural:ability_create", payload({ target: "structural", kind: "ability_create", champion: "Z", slot: "Q", fields: { description: "x" } }), /no ability_name/],
    ["unsupported ability field", "structural:ability_create", payload({ target: "structural", kind: "ability_create", champion: "Z", slot: "Q", fields: { ability_name: "X", icon_url: "nope" } }), /unsupported fields: icon_url/],
    ["unsupported identity field", "structural:champion_identity", payload({ target: "structural", kind: "champion_identity", champion: "Z", fields: { lore: "long" } }), /unsupported fields: lore/],
    ["identity with no fields", "structural:champion_identity", payload({ target: "structural", kind: "champion_identity", champion: "Z", fields: {} }), /no supported fields/],
    ["not structural property", "cooldown", payload({ target: "structural", kind: "role_tags", champion: "Z", roles: ["Mage"] }), /not a structural property/],
  ];
  it.each(CASES)("%s", (_label, property, json, reasonRe) => {
    const res = parseStructuralPayload(property, json);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(reasonRe);
  });
});

describe("structuralPlanFrom", () => {
  it("extracts a structural dry-run plan", () => {
    const plan = structuralPlanFrom({
      success: true,
      structural: true,
      dry_run: true,
      plan: { kind: "ability_create", champion: "Zenara", slot: "Q", action: "insert", before: null, fields: { ability_name: "Starfall Lance" } },
    });
    expect(plan?.action).toBe("insert");
    expect(plan?.champion).toBe("Zenara");
  });

  it("returns null for numeric approvals and malformed shapes", () => {
    expect(structuralPlanFrom({ dry_run: true, plan: { old_full_progression: "9/8" } })).toBeNull();
    expect(structuralPlanFrom({ structural: true })).toBeNull();
    expect(structuralPlanFrom(null)).toBeNull();
    expect(structuralPlanFrom("x")).toBeNull();
  });
});
