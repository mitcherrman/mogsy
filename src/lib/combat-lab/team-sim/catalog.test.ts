/**
 * Catalog contract: the vocabulary this UI is allowed to offer.
 *
 * Asserted against the REAL Phase 4A payload, so a backend section rename or
 * a pricing change breaks these tests instead of silently producing selectors
 * the simulation endpoint rejects.
 */
import { describe, expect, it } from "vitest";

import {
  assertTeamSimCatalog,
  championActionNames,
  championActions,
  creditCostFor,
  indexCatalog,
  MalformedCatalogError,
  pricedTeamShapes,
  rankBoundsFor,
  targetingPolicyInfo,
} from "./catalog";
import { REAL_CATALOG } from "./__fixtures__";

describe("assertTeamSimCatalog", () => {
  it("accepts the real Phase 4A payload", () => {
    expect(() => assertTeamSimCatalog(REAL_CATALOG)).not.toThrow();
  });

  it.each([
    ["catalog_digest", { ...REAL_CATALOG, catalog_digest: "" }],
    ["champions", { ...REAL_CATALOG, champions: [] }],
    ["items.supported", { ...REAL_CATALOG, items: {} }],
    ["runes.supported", { ...REAL_CATALOG, runes: {} }],
    ["pricing.costs", { ...REAL_CATALOG, pricing: { unit: "x", costs: [] } }],
    ["team_limits.max_team_size", { ...REAL_CATALOG, team_limits: {} }],
    // Every entry below used to pass validation and then break the editor
    // rather than showing the malformed-catalog card.
    [
      "ability_rules.defaults",
      { ...REAL_CATALOG, ability_rules: { ...REAL_CATALOG.ability_rules, defaults: undefined } },
    ],
    [
      "build_options.max_items_per_combatant",
      {
        ...REAL_CATALOG,
        build_options: { ...REAL_CATALOG.build_options, max_items_per_combatant: undefined },
      },
    ],
    [
      "build_options.max_runes_per_combatant",
      {
        ...REAL_CATALOG,
        build_options: { ...REAL_CATALOG.build_options, max_runes_per_combatant: undefined },
      },
    ],
    [
      "action_plan_options.max_steps_per_plan",
      {
        ...REAL_CATALOG,
        action_plan_options: {
          ...REAL_CATALOG.action_plan_options,
          max_steps_per_plan: undefined,
        },
      },
    ],
    // `createDraft` dereferences .default during render, and the route has no
    // error boundary — this used to be a blank page.
    ["scheduler_limits.max_duration", { ...REAL_CATALOG, scheduler_limits: {} }],
    [
      "scheduler_limits.max_events",
      {
        ...REAL_CATALOG,
        scheduler_limits: { ...REAL_CATALOG.scheduler_limits, max_events: {} },
      },
    ],
    [
      "pricing.costs[]",
      { ...REAL_CATALOG, pricing: { ...REAL_CATALOG.pricing, costs: [{ credits: 1 }] } },
    ],
  ])("rejects a catalog missing %s", (field, body) => {
    expect(() => assertTeamSimCatalog(body)).toThrow(MalformedCatalogError);
    try {
      assertTeamSimCatalog(body);
    } catch (error) {
      expect((error as MalformedCatalogError).field).toBe(field);
    }
  });

  it("rejects a non-object body", () => {
    expect(() => assertTeamSimCatalog(null)).toThrow(MalformedCatalogError);
    expect(() => assertTeamSimCatalog([1, 2])).toThrow(MalformedCatalogError);
  });

  it("rejects a champion entry without an actions array", () => {
    const broken = {
      ...REAL_CATALOG,
      champions: [{ name: "Ashe", basic_attack: true, generic_slot_actions: [] }],
    };
    expect(() => assertTeamSimCatalog(broken)).toThrow(/actions/);
  });
});

describe("indexCatalog", () => {
  const index = indexCatalog(REAL_CATALOG);

  it("indexes every champion the backend published", () => {
    expect(index.championNames.length).toBe(REAL_CATALOG.champions.length);
    expect(index.championNames.length).toBeGreaterThan(100);
    expect(index.championByName.get("Ashe")?.name).toBe("Ashe");
  });

  it("builds item and rune selectors from the SUPPORTED lists only", () => {
    expect(index.supportedItems.length).toBe(REAL_CATALOG.items.supported.length);
    for (const item of index.supportedItems) expect(item.status).toBe("supported");
    for (const name of index.unsupportedItems.map((i) => i.name)) {
      expect(index.supportedItemNames.has(name)).toBe(false);
    }
    for (const rune of index.unsupportedRunes) {
      expect(index.supportedRuneNames.has(rune.name)).toBe(false);
      expect(rune.reason).toBeTruthy();
    }
  });

  it("keeps the four described-but-inert runes out of the supported set", () => {
    const inert = index.unsupportedRunes.map((r) => r.name);
    expect(inert).toEqual(
      expect.arrayContaining([
        "Glacial Augment",
        "Phase Rush",
        "Treasure Hunter",
        "Unsealed Spellbook",
      ])
    );
  });

  it("takes bounds from the catalog, never from local constants", () => {
    expect(index.maxItems).toBe(REAL_CATALOG.build_options.max_items_per_combatant);
    expect(index.maxRunes).toBe(REAL_CATALOG.build_options.max_runes_per_combatant);
    expect(index.maxTeamSize).toBe(REAL_CATALOG.team_limits.max_team_size);
    expect(index.maxPlanSteps).toBe(REAL_CATALOG.action_plan_options.max_steps_per_plan);
    expect(index.critModes).toEqual(REAL_CATALOG.build_options.crit_modes);
  });

  it("exposes the four catalog targeting policies", () => {
    expect(index.targetingPolicies.sort()).toEqual(
      ["first_living", "fixed", "lowest_hp", "lowest_hp_pct"].sort()
    );
    expect(targetingPolicyInfo(index, "fixed")?.requires_priority).toBe(true);
    expect(targetingPolicyInfo(index, "lowest_hp")?.requires_priority).toBe(false);
  });

  it("bounds ability ranks exactly as the backend does (R is 1..3)", () => {
    expect(rankBoundsFor(index, "Q")).toEqual({ min: 1, max: 5 });
    expect(rankBoundsFor(index, "R")).toEqual({ min: 1, max: 3 });
    expect(index.rankedSlots).toEqual(["E", "Q", "R", "W"]);
  });

  it("memoizes the index per catalog instance", () => {
    expect(indexCatalog(REAL_CATALOG)).toBe(index);
  });
});

