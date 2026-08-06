/**
 * Contract compatibility tests.
 *
 * The load-bearing rule: the frontend must fall back on VALUES, never on
 * field presence. Production serves a pre-Phase-2 payload until the backend
 * redeploys, and a partially migrated backend may send only some keys — in
 * both cases every missing field must resolve to the behaviour that shipped
 * before, or the UI silently empties out mid-migration.
 */
import { describe, expect, it } from "vitest";

import {
  GRAPH1_FALLBACK_HINTS,
  GRAPH1_TOGGLE_KEYS,
  assertCatalog,
  assertDataset,
  datasetHasWins,
  isGraph1PlayerRole,
  resolveDisplayHints,
  resolveDisplayToggles,
  type VisualizationDataset,
} from "./contract";
import { makeDataset } from "./testFixtures";

/** A Phase 1 payload: no display block, no controls, no role media. */
function legacyDataset(): VisualizationDataset {
  const ds = makeDataset([
    ["player:A", "2020-01-01T10:00:00Z"],
    ["player:B", "2021-01-01T10:00:00Z"],
  ]);
  delete ds.definition.display;
  delete ds.definition.controls;
  return ds;
}

describe("display-toggle resolution", () => {
  it("defaults every toggle on for a payload that omits defaultToggles", () => {
    const toggles = resolveDisplayToggles(legacyDataset());
    for (const key of GRAPH1_TOGGLE_KEYS) {
      expect(toggles[key], key).toBe(true);
    }
  });

  it("winOverlay falls back to whether the data carries wins", () => {
    const ds = legacyDataset();
    for (const event of ds.events) delete event.winsDelta;
    expect(datasetHasWins(ds)).toBe(false);
    expect(resolveDisplayToggles(ds).winOverlay).toBe(false);
  });

  it("honours declared defaults when present", () => {
    const ds = legacyDataset();
    ds.definition.display = {
      contextMode: "latest-entity-context",
      showSecondaryEntityLabel: true,
      defaultToggles: { winOverlay: false, rankNumber: false },
    };
    const toggles = resolveDisplayToggles(ds);
    expect(toggles.winOverlay).toBe(false);
    expect(toggles.rankNumber).toBe(false);
    // keys the backend did not send keep the pre-Phase-2 behaviour
    expect(toggles.eventHeader).toBe(true);
    expect(toggles.secondaryLabel).toBe(true);
  });

  it("a partially migrated payload never empties the UI", () => {
    const ds = legacyDataset();
    ds.definition.display = {
      contextMode: "event-header",
      showSecondaryEntityLabel: false,
      defaultToggles: {},
    };
    const toggles = resolveDisplayToggles(ds);
    expect(Object.values(toggles).every(Boolean)).toBe(true);
  });
});

describe("display hints", () => {
  it("falls back to the Phase 1 hints when display is absent", () => {
    expect(resolveDisplayHints(legacyDataset())).toEqual(GRAPH1_FALLBACK_HINTS);
    expect(GRAPH1_FALLBACK_HINTS.contextMode).toBe("event-header");
    expect(GRAPH1_FALLBACK_HINTS.showSecondaryEntityLabel).toBe(false);
  });

  it("keeps the Phase 1 hint values when defaultToggles is added", () => {
    const ds = legacyDataset();
    ds.definition.display = {
      contextMode: "latest-entity-context",
      showSecondaryEntityLabel: true,
      defaultToggles: { winOverlay: true },
    };
    const hints = resolveDisplayHints(ds);
    expect(hints.contextMode).toBe("latest-entity-context");
    expect(hints.showSecondaryEntityLabel).toBe(true);
  });
});

describe("legacy payload acceptance", () => {
  it("assertDataset accepts a payload with no Phase 2 fields", () => {
    expect(() => assertDataset(legacyDataset())).not.toThrow();
  });

  it("tolerates the trimmed context keys still being present", () => {
    const ds = legacyDataset();
    ds.events[0].context = {
      gameId: "G_1",
      matchId: "G",
      gameNumber: 1,
      playerId: "player:A",
      championId: "champion:Azir",
    };
    expect(() => assertDataset(ds)).not.toThrow();
  });

  it("still rejects a genuinely unusable payload", () => {
    expect(() => assertDataset({ schemaVersion: 2 })).toThrow(
      /unsupported dataset schema/,
    );
    const empty = legacyDataset();
    empty.events = [];
    expect(() => assertDataset(empty)).toThrow(/no events/);
  });
});

describe("role media", () => {
  it("recognises only the five lane positions", () => {
    for (const role of ["Top", "Jungle", "Mid", "Bot", "Support"]) {
      expect(isGraph1PlayerRole(role)).toBe(true);
    }
    for (const other of ["Coach", "Caster", "mid", "", null, undefined, 3]) {
      expect(isGraph1PlayerRole(other)).toBe(false);
    }
  });
});

describe("catalog gate", () => {
  it("accepts a schemaVersion 2 catalog", () => {
    const catalog = assertCatalog({
      schemaVersion: 2,
      datasets: [{ key: "a", title: "A", rankedEntityType: "champion" }],
    });
    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.datasets).toHaveLength(1);
  });

  it("accepts a schemaVersion 1 catalog unchanged", () => {
    const catalog = assertCatalog({
      schemaVersion: 1,
      datasets: [
        { key: "faker-champions", title: "F", rankedEntityType: "champion" },
      ],
    });
    expect(catalog.datasets[0].key).toBe("faker-champions");
    expect(catalog.datasets[0].controls).toBeUndefined();
  });

  it("drops malformed entries instead of failing the whole catalog", () => {
    const catalog = assertCatalog({
      schemaVersion: 2,
      datasets: [
        { key: "good", title: "G", rankedEntityType: "player" },
        null,
        { title: "no key" },
        { key: "" },
      ],
    });
    expect(catalog.datasets.map((d) => d.key)).toEqual(["good"]);
  });

  it("throws only when the catalog itself is unusable", () => {
    expect(() => assertCatalog(null)).toThrow(/malformed dataset catalog/);
    expect(() => assertCatalog({ datasets: "nope" })).toThrow(
      /malformed dataset catalog/,
    );
  });
});
