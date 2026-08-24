/**
 * THE DAILY CHALLENGE RENDERS THE PRODUCTION ARENA (ARENA1 Step 5).
 *
 * Step 3 extracted `CanonicalArena`. Step 4 proved a SCRIPTED mode could use
 * it. This file is the third and hardest case: a mode with its own transport,
 * its own rules, its own finite plan and NO OPPONENT.
 *
 * It is written as standing rules rather than a one-time observation, because
 * the Daily is where the fork actually happened. DC1 Phase 5 shipped a second
 * arena — its own 23/54/23 grid, its own answer grid, its own card stage, its
 * own timeline and its own player column — and none of that was wrong when it
 * was written, because `CanonicalArena` did not exist yet. What was wrong was
 * leaving it there once it did: two of the guards below (`AnswerGrid.elimination`
 * and `TutorialOnCanonicalArena`) began FAILING the moment the two lines of
 * work were put in one tree, which is precisely what a guard is for.
 *
 * Every assertion here names something that was ACTUALLY true before this
 * step, and a failure is that thing coming back.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

/**
 * Source with its COMMENTS removed.
 *
 * Every rule below is about what the code DOES, and a file that explains at
 * length why it does not own an opponent would otherwise fail the rule that it
 * must not name one. Stripping comments is what lets these guards be written
 * as plain substring bans — which is the form that makes a failure readable —
 * without punishing the files for documenting themselves.
 */
const codeOnly = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const filesMatching = (re: RegExp) =>
  sourceFiles(ROOT).filter((f) => re.test(readFileSync(f, "utf8"))).map(rel).sort();

/** Every non-test source file the Daily owns. */
const DAILY_FILES = () => [
  ...sourceFiles(join(ROOT, "pages", "quiz-daily-challenge")),
  ...sourceFiles(join(ROOT, "lib", "daily-challenge")),
].map(rel).sort();

const dailySource = () =>
  DAILY_FILES().map((f) => `\n@@ ${f} @@\n` + codeOnly(read(f))).join("");

// ── A/B/C · all three modes reach the one arena ────────────────────────────

describe("every mode's route reaches CanonicalArena", () => {
  it("Ranked does", () => {
    expect(read("App.tsx")).toMatch(/path="\/quiz\/ranked"[\s\S]{0,200}QuizRankedPage/);
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx"))
      .toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("<CanonicalArena");
  });

  it("the Tutorial does", () => {
    expect(read("pages/dev/ranked-tutorial/RankedTutorialPage.tsx"))
      .toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(read("pages/dev/ranked-tutorial/RankedTutorialPage.tsx")).toContain("<CanonicalArena");
  });

  it("the Daily does", () => {
    expect(read("App.tsx"))
      .toMatch(/path="\/quiz\/daily-challenge"[\s\S]{0,200}QuizDailyChallengePage/);
    const page = read("pages/quiz-daily-challenge/QuizDailyChallengePage.tsx");
    expect(page).toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(page).toContain("<CanonicalArena");
  });
});

// ── D/E · one answer renderer, one timeline presentation ───────────────────

describe("there is one of each", () => {
  it("one canonical answer renderer, and no mode owns a second", () => {
    expect(
      filesMatching(/(?:function|const)\s+\w*Answer(?:Grid|Options)\b/),
      [
        "A second component started rendering answer choices. The canonical",
        "path is InteractiveScenarioSurface → AnswerGrid → QuizAnswerOptions;",
        "per-option elimination is a prop on it (`eliminatedOptionIds`), not a",
        "reason to fork it.",
      ].join(" "),
    ).toEqual([
      "components/quiz-broadcast/BroadcastRenderer.tsx",  // video, non-interactive
      "components/quiz/QuizAnswerOptions.tsx",
      "components/ranked-arena/AnswerGrid.tsx",
    ]);
  });

  it("one canonical timeline presentation", () => {
    expect(
      filesMatching(/data-testid="ranked-round-timeline"/),
      "A second component started drawing the round timeline.",
    ).toEqual(["components/ranked-arena/RoundTimeline.tsx"]);
    // And exactly one module DERIVES one. `pages/quiz-ranked/roundTimeline`
    // is a re-export shim with no derivation of its own.
    expect(filesMatching(/export function projectRoundTimeline/))
      .toEqual(["lib/ranked-core/roundTimeline.ts"]);
  });

  it("one arena root, one centre column, one three-column geometry", () => {
    expect(filesMatching(/data-testid="ranked-match"/))
      .toEqual(["components/ranked-arena/CanonicalArena.tsx"]);
    expect(filesMatching(/data-testid="ranked-focus-column"/))
      .toEqual(["components/ranked-arena/CanonicalArena.tsx"]);
    expect(filesMatching(/minmax\(0,23fr\)/)).toEqual([
      "components/ranked-arena/CanonicalArena.tsx",
      "pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx",
    ]);
  });
});

