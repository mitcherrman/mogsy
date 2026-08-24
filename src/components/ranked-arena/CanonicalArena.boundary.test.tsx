/**
 * THE CANONICAL ARENA IS THE ONLY ARENA (ARENA1 Step 3).
 *
 * Step 1 found three arena shells, three progress strips and three result
 * presentations across Ranked, the Tutorial and the Daily Challenge — none of
 * them forked deliberately. Each began as a small, reasonable local decision:
 * a layout file here, a grid that needed one extra state there. Nothing failed,
 * nothing warned, and by the time it was visible there were three.
 *
 * So the rules below are asserted as rules, in a file named after them, rather
 * than left to be noticed. Each one is a thing that was ACTUALLY duplicated,
 * and a failure here is the second copy arriving.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer jwt" }),
}));

import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import { privatePlayerV2, publicRoundV2 } from "@/lib/ranked-public/fixtures";

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
const filesMatching = (re: RegExp) =>
  sourceFiles(ROOT)
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(ROOT.length + 1))
    .sort();

// ── A · the live Ranked route reaches the canonical arena ──────────────────

describe("the Ranked route renders through CanonicalArena", () => {
  it("wires /quiz/ranked → QuizRankedPage → QuizRankedMatch → CanonicalArena", () => {
    expect(read("App.tsx")).toMatch(/path="\/quiz\/ranked"[\s\S]{0,200}QuizRankedPage/);
    expect(read("pages/quiz-ranked/QuizRankedPage.tsx")).toContain("<QuizRankedMatch");
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx"))
      .toContain('from "@/components/ranked-arena/CanonicalArena"');
    expect(read("pages/quiz-ranked/QuizRankedMatch.tsx")).toContain("<CanonicalArena");
  });

  it("mounts the canonical shell and arena, not a page-local copy", async () => {
    const round = publicRoundV2();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.endsWith("/private") ? privatePlayerV2("userA")
        : url.endsWith("/resume") ? {
          schema_version: "ranked_duel.resume.v1", projection_type: "resume",
          match_id: "m1", server_time: round.server_time,
          payload: {
            match_status: "active", match_over: false,
            public: round, private: privatePlayerV2("userA"),
            progression_pending_players: [], progression_enabled: true,
            latest_resolved_round: null, result: null,
          },
        } : round;
      return new Response(JSON.stringify(body), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }));
    try {
      render(<QuizRankedMatch matchId="m1" viewerUserId="userA" />);
      // The shell — the thing that carries `.ranked-academy`, without which
      // half the arena's CSS silently does not apply.
      const shell = await waitFor(() => screen.getByTestId("quiz-ranked"));
      expect(shell.className).toContain("ranked-academy");
      expect(shell.className).toContain("ranked-shell");
      // …and the arena inside it.
      await waitFor(() => expect(screen.getByTestId("ranked-match")).toBeInTheDocument());
      expect(screen.getByTestId("ranked-header")).toBeInTheDocument();
      expect(screen.getByTestId("ranked-focus-column")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ── F · the styling context is arena infrastructure, not a thing to remember ─

describe("the .ranked-academy context is owned by the arena's shell", () => {
  it("is applied by ArenaShell, and nowhere a mode could forget it", () => {
    expect(
      filesMatching(/className=[^\n]*ranked-academy/),
      [
        "`.ranked-academy` is the context half the arena's CSS is written",
        "against — `.ranked-academy .ranked-folio`, `.ranked-header-plate`, the",
        "answer tablets. Applying it by hand is how the Daily Challenge ended up",
        "with three files using `ranked-folio` and no parchment. Render through",
        "CanonicalArena (which renders ArenaShell) instead.",
      ].join(" "),
    ).toEqual([
      "components/ranked-arena/ArenaShell.tsx",
      // The dev fixture bench mounts arena PARTS with no arena around them, so
      // it has to establish the context itself. It renders no match and reaches
      // no controller (see RankedArenaInspector.test).
      "pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx",
    ]);
  });

  it("CanonicalArena renders that shell itself, so it cannot be skipped", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    // Every exit path — terminal, empty, live — goes through it.
    expect(arena.match(/<ArenaShell/g) ?? []).toHaveLength(3);
    expect(arena).not.toContain("ranked-academy");   // it delegates, never inlines
  });
});

// ── E · one timeline presentation ──────────────────────────────────────────

describe("there is one arena timeline", () => {
  it("only RoundTimeline draws the round strip", () => {
    expect(
      filesMatching(/ranked-timeline/),
      "A second component started drawing the arena's progress strip. A finite"
      + " plan is a different VIEW MODEL, not a different renderer.",
    ).toEqual(["components/ranked-arena/RoundTimeline.tsx"]);
  });
});

// ── G · QuizRankedMatch must not grow an arena back ─────────────────────────

describe("the Ranked adapter holds no arena of its own", () => {
  const adapter = () => read("pages/quiz-ranked/QuizRankedMatch.tsx");

  it("renders none of the arena's structural regions itself", () => {
    const src = adapter();
    for (const marker of [
      'data-testid="ranked-header"',
      'data-testid="ranked-focus-column"',
      'data-testid="ranked-question"',
      'data-testid="ranked-abilities"',
      'data-testid="submission-status"',
      "grid-cols-[minmax(0,23fr)",
      "ranked-panel ranked-folio",
    ]) {
      expect(src, `the adapter re-grew the arena's "${marker}" region`)
        .not.toContain(marker);
    }
  });

  it("imports no arena presentation component except the arena itself", () => {
    const src = adapter();
    for (const forbidden of [
      "ranked-arena/CombatantPanel", "ranked-arena/RoundTimeline",
      "ranked-arena/AbilityTray", "ranked-arena/TimerDisplay",
      "ranked-arena/RoundResultBeat", "ranked-arena/SegmentResultBeat",
      "ranked-arena/SegmentTranscript", "ranked-arena/LevelUpPanel",
      "ranked-arena/MatchOverFrame", "ranked-arena/RevealPanel",
    ]) {
      expect(src, `${forbidden} belongs to the arena, not to the Ranked adapter`)
        .not.toContain(forbidden);
    }
    // The two it MAY use: the arena, and the shell for its non-arena states.
    expect(src).toContain("ranked-arena/CanonicalArena");
    expect(src).toContain("ranked-arena/ArenaShell");
  });

  it("stayed a controller: it still owns Ranked's own lifecycle", () => {
    const src = adapter();
    expect(src).toContain("useRankedMatch");
    expect(src).toContain("projectRoundTimeline");
    expect(src).toContain("rendererForSegment");
  });
});

// ── B/C · the arena depends on no mode ─────────────────────────────────────

describe("the arena knows about no mode", () => {
  it("CanonicalArena names no mode, and imports from no mode's page", () => {
    const arena = read("components/ranked-arena/CanonicalArena.tsx");
    // The import boundary itself is asserted for the whole layer in
    // `sharedLayer.boundary.test.ts`; this is the arena-specific half — a
    // branch on WHICH mode is rendering would be the fork starting again.
    for (const mode of [
      "@/pages/quiz-ranked", "@/pages/quiz-daily-challenge",
      "@/pages/dev/ranked-tutorial", "useRankedMatch", "useDailyChallengeRun",
      "tutorialMachine", "ranked-public/client",
    ]) {
      expect(arena, `CanonicalArena must not know about ${mode}`).not.toContain(mode);
    }
  });
});

// ── F · one click IS the answer, in every mode the arena serves ────────────

/**
 * THE SELECT → CONFIRM FLOW IS NOT REACHABLE (ARENA1 Phase 2 §4).
 *
 * `SubmissionReview` is the arena's "Lock in answer" strip. Production Ranked
 * stopped using it when clicking a tablet became the submission, and the
 * component survived only as a FIXTURE for two /dev pages — the arena inspector
 * and the staff duel prototype. That is a legitimate reason for it to exist and
 * a bad reason to delete it: it is a generic seam a future mode with a genuine
 * review step could want, and the standing rule is not to destroy one merely
 * because today's modes do not use it.
 *
 * What is asserted instead is the thing that matters: no PLAYER-FACING route
 * can reach it. If it ever appears in the arena, in Ranked's adapter, in the
 * Daily or in the Tutorial, this fails and the conversation happens before the
 * merge rather than after a player is asked to click twice.
 */
