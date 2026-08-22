/**
 * MALT — the Timmy demo, and the one thing that actually matters about it:
 * that it cannot touch a real account.
 *
 * The isolation is STRUCTURAL, so it is asserted structurally. The fixtures
 * are frozen constants; the page passes them as props and passes no writer
 * down; and no production module imports the fixture file. A test that only
 * rendered the page would pass just as happily on a version that fetched.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const sfx = vi.hoisted(() => ({ play: vi.fn() }));

/**
 * PLAY1's sound layer, stubbed to a spy.
 *
 * The real `usePlaySfx` reads the app's one sound-settings store, which
 * constructs the Supabase client — and the pinned jsdom gives that client no
 * working Storage, so importing it turns a clean suite into one carrying an
 * unhandled rejection (see `src/test/localStorageStub.ts`). The gate itself is
 * covered by `src/lib/audio/play-sfx.test.ts`; here it is a spy, which is also
 * exactly what a test asserting "one action, one cue" wants.
 */
vi.mock("@/lib/audio/usePlaySfx", () => ({
  usePlaySfx: () => ({ play: sfx.play }),
}));

import LobbyPreviewPage from "./LobbyPreviewPage";
import {
  LOBBY_PREVIEW_STATES,
  TIMMY_MATCH_HISTORY,
  TIMMY_PROGRESSION,
  TIMMY_QUIZ_HISTORY,
  TIMMY_ROLE_MASTERY,
} from "./lobbyPreviewFixtures";
import { tallyRoleMastery } from "@/lib/ranked-public/roleRecords";
import { RANKED_ROLES } from "@/lib/ranked-public/roles";

afterEach(cleanup);

const SRC = resolve(__dirname, "../../..");

