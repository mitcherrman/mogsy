/**
 * THE TUTORIAL RENDERS THE PRODUCTION ARENA (ARENA1 Step 4).
 *
 * Step 3 extracted `CanonicalArena` and proved Ranked reaches it. That proved
 * the arena could be a component; it did not prove the arena could serve a
 * mode that is not Ranked. This file is that proof, and it is written as a set
 * of standing rules rather than a one-time observation, because the tutorial is
 * exactly where the fork happened last time: it began by reusing arena PARTS,
 * grew a shell "just for layout", then a round area "just for wiring", and
 * ended up with an answer flow the real game no longer had.
 *
 * Every assertion below names something that was ACTUALLY true before this
 * step, and a failure here is that thing coming back.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RankedTutorialPage from "@/pages/dev/ranked-tutorial/RankedTutorialPage";

const ROOT = resolve(process.cwd(), "src");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...sourceFiles(full)); continue; }
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
const rel = (f: string) => f.slice(ROOT.length + 1);
const filesMatching = (re: RegExp) =>
  sourceFiles(ROOT).filter((f) => re.test(readFileSync(f, "utf8"))).map(rel).sort();

/** Every non-test source file the tutorial owns. */
const TUTORIAL_FILES = () => [
  ...sourceFiles(join(ROOT, "pages", "dev", "ranked-tutorial")),
  ...sourceFiles(join(ROOT, "lib", "ranked-tutorial")),
].map(rel).sort();

const tutorialSource = () =>
  TUTORIAL_FILES().map((f) => `\n/* ${f} */\n` + read(f)).join("");

// ── B · the Tutorial route reaches the canonical arena ─────────────────────

describe("the Tutorial route renders through CanonicalArena", () => {
  it("wires all three tutorial routes to the one tutorial page", () => {
    const app = read("App.tsx");
    expect(app).toMatch(/path="\/quiz\/tutorial"[\s\S]{0,200}RankedTutorialOnboardingPage/);
    expect(app).toMatch(
      /path="\/onboarding\/ranked-tutorial"[\s\S]{0,200}RankedTutorialOnboardingPage/);
    expect(app).toMatch(/path="\/dev\/ranked-tutorial"[\s\S]{0,200}RankedTutorialPage/);
    // The production host renders the SAME page component the dev route does.
    expect(read("pages/onboarding/RankedTutorialOnboardingPage.tsx"))
      .toContain("<RankedTutorialPage");
    const page = read("pages/dev/ranked-tutorial/RankedTutorialPage.tsx");
    expect(page).toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(page).toContain("<CanonicalArena");
  });

  it("mounts the canonical shell, the canonical arena, and the canonical stage", () => {
    render(
      <MemoryRouter initialEntries={["/dev/ranked-tutorial"]}>
        <RankedTutorialPage />
      </MemoryRouter>,
    );
    // The shell — the ancestor half the arena's CSS is written against.
    const shell = screen.getByTestId("quiz-ranked");
    expect(shell.className).toContain("ranked-academy");
    // The arena, and its three structural regions. Not one of these existed on
    // the tutorial's screen before this step.
    expect(screen.getByTestId("ranked-match")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-header")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-focus-column")).toBeInTheDocument();
    expect(screen.getByTestId("ranked-round-timeline")).toBeInTheDocument();
    // And the teaching, in the arena's one guidance slot.
    expect(screen.getByTestId("ranked-focus-column"))
      .toContainElement(screen.getByTestId("tutorial-guidance"));
  });

  it("draws the question through the CANONICAL registry, not a surface of its own", () => {
    render(
      <MemoryRouter initialEntries={["/dev/ranked-tutorial"]}>
        <RankedTutorialPage />
      </MemoryRouter>,
    );
    // Step 1 (the timer lesson) has no round: the stage is absent, and the
    // arena's fail-closed unsupported-module panel must NOT be what fills it.
    expect(screen.queryByTestId("ranked-unsupported-module")).toBeNull();
  });
});

// ── C · there is exactly one arena presentation root ───────────────────────

describe("one arena, one root", () => {
  it("only CanonicalArena draws the arena and its three-column geometry", () => {
    expect(
      filesMatching(/data-testid="ranked-match"/),
      "A second component started drawing the arena root.",
    ).toEqual(["components/ranked-arena/CanonicalArena.tsx"]);
    expect(
      filesMatching(/data-testid="ranked-focus-column"/),
      "A second component started drawing the arena's centre column.",
    ).toEqual(["components/ranked-arena/CanonicalArena.tsx"]);
    expect(
      filesMatching(/minmax\(0,23fr\)/),
      [
        "A second file laid out the 23/54/23 arena geometry. The arena inspector",
        "is the one permitted echo: it is a fixture bench that mounts arena PARTS",
        "with no arena around them (see RankedArenaInspector.test).",
      ].join(" "),
    ).toEqual([
      "components/ranked-arena/CanonicalArena.tsx",
      "pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx",
    ]);
  });
});

// ── D/E/H · the Tutorial owns rules, not rendering ─────────────────────────

