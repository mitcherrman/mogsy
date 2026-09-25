/**
 * THE DAILY CHALLENGE RENDERS THE PRODUCTION ARENA (ARENA1 Step 5).
 *
 * Step 3 extracted `CanonicalArena`. This file is the hardest case: a mode
 * with its own transport,
 * its own rules, its own finite plan and NO OPPONENT.
 *
 * It is written as standing rules rather than a one-time observation, because
 * the Daily is where the fork actually happened. DC1 Phase 5 shipped a second
 * arena — its own 23/54/23 grid, its own answer grid, its own card stage, its
 * own timeline and its own player column — and none of that was wrong when it
 * was written, because `CanonicalArena` did not exist yet. What was wrong was
 * leaving it there once it did: the guards below began FAILING the moment the
 * two lines of work were put in one tree, which is precisely what a guard is
 * for.
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
// POSIX separators, so the path-shaped assertions below hold on Windows too.
const rel = (f: string) => f.slice(ROOT.length + 1).split("\\").join("/");

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

// ── A/B/C · every production mode reaches the one arena ───────────────────

describe("every mode's route reaches CanonicalArena", () => {
  it("Ranked does", () => {
    expect(read("App.tsx")).toMatch(/path="\/quiz\/ranked"[\s\S]{0,200}QuizRankedPage/);
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx"))
      .toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("<CanonicalArena");
  });

  it("the Daily does — every stage is a hosted canonical Ranked match", () => {
    const app = read("App.tsx");
    expect(app)
      .toMatch(/path="\/quiz\/daily-challenge"[\s\S]{0,200}QuizDailyChallengePage/);
    expect(app).toContain('import("./pages/quiz-daily-challenge/run/DailyRunPage")');
    const page = read("pages/quiz-daily-challenge/run/DailyRunPage.tsx");
    expect(page).toContain("<QuizRankedMatch");
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("<CanonicalArena");
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
   * ONE node and one summary, and each is content rather than presentation
   * machinery: the right-hand target (the seam Step 3 built for exactly this)
   * and the finished day's numbers. If a third appears, it is worth a
   * conversation before it is worth a merge.
   *
   * `DailyRunControls` was the third, and ARENA1 Phase 2 deleted it. It held a
   * START button for a Meta Reflex window and a NEXT CARD button for a resolved
   * one — two manual beats live Ranked does not have and this mode should never
   * have grown. Its absence from this list is the guard against them returning
   * as a pair of buttons under the question.
   */
  /*
   * DCMOD-E — the parent run added the conversation this rule asks for. Its
   * components are the Daily's BETWEEN-STAGE presentation, and none draws a
   * game surface: the stage beats (intro / tag / short result), the one final
   * completion, the header row handed to the arena as `chrome`, and the stage
   * tag + ladder. Gameplay stays the canonical match, hosted via `MatchHost`.
   */
  it("its remaining components are semantic content or between-stage beats", () => {
    const components = DAILY_FILES()
      .filter((f) => f.endsWith(".tsx") && !f.endsWith("Page.tsx"))
      .map((f) => f.split("/").pop());
    expect(components).toEqual([
      "DailyCompletion.tsx",       // DCMOD-E: the parent run's one close
      "DailyRunBeats.tsx",         // DCMOD-E: Daily intro, stage tag
      "DailyStageChrome.tsx",      // DCMOD-E: the header row over the arena
      // DC-LANE-C: a stage's result, in the SHARED result components (hero,
      // snapshot, actions) — between stages, never a game surface.
      "DailyStageResult.tsx",
      "StageTag.tsx",              // DCMOD-E: a stage's mode name, and the ladder
    ]);
  });

  /**
   * THE DAILY OFFERS NOTHING TO PRESS BETWEEN CARDS (ARENA1 Phase 2).
   *
   * A source guard rather than a render assertion, because the thing being
   * prevented is a control coming back ANYWHERE in the mode — in the arena's
   * guidance slot, in the page, in a new component — and a DOM test can only
   * see the state it happened to set up. The Daily plays like live Ranked:
   * answer once, brief result, automatically continue.
   */
  /*
   * DC-LANE-C (product decision) — ONE control is now allowed: the stage
   * result's Continue, which moves between STAGES inside the Daily (never
   * between cards, never to a lobby or a queue). It lives in exactly one file,
   * and the handler behind it cannot reach the server (`dailyRun.boundary`
   * pins that). Every other manual beat stays banned everywhere.
   */
  it("names no manual progression control anywhere in its source", () => {
    const offenders: string[] = [];
    for (const file of DAILY_FILES()) {
      const src = codeOnly(read(file));
      const allowed = file === "pages/quiz-daily-challenge/run/DailyStageResult.tsx" ? ["Continue"] : [];
      for (const banned of [
        "Next card", "Next Card", "Continue", "Start card", "See results",
        "dc-continue", "dc-reflex-start", "dc-reflex-gate", "DailyRunControls",
      ]) {
        if (allowed.includes(banned)) continue;
        if (src.includes(banned)) offenders.push(`${file}: ${banned}`);
      }
    }
    expect(offenders, [
      "A manual progression control came back to the Daily.",
      "The mode advances on the arena's own result beat and activates its own",
      "Meta Reflex window; there is nothing for a player to press between cards.",
    ].join(" ")).toEqual([]);
  });

  /*
   * DCMOD integration — the DC2 in-page engine (its controller, transport,
   * card views and arena view model) is RETIRED, not kept "for compatibility".
   * The parent run is the only Daily runtime; the lobby's status reads it too.
   */
  it("the parent run is the ONLY Daily runtime", () => {
    expect(DAILY_FILES()).toEqual([
      "lib/daily-challenge/run/client.ts",
      "lib/daily-challenge/run/contracts.ts",
      "lib/daily-challenge/run/fixtures.ts",
      "lib/daily-challenge/run/flow.ts",
      "lib/daily-challenge/run/stageIdentity.ts",
      "lib/daily-challenge/run/stageResultModel.ts",
      "lib/daily-challenge/run/timeBank.ts",
      "lib/daily-challenge/status.ts",
      "lib/daily-challenge/useDailyChallengeStatus.ts",
      "pages/quiz-daily-challenge/run/DailyCompletion.tsx",
      "pages/quiz-daily-challenge/run/DailyRunBeats.tsx",
      "pages/quiz-daily-challenge/run/DailyRunPage.tsx",
      "pages/quiz-daily-challenge/run/DailyStageChrome.tsx",
      "pages/quiz-daily-challenge/run/DailyStageResult.tsx",
      "pages/quiz-daily-challenge/run/StageTag.tsx",
      "pages/quiz-daily-challenge/run/useDailyRun.ts",
    ]);
    const src = dailySource();
    for (const gone of ["/api/daily-challenge", "useDailyChallengeRun", "dailyArenaView"]) {
      expect(src, `the retired DC2 Daily came back: ${gone}`).not.toContain(gone);
    }
    expect(read("lib/daily-challenge/status.ts")).toContain("httpDailyRunTransport");
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
      let src = codeOnly(readFileSync(file, "utf8"));
      // DCMOD-E — the ONE allowed reach: the parent run HOSTS the canonical
      // match (a component, not a projection), through the neutral `MatchHost`
      // seam. Only this symbol, only from the page that routes the stages.
      if (rel(file) === "pages/quiz-daily-challenge/run/DailyRunPage.tsx") {
        src = src.replace(
          'import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";', "");
      }
      if (/from\s+["']@\/pages\/quiz-ranked/.test(src)) offenders.push(rel(file));
    }
    expect(offenders, [
      "The Daily reached into Ranked's page directory for shared code.",
      "Neutral projections live in lib/ranked-core — promote it there first,",
      "the way ARENA1 Step 5 did with the settlement and timeline projections.",
    ].join(" ")).toEqual([]);
  });

  it("builds no arena view model of its own — the hosted match does", () => {
    const src = dailySource();
    for (const forbidden of ["rendererForSegment", "projectRoundTimeline", "ArenaViewModel"]) {
      expect(src, `${forbidden} belongs to the hosted canonical match`).not.toContain(forbidden);
    }
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
});