// ── F/G/H · the Daily owns rules, not rendering ────────────────────────────

describe("the Daily owns no game surface of its own", () => {
  it("renders none of the arena's structural regions", () => {
    const src = dailySource();
    for (const marker of [
      'data-testid="ranked-header"',
      'data-testid="ranked-focus-column"',
      'data-testid="ranked-question"',
      'data-testid="ranked-abilities"',
      'data-testid="ranked-round-timeline"',
      'data-testid="submission-status"',
      "minmax(0,23fr)",
      "ranked-academy",
    ]) {
      expect(src, `the Daily re-grew the arena's "${marker}" region`)
        .not.toContain(marker);
    }
  });

  it("owns no answer renderer, no question renderer, no timeline renderer", () => {
    const src = dailySource();
    for (const forbidden of [
      // The tablets, the question surface and the strip are the arena's,
      // reached through the module registry and the view model.
      "question-surface/InteractiveScenarioSurface",
      "ranked-arena/AnswerGrid",
      "ranked-arena/QuestionPanel",
      "ranked-arena/RoundTimeline",
      "ranked-arena/CombatantPanel",
      "ranked-arena/TimerDisplay",
      "ranked-arena/AbilityTray",
      "ranked-arena/MatchOverFrame",
      "components/quiz/QuizAnswerOptions",
      "components/quiz/QuizAnswerFeedback",
    ]) {
      expect(src, `${forbidden} is the arena's, supplied through the view model`)
        .not.toContain(forbidden);
    }
  });

  it("kept its four duplicate renderers DELETED", () => {
    const names = DAILY_FILES();
    for (const gone of [
      "DailyAnswerGrid",     // a second answer grid
      "DailyCardStage",      // a second question stage
      "DailyCardTimeline",   // a second timeline
      "DailyPlayerPanel",    // a second combatant column
    ]) {
      expect(names.filter((n) => n.includes(gone)),
        `${gone} was part of the Daily's own arena. It must not come back.`).toEqual([]);
    }
  });

  /**
   * K — what Daily-specific UI is ALLOWED to be.
   *
   * Two nodes and one summary, and each is content rather than presentation
   * machinery: the right-hand target (the seam Step 3 built for exactly this),
   * the mode's own two controls, and the finished day's numbers. If a fourth
   * appears, it is worth a conversation before it is worth a merge.
   */
  it("its remaining components are semantic content, and there are three", () => {
    const components = DAILY_FILES()
      .filter((f) => f.endsWith(".tsx") && !f.endsWith("Page.tsx"))
      .map((f) => f.split("/").pop());
    expect(components).toEqual([
      "DailyChallengePanel.tsx",   // TODAY'S CHALLENGE — the right flank
      "DailyResultSummary.tsx",    // the finished day's own numbers
      "DailyRunControls.tsx",      // START a reflex window, CONTINUE past a card
    ]);
  });

  it("stayed a controller: it still owns the transport, the rules and the run", () => {
    const page = read("pages/quiz-daily-challenge/QuizDailyChallengePage.tsx");
    expect(page).toContain("useDailyChallengeRun");
    expect(page).toContain("dailyArenaView");
    // The controller and its transport are untouched by the migration.
    expect(DAILY_FILES()).toContain("lib/daily-challenge/client.ts");
    expect(DAILY_FILES()).toContain("lib/daily-challenge/contracts.ts");
    expect(DAILY_FILES()).toContain("pages/quiz-daily-challenge/useDailyChallengeRun.ts");
  });
});

// ── I · the Daily takes shared code from the SHARED layer ──────────────────

