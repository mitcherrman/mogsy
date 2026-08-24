/**
 * RG2 — the frontend's category keys are the backend's, and there is only one
 * table of them.
 *
 * The taxonomy is split across two languages on purpose: Python classifies
 * (it can see the family contract, the pool specs and the seeding scripts),
 * TypeScript draws (it can see the lobby tiles and the asset-host rule). A
 * split like that is only safe while the KEYS agree, and nothing but a test
 * can hold two languages to one vocabulary — so this file reads the Python
 * source and compares.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CATEGORY_ART,
  DIFFICULTY_TIERS,
  GENERAL_CATEGORY,
  META_REFLEX_CATEGORY,
  PUBLIC_CATEGORY_KEYS,
  asCategoryKey,
  asDifficultyTier,
  categoryLabel,
  legacyCategoryKey,
  type CategoryKey,
} from "./publicCategory";
import { QUIZ_CATEGORY_ICONS } from "@/components/quiz/QuizCategoryStrip";

/**
 * The Python authority, when this checkout sits beside the backend.
 *
 * Skipped rather than failed when it does not: a frontend-only clone is a
 * legitimate way to work on this repo, and a test that cannot see the other
 * side of a contract should say so instead of inventing a verdict.
 */
const PY = [
  // Explicit override, for a worktree pair whose two halves are not siblings.
  process.env.RG2_BACKEND_ROOT
    ? `${process.env.RG2_BACKEND_ROOT}/quiz/public_category.py` : "",
  // The ordinary side-by-side clone layout.
  "../League_Combat_Simulator/quiz/public_category.py",
  "../../League_Combat_Simulator/quiz/public_category.py",
].filter(Boolean).map((p) => resolve(process.cwd(), p)).find(existsSync);

describe("the keys match the backend", () => {
  it.runIf(PY)("declares exactly the categories Python declares", () => {
    const source = readFileSync(PY!, "utf8");
    // The constant NAMES listed in `PUBLIC_CATEGORIES`, resolved to their
    // string values. Reading both halves means a key renamed in one place and
    // not the other fails here rather than shipping.
    const listed = [...(/PUBLIC_CATEGORIES:[^=]*=\s*\(([\s\S]*?)\n\)/
      .exec(source)![1].matchAll(/\(\s*([A-Z_]+),/g))].map((m) => m[1]);
    const values = new Map([...source.matchAll(/^([A-Z_]+) = "([a-z-]+)"$/gm)]
      .map(([, name, value]) => [name, value]));
    const keys = listed.map((name) => values.get(name));
    expect(keys).toEqual([...PUBLIC_CATEGORY_KEYS]);
  });

  it.runIf(PY)("agrees on the four difficulty tiers", () => {
    const source = readFileSync(PY!, "utf8");
    const tiers = /PUBLIC_DIFFICULTIES:[^=]*=\s*\(([^)]*)\)/.exec(source)![1];
    expect([...tiers.matchAll(/[A-Z]+/g)].map((m) => m[0].toLowerCase()))
      .toEqual([...DIFFICULTY_TIERS]);
  });

  it.runIf(PY)("agrees on the module key and the fallback", () => {
    const source = readFileSync(PY!, "utf8");
    expect(source).toContain(`META_REFLEX = "${META_REFLEX_CATEGORY}"`);
    expect(source).toContain(`GENERAL = "${GENERAL_CATEGORY}"`);
  });
});

describe("art", () => {
  it("reuses the lobby's tiles rather than restating them", () => {
    // The six lobby ids ARE public category keys, and their art is read from
    // the strip — a tile swapped on the hub changes every timeline with it.
    for (const tile of QUIZ_CATEGORY_ICONS) {
      expect(PUBLIC_CATEGORY_KEYS as readonly string[]).toContain(tile.id);
      expect(CATEGORY_ART[tile.id as CategoryKey].iconPath).toBe(tile.iconPath);
    }
  });

  it("gives every key a picture or a drawn mark and a label", () => {
    for (const key of Object.keys(CATEGORY_ART) as CategoryKey[]) {
      const art = CATEGORY_ART[key];
      expect(Boolean(art.iconPath || art.glyph), key).toBe(true);
      expect(categoryLabel(key), key).toBeTruthy();
    }
  });
});

describe("reading a key", () => {
  it("passes through what it knows", () => {
    for (const key of PUBLIC_CATEGORY_KEYS) expect(asCategoryKey(key)).toBe(key);
    expect(asCategoryKey(META_REFLEX_CATEGORY)).toBe(META_REFLEX_CATEGORY);
  });

  it("degrades anything else to the neutral fallback", () => {
    for (const value of [null, undefined, 4, "", "Objectives", "esports"]) {
      expect(asCategoryKey(value)).toBe(GENERAL_CATEGORY);
    }
  });

  it("never invents a difficulty", () => {
    for (const value of [null, undefined, "", "trivial", 2, "EASY"]) {
      expect(asDifficultyTier(value)).toBeNull();
    }
    for (const tier of DIFFICULTY_TIERS) expect(asDifficultyTier(tier)).toBe(tier);
  });
});

describe("the deploy-skew bridge", () => {
  it("keeps a pre-RG2 record legible", () => {
    expect(legacyCategoryKey("Item Costs")).toBe("itemization");
    expect(legacyCategoryKey("item_costs")).toBe("itemization");
    expect(legacyCategoryKey("Champion Ability Cooldowns")).toBe("abilities");
    // The generator slugs, which are a whole vocabulary of their own.
    expect(legacyCategoryKey("purchase_history_total")).toBe("itemization");
    expect(legacyCategoryKey("post_mitigation_damage")).toBe("scenarios");
  });

  it("classifies each environment_mechanic subset by its own row", () => {
    // The family spans turret plates, minion waves and death timers, and the
    // generator files each into a different stored category. The bridge reads
    // that string, so a pre-RG2 record classifies them apart too — and a
    // turret-plate row never prints the caster minion.
    expect(legacyCategoryKey("Objectives")).toBe("objectives");
    expect(legacyCategoryKey("Minion Waves")).toBe("wave-management");
    expect(legacyCategoryKey("Game Fundamentals")).toBe("fundamentals");
    for (const nonWave of ["Objectives", "Game Fundamentals"]) {
      expect(legacyCategoryKey(nonWave)).not.toBe("wave-management");
    }
  });

  it("answers general rather than guessing a neighbour", () => {
    expect(legacyCategoryKey("Patch History")).toBe(GENERAL_CATEGORY);
    expect(legacyCategoryKey(null)).toBe(GENERAL_CATEGORY);
    expect(legacyCategoryKey("")).toBe(GENERAL_CATEGORY);
  });
});
