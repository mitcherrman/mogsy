/**
 * Dev-only deterministic matchup override.
 *
 * The safety property under test is the one that matters most: this must be
 * INERT unless explicitly activated, and it must never be able to introduce an
 * entity that ordinary play could not also produce.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORCE_PAIR_PARAM, narrowPoolToForcedPair, parseForcedPair } from "./devForcedPair";

/** import.meta.env.DEV is true under vitest; flip it to simulate a prod build. */
function withProdBuild(fn: () => void) {
  vi.stubEnv("DEV", false);
  try {
    fn();
  } finally {
    vi.unstubAllEnvs();
  }
}

afterEach(() => vi.unstubAllEnvs());

describe("parseForcedPair — activation", () => {
  it("is inert when the parameter is absent", () => {
    expect(parseForcedPair("")).toBeNull();
    expect(parseForcedPair("foo=bar")).toBeNull();
  });

  it("parses two entities and trims whitespace", () => {
    expect(parseForcedPair(`${FORCE_PAIR_PARAM}=Ezreal,Vi`)).toEqual(["Ezreal", "Vi"]);
    expect(parseForcedPair(`${FORCE_PAIR_PARAM}=%20Ezreal%20,%20Vi%20`)).toEqual(["Ezreal", "Vi"]);
  });

  it("survives other query parameters", () => {
    expect(parseForcedPair(`a=1&${FORCE_PAIR_PARAM}=Ezreal,Vi&b=2`)).toEqual(["Ezreal", "Vi"]);
  });

  it("rejects anything that is not exactly two distinct entities", () => {
    for (const bad of ["Ezreal", "Ezreal,Vi,Jinx", "Ezreal,Ezreal", ",", "Ezreal,", ""]) {
      expect(parseForcedPair(`${FORCE_PAIR_PARAM}=${encodeURIComponent(bad)}`)).toBeNull();
    }
  });
});

describe("parseForcedPair — production safety", () => {
  it("returns null in a production build even with the parameter present", () => {
    // The real guarantee is stronger than this: `import.meta.env.DEV` is a
    // static false in `vite build`, so Vite dead-code-eliminates the branch out
    // of the bundle entirely. This asserts the runtime behaviour that backs it.
    withProdBuild(() => {
      expect(parseForcedPair(`${FORCE_PAIR_PARAM}=Ezreal,Vi`)).toBeNull();
    });
  });
});

describe("narrowPoolToForcedPair", () => {
  const champions = ["Ahri", "Ezreal", "Garen", "Vi", "Zed"];
  const id = (n: string) => n;

  it("narrows the pool to exactly the forced pair", () => {
    const pool = narrowPoolToForcedPair(champions, ["Ezreal", "Vi"], id);
    expect(pool).toEqual(["Ezreal", "Vi"]);
  });

  it("returns null when the override is inactive, so callers fall back to random", () => {
    expect(narrowPoolToForcedPair(champions, null, id)).toBeNull();
  });

  it("REFUSES a pair that is not fully in the real pool", () => {
    // The safety property: the override can only ever surface entities the game
    // could already deal, so it cannot write junk rows into Supabase.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(narrowPoolToForcedPair(champions, ["Ezreal", "NotAChampion"], id)).toBeNull();
    expect(narrowPoolToForcedPair(champions, ["Nope", "AlsoNope"], id)).toBeNull();
  });

  it("works for object pools via the id accessor", () => {
    const items = [
      { item_name: "Boots", cost: 300 },
      { item_name: "Long Sword", cost: 350 },
      { item_name: "Infinity Edge", cost: 3450 },
    ];
    const pool = narrowPoolToForcedPair(items, ["Boots", "Infinity Edge"], (i) => i.item_name);
    expect(pool?.map((i) => i.item_name)).toEqual(["Boots", "Infinity Edge"]);
  });
});

describe("the narrowed pool yields exactly the forced pair through the real builder", () => {
  it("makeOpinionMatchup on a 2-entity pool always returns both, in some order", async () => {
    // This is why no new selection logic was written: the existing builder's
    // pickTwo() over a 2-element pool is already deterministic in membership.
    const { makeOpinionMatchup } = await import("./api");
    const game = {
      slug: "favorite-champion",
      title: "Favorite Champion",
      prompt: "Which champion do you like more?",
      mode: "opinion" as const,
      entityType: "champion" as const,
      description: "",
      artChampion: "Ahri",
    };
    for (let i = 0; i < 50; i++) {
      const m = makeOpinionMatchup(game, ["Ezreal", "Vi"]);
      expect([m.left.id, m.right.id].sort()).toEqual(["Ezreal", "Vi"]);
      expect(m.left.id).not.toBe(m.right.id);
    }
  });
});