describe("the Daily imports its shared projections from lib, never from a page", () => {
  it("names no module under pages/quiz-ranked", () => {
    const offenders: string[] = [];
    for (const file of [
      ...sourceFiles(join(ROOT, "pages", "quiz-daily-challenge")),
      ...sourceFiles(join(ROOT, "lib", "daily-challenge")),
    ]) {
      const src = codeOnly(readFileSync(file, "utf8"));
      if (/from\s+["']@\/pages\/quiz-ranked/.test(src)) offenders.push(rel(file));
    }
    expect(offenders, [
      "The Daily reached into Ranked's page directory for shared code.",
      "Neutral projections live in lib/ranked-core — promote it there first,",
      "the way ARENA1 Step 5 did with the settlement and timeline projections.",
    ].join(" ")).toEqual([]);
  });

  it("reuses the canonical registry and the canonical timeline projection", () => {
    const view = read("pages/quiz-daily-challenge/dailyArenaView.ts");
    expect(view).toContain('from "@/lib/ranked-core/modules/registry"');
    expect(view).toContain("rendererForSegment");
    expect(view).toContain('from "@/lib/ranked-core/roundTimeline"');
    expect(view).toContain("projectRoundTimeline");
    // The segment identity is the production constant, not a literal.
    expect(read("pages/quiz-daily-challenge/dailyChallengeViews.ts"))
      .toContain("LEGACY_SEGMENT");
  });

  it("resolves no asset path, no media and no metadata of its own", () => {
    const src = dailySource();
    for (const forbidden of [
      "resolveQuizAssetUrl", "scenarioSourceFromPublicQuestion", "assetUrl",
      "champion-metadata", "abilityIconFor",
    ]) {
      expect(src, `${forbidden} is canonical infrastructure the arena reaches`)
        .not.toContain(forbidden);
    }
    // What it DOES do is hand the card's own frozen art to that infrastructure.
    expect(read("pages/quiz-daily-challenge/dailyChallengeViews.ts"))
      .toContain("presentation: card.media");
  });
});

// ── J · the arena still knows about no mode ────────────────────────────────

describe("the seams did not teach the arena about the Daily", () => {
  it("CanonicalArena names no Daily symbol", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    // "card" and "challenge" are RANKED vocabulary — a Meta Reflex block is
    // five cards and a segment holds challenges — so they are not on this
    // list. Everything that is, is a Daily concept and nothing else.
    for (const forbidden of [
      "@/pages/quiz-daily-challenge", "@/lib/daily-challenge",
      "dailyArenaView", "daily challenge", "streak", "grade", "meta reflex block is",
    ]) {
      expect(codeOnly(arena).toLowerCase(),
        `CanonicalArena must not know about ${forbidden}`)
        .not.toContain(forbidden.toLowerCase());
    }
  });

  it("no shared arena module imports Daily code", () => {
    const offenders: string[] = [];
    for (const dir of [
      join(ROOT, "components", "ranked-arena"),
      join(ROOT, "components", "question-surface"),
      join(ROOT, "lib", "ranked-core"),
    ]) {
      for (const file of sourceFiles(dir)) {
        const src = codeOnly(readFileSync(file, "utf8"));
        if (/daily-challenge/.test(src)) offenders.push(rel(file));
      }
    }
    expect(offenders, "A shared arena module reached into the Daily.").toEqual([]);
  });

  it("the mode-supplied seams are all OPTIONAL, so Ranked passes none of them", () => {
    const arenaView = read("lib/ranked-core/arenaView.ts");  // types, comments and all
    for (const seam of [
      // `feedback?:` is where the struck set rides now. Step 5 opened this as
      // a bare `eliminatedOptionIds?:` relay; RG3 reached `main` first with
      // the fuller model — struck set, verdict, score lock and disclosure gate
      // as one sealed statement — and the seam follows production.
      "feedback?:", "surfaceSettings?:", "timerNotes?:",
      "opponent?:", "eyebrow?:",
    ]) {
      expect(arenaView, `${seam} must stay optional`).toContain(seam);
    }
    const ranked = codeOnly(read("pages/quiz-ranked/QuizRankedMatch.tsx"));
    for (const seam of [
      "surfaceSettings", "timerNotes", "meterLabel", "guidance",
    ]) {
      expect(ranked, `Ranked must not supply ${seam}`).not.toContain(seam);
    }
  });
});

// ── §15 · there is no opponent anywhere in the Daily ───────────────────────

describe("the Daily invents no second player", () => {
  it("its whole source names no opponent concept", () => {
    // The ONE permitted mention is the terminal frame's explicit statement of
    // ABSENCE — `opponent: null`, which is the field being declared empty and
    // is asserted for on its own below.
    const src = dailySource().replace(/opponent: null,/g, "").toLowerCase();
    // Whole words: "elo" is a substring of "below" and "developer", and a
    // guard that fires on prose it does not mean is a guard people delete.
    for (const pvp of [
      "opponent", "opponents", "rematch", "matchmaking", "rating", "elo",
      "duelist", "duelists", "versus", "adaptBackendSettlement",
      "combatantViewsFromPlayers",
    ]) {
      expect(src, `the Daily must not name "${pvp}"`)
        .not.toMatch(new RegExp(`\\b${pvp.toLowerCase()}\\b`));
    }
  });

  /**
   * The header's second note slot is `presenceNote` — historically "what the
   * opponent is doing". The Daily fills it, which is allowed (the contract
   * says the slots carry whatever short line a mode has), so what matters is
   * WHAT it puts there. It is a description of the CARD.
   */
  it("puts a card descriptor in the header's second note slot, never a player", () => {
    const view = read("pages/quiz-daily-challenge/dailyArenaView.ts");
    expect(view).toContain("presenceNote: cardNote(card)");
    expect(view).toMatch(/function cardNote\(card: DcCard \| null\)/);
  });

  it("fills its right flank with a PANEL, and its terminal with one column", () => {
    const view = read("pages/quiz-daily-challenge/dailyArenaView.ts");
    expect(view).toMatch(/right:\s*\{\s*kind:\s*"panel"/);
    expect(view).toMatch(/opponent:\s*null/);
    expect(view).toContain("reveal: null");
  });
});