describe("champion actions", () => {
  const index = indexCatalog(REAL_CATALOG);

  it("advertises champion-specific actions only where the backend does", () => {
    const withActions = REAL_CATALOG.champions.filter((c) => c.actions.length > 0);
    expect(withActions.length).toBeGreaterThan(0);
    const sample = withActions[0];
    expect(championActions(index, sample.name)).toEqual(sample.actions);
    expect(championActionNames(index, sample.name).has(sample.actions[0].active_name)).toBe(
      true
    );
  });

  it("reports an empty action set for champions the dispatcher does not cover", () => {
    // Lux is served by basic attack + generic slot casts only.
    expect(championActions(index, "Lux")).toEqual([]);
    expect(index.genericSlots).toEqual(["P", "Q", "W", "E", "R"]);
  });
});

describe("credit cost matrix", () => {
  const index = indexCatalog(REAL_CATALOG);

  it("prices every supported shape from the catalog table", () => {
    expect(creditCostFor(index, 1, 1)).toBe(1);
    expect(creditCostFor(index, 1, 2)).toBe(2);
    expect(creditCostFor(index, 2, 1)).toBe(2);
    expect(creditCostFor(index, 2, 2)).toBe(3);
  });

  it("returns null (never a guess) for an unpriced shape", () => {
    expect(creditCostFor(index, 3, 3)).toBeNull();
  });

  it("lists shapes in deterministic (a, b) order", () => {
    expect(pricedTeamShapes(index).map((s) => `${s.a}v${s.b}`)).toEqual([
      "1v1",
      "1v2",
      "2v1",
      "2v2",
    ]);
  });
});

/**
 * Phase 4C catalog additions. Both blocks exist so the UI stops mirroring
 * backend constants; these assertions are what make "mirroring" impossible to
 * reintroduce quietly.
 */
describe("Phase 4C catalog contract", () => {
  const index = indexCatalog(REAL_CATALOG);

  it("publishes champion level bounds the editor can consume", () => {
    expect(index.levelBounds).toEqual(REAL_CATALOG.build_options.level);
    expect(index.levelBounds.min).toBe(1);
    expect(index.levelBounds.max).toBe(18);
    expect(index.levelBounds.default).toBeGreaterThanOrEqual(index.levelBounds.min);
    expect(index.levelBounds.default).toBeLessThanOrEqual(index.levelBounds.max);
  });

  it("rejects a catalog with no level bounds instead of falling back", () => {
    // A fallback would be the mirrored `1..18` literal this field removes, and
    // it would be invisible the day it disagreed with the backend.
    const stripped = {
      ...REAL_CATALOG,
      build_options: { ...REAL_CATALOG.build_options, level: undefined },
    };
    expect(() => assertTeamSimCatalog(stripped)).toThrow(MalformedCatalogError);
  });

  it("publishes the billing and recovery contract", () => {
    expect(index.billing.idempotency_required).toBe(true);
    expect(index.billing.idempotency_header).toBe("Idempotency-Key");
    expect(index.billing.idempotency_replayed_header).toBe("Idempotency-Replayed");
    expect(index.billing.replay_charges).toBe(0);
    expect(index.billing.conflict_code).toBe("idempotency_conflict");
    expect(index.billing.in_progress_code).toBe("idempotency_in_progress");
    expect(index.billing.charged_only_on_success).toBe(
      REAL_CATALOG.pricing.charged_only_on_success
    );
  });

  it("rejects a catalog whose header names disagree with this client", () => {
    // The dangerous version of this drift: the backend renames the header, the
    // client keeps sending the old one, every request is un-deduplicated, and
    // the UI still says idempotency is on.
    const renamed = {
      ...REAL_CATALOG,
      billing: { ...REAL_CATALOG.billing, idempotency_header: "X-Request-Id" },
    };
    expect(() => assertTeamSimCatalog(renamed)).toThrow(MalformedCatalogError);
  });

  it("rejects a catalog with no billing block at all", () => {
    const { billing, ...withoutBilling } = REAL_CATALOG;
    expect(() => assertTeamSimCatalog(withoutBilling)).toThrow(MalformedCatalogError);
  });

  it("declares client-retry idempotency in execution_assumptions", () => {
    expect(REAL_CATALOG.execution_assumptions.client_retry_idempotency).toBe(true);
  });
});