describe("no production mode offers a confirm step", () => {
  const CONFIRM_COMPONENT = /\bSubmissionReview\b/;

  it("only the /dev fixtures reach the confirm strip", () => {
    expect(filesMatching(CONFIRM_COMPONENT)).toEqual([
      "components/ranked-arena/SubmissionReview.tsx",         // the component
      "pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx",
      "pages/dev/ranked-duel-prototype/staff-duel/DuelArena.tsx",
    ]);
  });

  it("the arena and all three modes name no confirm control", () => {
    for (const file of [
      "components/ranked-arena/CanonicalArena.tsx",
      "components/ranked-arena/AnswerGrid.tsx",
      "components/question-surface/InteractiveScenarioSurface.tsx",
      "pages/quiz-ranked/QuizRankedMatch.tsx",
      "pages/quiz-daily-challenge/QuizDailyChallengePage.tsx",
      "pages/quiz-daily-challenge/dailyArenaView.ts",
      "pages/dev/ranked-tutorial/RankedTutorialPage.tsx",
    ]) {
      const src = read(file);
      expect(src, `${file} reached for the confirm strip`)
        .not.toMatch(CONFIRM_COMPONENT);
      // The strip's own words, in case it is reproduced rather than imported.
      expect(src, `${file} grew its own Lock In control`).not.toContain("Lock in answer");
    }
  });

  it("every mode withholds canChangeAnswer — there is no mind to change", () => {
    // The permission that a select→confirm flow would need. Ranked's projection
    // and the Daily's adapter both state it false explicitly; the Tutorial's
    // director inherits NO_INTERACTIONS. A mode that flipped it would be
    // introducing the second click this guard exists to prevent.
    expect(read("pages/quiz-daily-challenge/dailyArenaView.ts"))
      .toContain("canChangeAnswer: false");
    expect(read("pages/quiz-ranked/rankedViews.ts")).toContain("canChangeAnswer");
  });
});
