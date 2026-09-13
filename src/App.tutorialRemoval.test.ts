/**
 * TUT1 — the scripted Ranked tutorial is retired.
 *
 * This file is the standing proof of the removal, written as source-level
 * boundaries rather than as one screen's behaviour, because the thing being
 * protected is an ABSENCE: no gate, no route, no replay entry, no state read,
 * and no surface still teaching the retired HP/damage combat model.
 *
 * The hard-cleanup pass made the removal total: there are no users whose old
 * tutorial state needs preserving, so the compatibility residue went too — the
 * redirect routes, the legacy welcome outcome, the two profile columns, the two
 * inert app_settings rows and the tutorial surface variant.
 *
 * What it deliberately does NOT assert anything against: Tutorial TIPS
 * (`tutorial_tips`, `TutorialTipPopup`, `AdminTutorialTips`). That is a
 * different feature — admin-authored contextual coach-marks on legacy Mogsy
 * routes — and was never part of this workstream. The final section below
 * asserts it SURVIVED, so an over-eager "tutorial" sweep fails here.
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

describe("the tutorial's stored state is gone, not merely unread", () => {
  it("no file — production, test or generated — names the profile columns", () => {
    for (const file of sourceFiles(ROOT)) {
      if (file.endsWith("App.tutorialRemoval.test.ts")) continue;
      const src = readFileSync(file, "utf8");
      expect(src, `${rel(file)} still names a tutorial completion column`)
        .not.toContain("ranked_tutorial_completed_at");
      expect(src, `${rel(file)} still names a tutorial version column`)
        .not.toContain("ranked_tutorial_version");
    }
  });

  it("a migration actually drops the columns and the inert settings rows", () => {
    // The generated types no longer declare them (asserted above), which would
    // also be true of a types file that had simply drifted from the schema.
    // This is what makes it a real schema change.
    const sql = readFileSync(
      resolve(process.cwd(), "supabase", "migrations",
        "20260912120000_tut1_drop_ranked_tutorial_residue.sql"),
      "utf8",
    );
    expect(sql).toMatch(/DROP COLUMN IF EXISTS ranked_tutorial_completed_at/);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS ranked_tutorial_version/);
    expect(sql).toMatch(/DELETE FROM public\.app_settings/);
    expect(sql).toContain("tutorial_auto_popup_enabled");
    expect(sql).toContain("tutorial_completion_required_for_new_users");
  });

  it("keeps no tutorial key in browser storage logic", () => {
    for (const file of PRODUCTION_FILES) {
      expect(readFileSync(file, "utf8"), `${rel(file)} still writes a tutorial storage key`)
        .not.toContain("tutorial_popup_dismissed");
    }
  });

  it("the Academy welcome keeps no legacy tutorial outcome", () => {
    const welcome = read(join("lib", "welcome", "academy-welcome.ts"));
    expect(welcome).not.toContain('"tutorial"');
    expect(welcome).toContain('export type AcademyWelcomeOutcome = "explored" | "signed-in"');
  });
});

describe("no user-facing entry point survives", () => {
  it("no production file names a tutorial route — the routes do not exist", () => {
    for (const file of PRODUCTION_FILES) {
      const src = readFileSync(file, "utf8");
      for (const route of [
        "/quiz/tutorial", "/onboarding/ranked-tutorial", "/dev/ranked-tutorial",
      ]) {
        expect(src, `${rel(file)} still names ${route}`).not.toContain(route);
      }
    }
  });

  it("the route table carries no tutorial route, redirect included", () => {
    // No users means no bookmark to honour: a redirect would be residue too.
    expect(read("App.tsx").toLowerCase()).not.toContain("tutorial");
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
    expect(policy).not.toContain("POLICY_KEYS.tutorial");
    expect(policy).not.toContain("evaluateTutorialPresentation");
    // The keys survive only inside the comment explaining that they are gone.
    expect(policy).not.toMatch(/^\s*tutorial\w*:/m);
  });

  it("the tutorial surface variant is gone with its only consumer", () => {
    // `SurfaceVariant "tutorial"` was a density preset created for, and named
    // after, the scripted tutorial. Its only remaining caller was one demo row
    // in the dev arena inspector — residue, not a generic rendering mode.
    const contract = read(join("lib", "question-surface", "contract.ts"));
    expect(contract).toContain(
      'export type SurfaceVariant = "standard" | "competitive" | "speed"',
    );
    for (const file of PRODUCTION_FILES) {
      expect(readFileSync(file, "utf8"), `${rel(file)} still asks for the variant`)
        .not.toContain('variant="tutorial"');
    }
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
    // Admin-authored contextual coach-marks on legacy Mogsy routes, backed by
    // the `tutorial_tips` / `tutorial_tip_dismissals` tables. It shares a word
    // with the deleted feature and nothing else. A "tutorial" sweep that took
    // this with it would fail here.
    expect(() => read(join("components", "TutorialTipPopup.tsx"))).not.toThrow();
    expect(() => read(join("hooks", "useTutorialTips.ts"))).not.toThrow();
    expect(() => read(join("components", "admin", "AdminTutorialTips.tsx")))
      .not.toThrow();
    expect(read(join("hooks", "useTutorialTips.ts"))).toContain("tutorial_tips");
    expect(read(join("hooks", "useTutorialTips.ts")))
      .toContain("tutorial_tip_dismissals");
    // Still mounted, and still listed in the admin registry.
    expect(read(join("components", "Layout.tsx"))).toContain("<TutorialTipPopup />");
    expect(read(join("lib", "admin", "admin-registry.ts")))
      .toContain('id: "tutorial-tips"');
  });

  it("keeps Bot Ranked reachable and unmodified by this workstream", () => {
    // The real learn-by-doing path. Nothing here gates it, and nothing in it
    // ever consulted tutorial state.
    const client = read(join("lib", "ranked-public", "client.ts"));
    expect(client.toLowerCase()).not.toContain("tutorial");
    expect(read("App.tsx")).toContain('path="/quiz/ranked"');
  });

  it("keeps the other surface variants — only the tutorial one was removed", () => {
    const contract = read(join("lib", "question-surface", "contract.ts"));
    for (const variant of ["standard", "competitive", "speed"]) {
      expect(contract, `${variant} variant must survive`).toContain(`${variant}:`);
    }
  });
});
