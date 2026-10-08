/**
 * DRS1 — the Daily stage result is ONE frame, pending or settled.
 *
 * jsdom has no layout, so this pins the STRUCTURE the browser regression
 * (`e2e/nav1/daily-result-stability.spec.ts`) measures: every part that arrives
 * when the server states the result has a slot that is already there while the
 * result is pending, and the pending slots print no figure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildDailyStageResult } from "@/lib/daily-challenge/run/stageResultModel";
import { FOUR_STAGE_DAY, fixtureRun, wireResult } from "@/lib/daily-challenge/run/fixtures";
import { DailyStageChrome } from "./DailyStageChrome";
import { DailyStageResult } from "./DailyStageResult";

const SLOTS = [
  "daily-stage-result-snapshot-slot", "daily-stage-result-next-slot", "daily-stage-ladder",
  "daily-stage-result-continue",
];

function view(kind: number, settled: boolean) {
  const last = kind === 3;
  const stageOverrides: Record<number, Record<string, unknown>> = {
    [kind]: { status: settled ? "completed" : "in_progress", child_match_id: "m1",
      result: settled ? wireResult({ misses: kind === 3 ? 0 : 2 }) : null },
  };
  const run = fixtureRun(FOUR_STAGE_DAY, {
    status: settled && last ? "completed" : "active",
    current_stage_index: settled ? (last ? null : kind + 1) : kind,
  }, stageOverrides);
  return render(
    <MemoryRouter><DailyStageResult run={run} stage={run.stages[kind]} /></MemoryRouter>);
}

describe("DailyStageResult — one frame", () => {
  for (const kind of [0, 1, 2, 3]) {
    it(`stage ${kind}: every slot is mounted while pending, and again when settled`, () => {
      const pending = view(kind, false);
      for (const id of SLOTS) expect(screen.getByTestId(id), `pending: ${id}`).toBeInTheDocument();
      expect(screen.getByTestId("result-score-reserve")).toBeInTheDocument();
      pending.unmount();
      view(kind, true);
      for (const id of SLOTS) expect(screen.getByTestId(id), `settled: ${id}`).toBeInTheDocument();
      // The settled score REPLACES the reserve; nothing is drawn twice.
      expect(screen.queryByTestId("result-score-reserve")).toBeNull();
      expect(screen.getByTestId("daily-stage-result-correct")).toBeInTheDocument();
    });
  }

  it("a pending result prints no figure: the reserve is invisible, aria-hidden and blank", () => {
    view(1, false);
    const reserve = screen.getByTestId("result-score-reserve");
    expect(reserve).toHaveAttribute("aria-hidden", "true");
    expect(reserve.className).toContain("invisible");
    expect(reserve.textContent?.trim()).toBe("");
    const slot = screen.getByTestId("daily-stage-result-snapshot-slot");
    expect(within(slot).queryByTestId("result-snapshot")).toBeNull();
    expect(within(slot).getByTestId("daily-stage-result-scoring")).toHaveTextContent("Scoring stage…");
    expect(screen.getByTestId("daily-stage-result-continue")).toBeDisabled();
  });

  it("a Review states its one headline while pending, so a wrapped headline is not new", () => {
    const run = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 3 },
      { 3: { status: "in_progress", child_match_id: "m1" } });
    const pending = buildDailyStageResult(run, run.stages[3]);
    const settledRun = fixtureRun(FOUR_STAGE_DAY, { status: "completed", current_stage_index: null },
      { 3: { status: "completed", child_match_id: "m1", result: wireResult({ misses: 0 }) } });
    expect(pending.headline).toBe(buildDailyStageResult(settledRun, settledRun.stages[3]).headline);
    // Every other kind keeps the neutral one-liner (its headline depends on how it ended).
    const std = fixtureRun(FOUR_STAGE_DAY, {}, { 0: { status: "in_progress", child_match_id: "m1" } });
    expect(buildDailyStageResult(std, std.stages[0]).headline).toBe("Stage over");
  });

  it("holds the snapshot floor for every stage kind, and reserves nothing anywhere else", () => {
    const src = readFileSync(resolve(process.cwd(),
      "src/pages/quiz-daily-challenge/run/DailyStageResult.tsx"), "utf-8");
    for (const kind of ["review", "standard", "weak_areas", "order_forge", "time_trial", "survival"]) {
      expect(src).toMatch(new RegExp(`${kind}: "min-h-\\[[\\d.]+rem\\] sm:min-h-\\[[\\d.]+rem\\]"`));
    }
    expect(src).not.toMatch(/ResizeObserver|getBoundingClientRect|offsetHeight/);
    // Opt-in only: nothing but the Daily result asks for the reserves.
    const hero = readFileSync(resolve(process.cwd(), "src/components/game-results/ResultHero.tsx"), "utf-8");
    expect(hero).toContain("reserveScore = false");
    const tag = readFileSync(resolve(process.cwd(), "src/pages/quiz-daily-challenge/run/StageTag.tsx"), "utf-8");
    expect(tag).toContain("reserveMarks = false");
  });

  it("Survival's chrome keeps its answered count when the live status is dropped at the result", () => {
    const live = { answered: 4, strikesUsed: 1, maxStrikes: 3 } as never;
    const running = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 2 },
      { 2: { status: "in_progress", child_match_id: "m1" } });
    // while settling: the child's own report
    render(<MemoryRouter><DailyStageChrome run={running} stage={running.stages[2]} survival={live} /></MemoryRouter>);
    expect(screen.getByTestId("daily-survival-answered")).toHaveTextContent("4 answered");
  });

  it("…falls back to THIS stage's own stated result, and prints nothing it was not told", () => {
    const done = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 3 },
      { 2: { status: "completed", child_match_id: "m1", result: wireResult({ answered: 9 }) } });
    const view = render(<MemoryRouter><DailyStageChrome run={done} stage={done.stages[2]} survival={null} /></MemoryRouter>);
    expect(screen.getByTestId("daily-survival-answered")).toHaveTextContent("9 answered");
    view.unmount();
    // a stage with no result and no live status states no count (never carried over)
    const fresh = fixtureRun(FOUR_STAGE_DAY, { current_stage_index: 2 },
      { 2: { status: "in_progress", child_match_id: "m1" } });
    render(<MemoryRouter><DailyStageChrome run={fresh} stage={fresh.stages[2]} survival={null} /></MemoryRouter>);
    expect(screen.queryByTestId("daily-survival-answered")).toBeNull();
  });
});