function everySourceFile(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) everySourceFile(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("Timmy demo — isolation from production state", () => {
  it("is imported by the preview page ALONE, so no product surface can reach it", () => {
    const importers = everySourceFile(SRC).filter((file) => {
      if (file.includes("lobby-preview")) return false;
      return /lobbyPreviewFixtures/.test(readFileSync(file, "utf8"));
    });
    expect(importers).toEqual([]);
  });

  it("performs no fetch, no write and no storage or auth access", () => {
    const sources = [
      readFileSync(resolve(__dirname, "lobbyPreviewFixtures.ts"), "utf8"),
      readFileSync(resolve(__dirname, "LobbyPreviewPage.tsx"), "utf8"),
    ].join("\n");
    for (const forbidden of [
      "fetch(", "axios", "supabase", "quizApi", "localStorage", "sessionStorage",
      "useAuth", "/api/",
    ]) {
      expect(sources).not.toContain(forbidden);
    }
  });

  it("hands the hub inert callbacks, so PLAY cannot start a real match", () => {
    render(
      <MemoryRouter>
        <LobbyPreviewPage />
      </MemoryRouter>,
    );
    // The seal is present and pressable, and pressing it does nothing at all
    // — there is no navigation and no queue behind it here.
    const play = screen.getByRole("button", { name: /^Play$/ });
    fireEvent.click(play);
    expect(screen.getByTestId("hero-display-name").textContent).toBe("Timmy");
  });
});

describe("the Role Mastery score is DEMO-ONLY", () => {
  it("is never passed by the real lobby", () => {
    // The product has no mastery score. The whole safety of showing one in
    // the preview rests on `Quiz.tsx` not passing the prop, so that is
    // asserted against the real page's source rather than trusted.
    const quiz = readFileSync(resolve(SRC, "pages/Quiz.tsx"), "utf8");
    expect(quiz).not.toContain("demoRoleMastery");
  });

  it("is SUPPLIED by the preview page alone; the hub only forwards it", () => {
    // Every other call site must be a pure pass-through of its own prop.
    // Anything else — a literal, a derivation, a fetched value — would be a
    // product surface inventing a score, which is the thing being prevented.
    const suppliers = everySourceFile(SRC)
      .filter((file) => !file.includes("lobby-preview") && !/\.test\.tsx?$/.test(file))
      .map((file) => [file, readFileSync(file, "utf8")] as const)
      .filter(([, src]) => /demoRoleMastery=\{/.test(src))
      .filter(([, src]) => !/demoRoleMastery=\{demoRoleMastery\}/.test(src));
    expect(suppliers.map(([f]) => f)).toEqual([]);

    // And the one forwarder is the hub, deliberately named so this test
    // fails loudly if the chain ever grows another link.
    const forwarders = everySourceFile(SRC)
      .filter((file) => !file.includes("lobby-preview") && !/\.test\.tsx?$/.test(file))
      .filter((file) => /demoRoleMastery=\{/.test(readFileSync(file, "utf8")))
      .map((file) => file.split("/").pop());
    expect(forwarders).toEqual(["LeaguecraftHub.tsx"]);
  });

  it("gives Timmy a score per role that agrees with the record beside it", () => {
    // A mastery score that contradicted the W-L printed next to it would
    // teach us nothing about the design, which is the demo's only job.
    const mastery = tallyRoleMastery(TIMMY_MATCH_HISTORY);
    const byScore = RANKED_ROLES.slice().sort(
      (a, b) => (TIMMY_ROLE_MASTERY[b]?.score ?? 0) - (TIMMY_ROLE_MASTERY[a]?.score ?? 0),
    );
    // The highest-scored role is also the one he has most games on.
    const byGames = RANKED_ROLES.slice().sort((a, b) => mastery[b]!.games - mastery[a]!.games);
    expect(byScore[0]).toBe(byGames[0]);
    expect(byScore[byScore.length - 1]).toBe(byGames[byGames.length - 1]);
  });

  it("covers all five roles, with scores that actually differ", () => {
    for (const role of RANKED_ROLES) expect(TIMMY_ROLE_MASTERY[role]).toBeDefined();
    const scores = RANKED_ROLES.map((r) => TIMMY_ROLE_MASTERY[r]!.score);
    expect(new Set(scores).size).toBe(RANKED_ROLES.length);
  });

  it("gives the NEWCOMER none, so the empty state is the real empty state", () => {
    expect(LOBBY_PREVIEW_STATES.newcomer.demoRoleMastery).toBeNull();
  });
});

describe("Timmy's study record — dense enough to judge, and self-consistent", () => {
  // The ledger exists to be read at real density, so the fixture has to REACH
  // real density. Four rows told us nothing about how ten rows sit together.
  it("fills the Free window exactly, rather than approximating it", () => {
    const h = TIMMY_QUIZ_HISTORY;
    expect(h.limited).toBe(true);
    expect(h.is_pro).toBe(false);
    // The window is the endpoint's own rule: a Free account is served its
    // most recent `free_limit` sessions. Ten rows, and the scope line above
    // them counts the same ten — a fixture serving any other number would
    // print a sentence its own rows contradict.
    expect(h.results.length).toBe(h.free_limit);
    expect(h.total_count).toBeGreaterThan(h.results.length);
  });

  it("states an accuracy every row can actually prove", () => {
    // The summary line averages these. If a row's percentage disagreed with
    // its own score the average would be unverifiable by eye, which is the
    // one thing this data exists to support.
    for (const r of TIMMY_QUIZ_HISTORY.results) {
      expect(Math.round(r.accuracy)).toBe(
        Math.round((r.score / r.total_questions) * 100),
      );
    }
  });

  it("varies enough to stress the ledger instead of repeating one row", () => {
    const rows = TIMMY_QUIZ_HISTORY.results;
    const acc = rows.map((r) => r.accuracy);
    // The full tint range: a strong session, a middling one, and a genuinely
    // rough one, so all three tones are on screen at once.
    expect(Math.max(...acc)).toBeGreaterThanOrEqual(90);
    expect(Math.min(...acc)).toBeLessThanOrEqual(30);
    expect(acc.some((a) => a > 30 && a < 90)).toBe(true);
    // Both modes the stream carries, plus a categoryless legacy backfill, so
    // the neutral fallback label is exercised rather than assumed.
    expect(rows.some((r) => r.mode === "daily")).toBe(true);
    expect(rows.some((r) => r.mode === "standard")).toBe(true);
    expect(rows.some((r) => !r.category)).toBe(true);
    // Question counts that are not all ten, and one row with no duration at
    // all — real history has them and the column must not collapse.
    expect(new Set(rows.map((r) => r.total_questions)).size).toBeGreaterThan(2);
    expect(rows.some((r) => r.duration_seconds == null)).toBe(true);
    expect(rows.some((r) => (r.duration_seconds ?? 0) > 300)).toBe(true);
    // Today through to weeks back, so the date column is exercised at both ends.
    const stamps = rows.map((r) => new Date(r.completed_at!).getTime());
    expect(Math.max(...stamps) - Math.min(...stamps)).toBeGreaterThan(
      20 * 24 * 60 * 60 * 1000,
    );
  });

  it("carries NO Ranked rows — Ranked history is Phase B", () => {
    // The Ranked duel writes none of these; it has its own contract. A Ranked
    // row here would put a record on screen that Phase A cannot serve.
    for (const r of TIMMY_QUIZ_HISTORY.results) {
      expect(r.mode).not.toBe("ranked");
      expect(String(r.category ?? "")).not.toMatch(/ranked/i);
    }
  });
});

describe("Timmy demo — an ESTABLISHED player, so the mature state is reviewable", () => {
  it("is out of placements, with a mid-ladder standing", () => {
    expect(LOBBY_PREVIEW_STATES.timmy.ranked.isPlaced).toBe(true);
    expect(LOBBY_PREVIEW_STATES.timmy.ranked.placementMatchesRemaining).toBe(0);
    expect(TIMMY_PROGRESSION.tier).toBe("gold");
  });

  it("has rows for ALL FIVE roles, with genuinely different records", () => {
    const mastery = tallyRoleMastery(TIMMY_MATCH_HISTORY);
    for (const role of RANKED_ROLES) expect(mastery[role]).toBeDefined();
    const winRates = RANKED_ROLES.map((r) => mastery[r]!.winRatePercent);
    // Five identical blocks would tell us nothing about how the ledger reads
    // when the numbers disagree, which is the whole point of the fixture.
    expect(new Set(winRates).size).toBeGreaterThan(3);
    const games = RANKED_ROLES.map((r) => mastery[r]!.games);
    expect(new Set(games).size).toBeGreaterThan(3);
  });

  it("fills the history window the real hub requests", () => {
    expect(TIMMY_MATCH_HISTORY.length).toBe(20);
    expect(TIMMY_MATCH_HISTORY.some((e) => e.viewerOutcome === "win")).toBe(true);
    expect(TIMMY_MATCH_HISTORY.some((e) => e.viewerOutcome === "loss")).toBe(true);
    expect(TIMMY_MATCH_HISTORY.some((e) => e.opponentIsBot)).toBe(true);
    // One row with no applied delta, because real history has them.
    expect(TIMMY_MATCH_HISTORY.some((e) => e.ratingDelta === null)).toBe(true);
  });

  it("is believable rather than elite", () => {
    const p = LOBBY_PREVIEW_STATES.timmy.progress;
    expect(Number(p.accuracy)).toBeGreaterThan(50);
    expect(Number(p.accuracy)).toBeLessThan(85);
    // A long-running account's best streak is well above its current one.
    expect(Number(p.best_streak)).toBeGreaterThan(Number(p.current_streak));
  });

  it("also offers the EMPTY state, so the lobby is judged in both", () => {
    expect(LOBBY_PREVIEW_STATES.newcomer.matchHistory).toHaveLength(0);
    expect(LOBBY_PREVIEW_STATES.newcomer.progression).toBeNull();
    expect(LOBBY_PREVIEW_STATES.newcomer.ranked.isPlaced).toBe(false);
  });
});
