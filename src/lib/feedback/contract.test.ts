import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ENTRY_INTENT_LABELS,
  ENTRY_INTENT_TO_TYPE,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CLIENT_META_KEYS,
  FEEDBACK_ENTRY_INTENTS,
  FEEDBACK_REPRODUCIBILITIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_TYPES,
  categoryForRoute,
} from "./contract";

/**
 * Keeps src/lib/feedback/contract.ts and the FB1 migration from drifting apart.
 * The database is authoritative for every union here — a value the CHECK
 * constraints reject is a value the form must never offer.
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Every .sql in migration order. A constraint's authority is the LAST
 * migration that defines it, not the first: FB1-4 widens
 * feedback_entry_intent_check in its own file, and pinning this test to the
 * foundation migration would make it assert a vocabulary the database no
 * longer has. Same reasoning the category assertion below already used.
 */
const MIGRATIONS: string[] = readdirSync(MIGRATIONS_DIR)
  .filter(file => file.endsWith(".sql"))
  .sort()
  .map(file => readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

/**
 * The category list is seeded, not CHECK-constrained, so the authority is the
 * LAST migration that writes app_settings.feedback_config -> categories. FB1
 * seeded it; a later migration may re-seed it (Time Trial). Reading the newest
 * seed is what keeps this assertion honest as the taxonomy grows, without
 * editing an already-applied migration.
 */
function latestSeededCategories(): string[] {
  const seeds: Array<[string, string]> = [];
  for (const file of readdirSync(MIGRATIONS_DIR).sort()) {
    if (!file.endsWith(".sql")) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    if (!sql.includes("'{categories}'")) continue;
    const seeded = sql.match(/'(\["General".*?\])'::jsonb/);
    if (seeded) seeds.push([file, seeded[1]]);
  }
  expect(seeds.length, "no migration seeds feedback_config categories").toBeGreaterThan(0);
  return JSON.parse(seeds[seeds.length - 1][1]);
}

/**
 * The value list inside a named CHECK constraint, e.g. ('bug', 'feature'),
 * taken from the newest migration that adds it.
 */
function checkValues(constraint: string): string[] {
  const re = new RegExp(`ADD CONSTRAINT ${constraint}\\s*\\n?\\s*CHECK \\(([\\s\\S]*?)\\),?\\n`);
  let latest: string | null = null;
  for (const sql of MIGRATIONS) {
    const body = sql.match(re);
    if (body) latest = body[1];
  }
  expect(latest, `constraint ${constraint} not found in any migration`).not.toBeNull();
  return [...latest!.matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe("feedback contract mirrors the database CHECK constraints", () => {
  it("entry intents match feedback_entry_intent_check", () => {
    expect(checkValues("feedback_entry_intent_check").sort()).toEqual(
      [...FEEDBACK_ENTRY_INTENTS].sort(),
    );
  });

  it("types match feedback_type_check", () => {
    expect(checkValues("feedback_type_check").sort()).toEqual([...FEEDBACK_TYPES].sort());
  });

  it("severities match feedback_severity_check", () => {
    expect(checkValues("feedback_severity_check").sort()).toEqual([...FEEDBACK_SEVERITIES].sort());
  });

  it("reproducibilities match feedback_reproducibility_check", () => {
    expect(checkValues("feedback_reproducibility_check").sort()).toEqual(
      [...FEEDBACK_REPRODUCIBILITIES].sort(),
    );
  });

  it("categories match the newest taxonomy seeded into app_settings.feedback_config", () => {
    expect(latestSeededCategories()).toEqual([...FEEDBACK_CATEGORIES]);
  });
});

/**
 * The `CASE NEW.entry_intent WHEN ... THEN ... ELSE ... END` arms of the
 * newest normalize_feedback_submission(), as an intent -> type map. Reading
 * the SQL rather than restating it is what makes the assertion below a
 * mirror test instead of a duplicate of contract.ts.
 */
function normalizeTriggerMapping(): Record<string, string> {
  let latest: string | null = null;
  for (const sql of MIGRATIONS) {
    if (sql.includes("FUNCTION public.normalize_feedback_submission()")) latest = sql;
  }
  expect(latest, "no migration defines normalize_feedback_submission()").not.toBeNull();

  const body = latest!.match(/NEW\.type := CASE NEW\.entry_intent([\s\S]*?)END;/);
  expect(body, "type-derivation CASE not found").not.toBeNull();

  const mapping: Record<string, string> = {};
  for (const arm of body![1].matchAll(/WHEN\s+'([^']+)'\s+THEN\s+'([^']+)'/g)) {
    mapping[arm[1]] = arm[2];
  }
  const fallback = body![1].match(/ELSE\s+'([^']+)'/);
  expect(fallback, "type-derivation CASE has no ELSE").not.toBeNull();

  // Every intent the CHECK allows, resolved the way the trigger would.
  const resolved: Record<string, string> = {};
  for (const intent of checkValues("feedback_entry_intent_check")) {
    resolved[intent] = mapping[intent] ?? fallback![1];
  }
  return resolved;
}

describe("entry intent to type mapping", () => {
  it("mirrors normalize_feedback_submission()", () => {
    expect(ENTRY_INTENT_TO_TYPE).toEqual(normalizeTriggerMapping());
  });

  it("keeps more user-facing doors than triage workflows", () => {
    // The point of the split: collapsing at the UI would lose which door the
    // user walked through. FB1-4 added two in-product doors, so the ratio is
    // six to three; what matters is that it is never one to one.
    expect(FEEDBACK_ENTRY_INTENTS.length).toBeGreaterThan(
      new Set(Object.values(ENTRY_INTENT_TO_TYPE)).size,
    );
    expect(new Set(Object.values(ENTRY_INTENT_TO_TYPE)).size).toBe(3);
  });

  it("labels every entry intent", () => {
    for (const intent of FEEDBACK_ENTRY_INTENTS) {
      expect(ENTRY_INTENT_LABELS[intent]).toBeTruthy();
    }
  });

  it("maps every intent to a legal type", () => {
    for (const intent of FEEDBACK_ENTRY_INTENTS) {
      expect(FEEDBACK_TYPES).toContain(ENTRY_INTENT_TO_TYPE[intent]);
    }
  });
});

describe("categoryForRoute", () => {
  it("resolves each Academy mode to its product area", () => {
    expect(categoryForRoute("/quiz/daily-challenge")).toBe("Daily Challenge");
    expect(categoryForRoute("/quiz/daily")).toBe("Time Trial");
    expect(categoryForRoute("/quiz/ranked")).toBe("Ranked");
    expect(categoryForRoute("/quiz/stat-check")).toBe("Stat Check");
    expect(categoryForRoute("/quiz/mastery")).toBe("Mastery");
    expect(categoryForRoute("/combat-lab")).toBe("Combat Lab");
    expect(categoryForRoute("/lol/patch-reports")).toBe("Patch Reports");
    expect(categoryForRoute("/lol/docs/champions/ahri")).toBe("Mogzy Archives");
  });

  it("prefers the longest matching prefix over /quiz", () => {
    // /quiz/ranked must not be swallowed by the /quiz -> Leaguecraft entry.
    expect(categoryForRoute("/quiz")).toBe("Leaguecraft");
    expect(categoryForRoute("/quiz/ranked/anything")).toBe("Ranked");
  });

  it("keeps Daily Challenge and Time Trial apart", () => {
    // The two daily surfaces share a prefix. /quiz/daily-challenge is DC2;
    // /quiz/daily is the Time Trial score attack. Neither may swallow the
    // other, at the route root or any deeper path.
    expect(categoryForRoute("/quiz/daily-challenge")).toBe("Daily Challenge");
    expect(categoryForRoute("/quiz/daily-challenge/anything")).toBe("Daily Challenge");
    expect(categoryForRoute("/quiz/daily")).toBe("Time Trial");
    expect(categoryForRoute("/quiz/daily/anything")).toBe("Time Trial");
    // No route resolves to the old, merged meaning.
    expect(categoryForRoute("/quiz/daily")).not.toBe("Daily Challenge");
  });

  it("leaves every other product area exactly where FB1 put it", () => {
    for (const [path, category] of [
      ["/quiz", "Leaguecraft"],
      ["/quiz/ranked", "Ranked"],
      ["/quiz/stat-check", "Stat Check"],
      ["/quiz/mastery", "Mastery"],
      ["/combat-lab", "Combat Lab"],
      ["/lol/patch-reports", "Patch Reports"],
      ["/lol/history", "Quiz History"],
      ["/lol/missed-questions", "Quiz History"],
      ["/lol/docs", "Mogzy Archives"],
      ["/profile", "Account & Profile"],
      ["/settings", "Account & Profile"],
      ["/auth", "Account & Profile"],
      ["/", "General"],
    ] as const) {
      expect(categoryForRoute(path)).toBe(category);
    }
  });

  it("falls back to General for unknown and root routes", () => {
    expect(categoryForRoute("/")).toBe("General");
    expect(categoryForRoute("/lol")).toBe("General");
    expect(categoryForRoute("/nonsense")).toBe("General");
  });

  it("only ever returns a category the database will accept", () => {
    for (const path of ["/", "/quiz", "/quiz/ranked", "/combat-lab", "/profile", "/xyz"]) {
      expect(FEEDBACK_CATEGORIES).toContain(categoryForRoute(path));
    }
  });
});

describe("taxonomy is audited against the shipped product", () => {
  it("excludes destinations that do not exist on main", () => {
    // Meta Reflex is not a hub destination — it lives inside Leaguecraft, and
    // the League Swipe subsection is behind SHOW_SWIPE_GAMES = false.
    // /lol/mechanics (MECH1 5B1) has not landed on main.
    expect(FEEDBACK_CATEGORIES).not.toContain("Meta Reflex");
    expect(FEEDBACK_CATEGORIES).not.toContain("Mechanics Explorer");
    // A dimension, not a product area: a mobile bug in Ranked is a Ranked bug.
    expect(FEEDBACK_CATEGORIES).not.toContain("Mobile/UI");
  });

  it("carries no legacy Mogsy modes", () => {
    for (const dead of ["Swipe", "Shop", "Aura Check", "Multiplayer", "Leaderboard", "Play"]) {
      expect(FEEDBACK_CATEGORIES).not.toContain(dead);
    }
  });

  it("has no duplicates", () => {
    expect(new Set(FEEDBACK_CATEGORIES).size).toBe(FEEDBACK_CATEGORIES.length);
  });
});

describe("client diagnostics are allow-listed", () => {
  it("collects only browser/build facts, never identity or location", () => {
    expect([...FEEDBACK_CLIENT_META_KEYS].sort()).toEqual(["app_version", "ua", "viewport"]);
    for (const forbidden of ["ip", "email", "user_id", "geo", "location", "session"]) {
      expect(FEEDBACK_CLIENT_META_KEYS as readonly string[]).not.toContain(forbidden);
    }
  });
});
