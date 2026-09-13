/**
 * TUT1 — the scripted Ranked tutorial is retired.
 *
 * This file is the standing proof of the removal, written as source-level
 * boundaries rather than as one screen's behaviour, because the thing being
 * protected is an ABSENCE: no gate, no route, no replay entry, no state read,
 * and no surface still teaching the retired HP/damage combat model.
 *
 * What it deliberately does NOT assert:
 *  - that `profiles.ranked_tutorial_completed_at` / `ranked_tutorial_version`
 *    are gone from the database. They are left DORMANT on purpose (see
 *    docs/TUT1_RANKED_TUTORIAL_REMOVAL_HANDOFF.md) — dropping columns is a
 *    migration this removal does not need. What IS asserted is that no
 *    application code reads or writes them any more, which is what makes any
 *    account's old completion state irrelevant to Ranked access;
 *  - anything about Tutorial TIPS (`tutorial_tips`, `TutorialTipPopup`,
 *    `AdminTutorialTips`). That is a different feature — admin-authored
 *    contextual coach-marks — and was never part of this workstream.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every source file except this one, the generated Supabase types, and tests. */
const PRODUCTION_FILES = sourceFiles(ROOT).filter(
  (f) =>
    !/\.test\.(ts|tsx)$/.test(f) &&
    !f.endsWith(join("integrations", "supabase", "types.ts")) &&
    !f.endsWith("App.tutorialRemoval.test.ts"),
);

const rel = (f: string) => f.slice(ROOT.length + 1);

describe("the tutorial implementation is gone", () => {
  it("ships none of its modules", () => {
    const present = PRODUCTION_FILES.map(rel).filter((f) =>
      /ranked-tutorial|RequireRankedTutorial|useRankedTutorialStatus|LeaguecraftTutorialLink|LolWelcomeIntro/.test(f),
    );
    expect(present).toEqual([]);
  });

  it("names no tutorial state machine, step table or fixture anywhere", () => {
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      for (const symbol of [
        "tutorialMachine", "tutorialSteps", "tutorialArenaView",
        "TutorialStepId", "TutorialCompletePanel", "TutorialProgress",
        "resolveTutorialRun", "evaluateRankedTutorial",
      ]) {
        expect(src, `${rel(file)} still references ${symbol}`).not.toContain(symbol);
      }
    }
  });
});

describe("old tutorial-completion state is irrelevant to Ranked access", () => {
  it("no application code reads or writes the dormant profile columns", () => {
    // The columns stay in the database and in the generated types; nothing
    // may consult them, so an account that never completed the tutorial and
    // one that did are indistinguishable to every route.
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `${rel(file)} still reads a tutorial completion column`)
        .not.toContain("ranked_tutorial_completed_at");
      expect(src, `${rel(file)} still reads a tutorial version column`)
        .not.toContain("ranked_tutorial_version");
    }
  });

  it("the generated Supabase types still carry them, dormant and untouched", () => {
    // Proof the removal did NOT quietly drop columns: the schema is unchanged,
    // it simply has no reader.
    const types = read(join("integrations", "supabase", "types.ts"));
    expect(types).toContain("ranked_tutorial_completed_at");
    expect(types).toContain("ranked_tutorial_version");
  });

  it("keeps no tutorial key in browser storage logic", () => {
    for (const file of PRODUCTION_FILES) {
      expect(readFileSync(file, "utf8"), `${rel(file)} still writes a tutorial storage key`)
        .not.toContain("tutorial_popup_dismissed");
    }
  });
});

describe("no user-facing entry point survives", () => {
  it("no production surface links to a tutorial route", () => {
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      if (rel(file) === "App.tsx") continue; // the redirects themselves
      expect(src, `${rel(file)} still links to /quiz/tutorial`)
        .not.toContain("/quiz/tutorial");
      expect(src, `${rel(file)} still links to the onboarding tutorial`)
        .not.toContain("/onboarding/ranked-tutorial");
    }
  });

  it("the admin replay entry is gone", () => {
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `${rel(file)} still offers an admin replay`)
        .not.toContain("adminReplay");
      expect(src, `${rel(file)} still offers an admin replay`)
        .not.toContain("ADMIN_TUTORIAL_REPLAY_ROUTE");
    }
  });

  it("the global tutorial policy switches are gone from the policy layer", () => {
    const policy = read(join("lib", "platform-policy", "policy.ts"));
    expect(policy).not.toContain("tutorial_auto_popup_enabled");
    expect(policy).not.toContain("tutorial_completion_required_for_new_users");
    expect(policy).not.toContain("evaluateTutorialPresentation");
  });
});

describe("the retired combat-scoring lesson cannot render", () => {
  /**
   * Ranked is points-based. The tutorial taught HP, damage, knockout, XP and
   * ability unlocks — the retired model — and its copy is the one thing that
   * would be actively WRONG if any of it survived on a live surface.
   */
  const RETIRED_COPY = [
    "Correct answers deal damage",
    "Zero HP ends the match",
    "zero HP",
    "Training Golem",
    "XP unlocks abilities",
  ];

  it("no production file carries the retired tutorial copy", () => {
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      for (const phrase of RETIRED_COPY) {
        expect(src, `${rel(file)} still says "${phrase}"`).not.toContain(phrase);
      }
    }
  });
});

describe("what was deliberately preserved", () => {
  it("keeps the shared arena and its primitives", () => {
    // The tutorial was A CONSUMER of these, never their owner. Deleting them
    // with it would have taken Ranked and the Daily Challenge down too.
    for (const rel of [
      join("components", "ranked-arena", "CanonicalArena.tsx"),
      join("lib", "ranked-core", "viewTypes.ts"),
      join("lib", "ranked-core", "arenaView.ts"),
    ]) {
      expect(() => read(rel), `${rel} must survive`).not.toThrow();
    }
  });

  it("keeps the Mogzy Rules Scroll as the lightweight rules affordance", () => {
    expect(() => read(join("components", "ranked-rules", "RankedRulesScroll.tsx")))
      .not.toThrow();
    const scroll = read(join("components", "ranked-rules", "RankedRulesScroll.tsx"));
    // It is a rules panel, not a step sequence — it must not become the
    // tutorial's replacement by absorbing it.
    expect(scroll).not.toContain("tutorialMachine");
  });

  it("keeps Tutorial TIPS, a different feature entirely", () => {
    expect(() => read(join("components", "TutorialTipPopup.tsx"))).not.toThrow();
    expect(() => read(join("hooks", "useTutorialTips.ts"))).not.toThrow();
  });
});