describe("the Tutorial owns no game surface of its own", () => {
  it("renders none of the arena's structural regions", () => {
    const src = tutorialSource();
    for (const marker of [
      'data-testid="ranked-header"',
      'data-testid="ranked-focus-column"',
      'data-testid="ranked-question"',
      'data-testid="ranked-abilities"',
      'data-testid="ranked-round-timeline"',
      'data-testid="submission-status"',
      "minmax(0,23fr)",
      "ranked-panel ranked-folio",
      "ranked-academy",
    ]) {
      expect(src, `the tutorial re-grew the arena's "${marker}" region`)
        .not.toContain(marker);
    }
  });

  it("owns no answer renderer: no grid, no surface, no submission flow", () => {
    const src = tutorialSource();
    for (const forbidden of [
      // The answer tablets and the question surface are the arena's, reached
      // through the module registry. Importing either directly is how the
      // tutorial ended up on `variant="tutorial"` while Ranked moved on.
      "question-surface/InteractiveScenarioSurface",
      "ranked-arena/AnswerGrid",
      "ranked-arena/QuestionPanel",
      // The retired select → review → confirm flow. Ranked submits on one
      // click; a tutorial that teaches anything else is teaching a lie.
      "ranked-arena/SubmissionReview",
      "LOCK_SUBMISSION",
      "CONFIRM_LOCK",
      "EDIT_SUBMISSION",
    ]) {
      expect(src, `${forbidden} is not the tutorial's to own`).not.toContain(forbidden);
    }
  });

  it("owns no timeline renderer, and no combatant or timer presentation", () => {
    const src = tutorialSource();
    for (const forbidden of [
      "ranked-arena/RoundTimeline",
      "ranked-arena/CombatantPanel",
      "ranked-arena/TimerDisplay",
      "ranked-arena/AbilityTray",
      "ranked-arena/MatchOverFrame",
    ]) {
      expect(src, `${forbidden} is the arena's, supplied through the view model`)
        .not.toContain(forbidden);
    }
  });

  it("kept its duplicated shell and round area DELETED", () => {
    const names = TUTORIAL_FILES();
    for (const gone of ["TrainingMatchShell", "TutorialRoundArea"]) {
      expect(names.filter((n) => n.includes(gone)),
        `${gone} was the tutorial's own arena. It must not come back.`).toEqual([]);
    }
  });

  it("stayed a director: it still owns the lesson, the script and the coaching", () => {
    const page = read("pages/dev/ranked-tutorial/RankedTutorialPage.tsx");
    expect(page).toContain("tutorialReducer");
    expect(page).toContain("tutorialArenaView");
    expect(page).toContain("InstructionPanel");
  });
});

// ── F · the Tutorial inherits the canonical resource paths ─────────────────

describe("the Tutorial's question resolves through canonical authority", () => {
  it("declares a quiz.v1 segment and lets the canonical registry choose", () => {
    const view = read("pages/dev/ranked-tutorial/tutorialArenaView.ts");
    expect(view).toContain('from "@/lib/ranked-core/modules/registry"');
    expect(view).toContain("rendererForSegment");
    // The segment identity itself is the production constant, not a literal.
    expect(read("pages/dev/ranked-tutorial/adapters.ts")).toContain("LEGACY_SEGMENT");
  });

  it("reuses the canonical settlement projections rather than copying them", () => {
    const view = read("pages/dev/ranked-tutorial/tutorialArenaView.ts");
    for (const projection of [
      "projectRoundHistory", "projectRevealOutcomes", "projectRevealDamage",
      "projectMascotReactions", "projectSurfaceReveal", "projectRoundTimeline",
    ]) {
      expect(view, `${projection} must be the canonical one, not a tutorial copy`)
        .toContain(projection);
    }
  });

  it("resolves no asset path, no media and no metadata of its own", () => {
    const src = tutorialSource();
    for (const forbidden of [
      "scenarioSourceFromPublicQuestion", "assetUrl",
      "champion-metadata", "abilityIconFor", "optionMediaFixtures",
    ]) {
      expect(src, `${forbidden} is canonical infrastructure the arena reaches`)
        .not.toContain(forbidden);
    }
    // The one media field it names, it names to declare ABSENT — the tutorial
    // supplies no option art and takes whatever the canonical resolver does.
    expect(read("pages/dev/ranked-tutorial/adapters.ts")).toContain("optionMedia: null");
  });
});

// ── G · the arena still knows about no mode, guidance seam included ────────

describe("the guidance seam did not teach the arena about the Tutorial", () => {
  it("CanonicalArena names no tutorial symbol", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    for (const forbidden of [
      "@/pages/dev/ranked-tutorial", "tutorialMachine", "TutorialStep",
      "InstructionPanel", "lesson", "training",
    ]) {
      expect(arena.toLowerCase(), `CanonicalArena must not know about ${forbidden}`)
        .not.toContain(forbidden.toLowerCase());
    }
  });

  it("is a slot, not an API: one optional ReactNode, no shape of its own", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    expect(arena).toMatch(/guidance\?: ReactNode;/);
    // Rendered verbatim on both exit paths, never inspected or branched on.
    expect(arena.match(/\{guidance\}/g) ?? []).toHaveLength(2);
    expect(arena).not.toMatch(/guidance\./);
    expect(arena).not.toMatch(/guidance &&/);
  });

  it("Ranked supplies none, so its DOM is what it always was", () => {
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).not.toContain("guidance");
  });
});
