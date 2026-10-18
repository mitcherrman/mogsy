/**
 * MISC W3A (F05) — the Daily result's compact density, pinned structurally.
 *
 * jsdom has no layout, so the MEASURED claims live in the browser check
 * (`e2e/misc-w3a`). This file pins what CAN be pinned without layout, and the
 * things a browser check would not catch:
 *
 *   - the density strings are valid Tailwind (an arbitrary variant with a typo
 *     compiles to NOTHING and silently stops compacting) — compiled for real;
 *   - density only: no class that hides, clips or truncates content;
 *   - the closed discovery slot's margin cancels exactly the frame's gap, in
 *     every tier (otherwise opening it would jump);
 *   - each result frame wears the density, the snapshot floor is a function of
 *     the stage KIND (so pending and settled share one frame), and the `sm`
 *     floors are exactly what they were;
 *   - DOM order — the focus order — is the one the page always had;
 *   - the controls still work, and every action stays a 44px target.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { V5_ELIGIBLE_DAY, FOUR_STAGE_DAY, fixtureRun, fixtureV5Run, wireResult } from "@/lib/daily-challenge/run/fixtures";
import type { DailyStage } from "@/lib/daily-challenge/run/contracts";
import * as density from "./dailyResultDensity";
import { DailyCompletion } from "./DailyCompletion";
import { DailyMainResult } from "./DailyMainResult";
import { DailyStageResult } from "./DailyStageResult";

vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn(), stop: vi.fn(), preload: vi.fn() }) }));

afterEach(cleanup);

const STRINGS: Record<string, string> = Object.fromEntries(
  Object.entries(density).filter(([, v]) => typeof v === "string"),
) as Record<string, string>;
const TOKENS = Object.values(STRINGS).flatMap((s) => s.split(/\s+/)).filter(Boolean);

describe("the density strings", () => {
  it("are all real Tailwind, FOUND BY THE SCANNER: every token compiles to CSS from the file's own text", async () => {
    // Tailwind generates a class only if it is written out in a scanned file.
    // Content here is this module's SOURCE, so a class built with a template
    // (never generated) or with a typo (invalid variant) is named below.
    const raw = readFileSync(resolve(process.cwd(), "src/pages/quiz-daily-challenge/run/dailyResultDensity.ts"), "utf-8");
    const css = (await postcss([tailwind({
      content: [{ raw, extension: "ts" }],
      corePlugins: { preflight: false },
      theme: { extend: {} },
    })]).process("@tailwind utilities;", { from: undefined })).css;
    const escaped = (t: string) => t.replace(/([^a-zA-Z0-9_-])/g, String.raw`\$1`);
    const missing = [...new Set(TOKENS)].filter((t) => !css.includes(`.${escaped(t)}`));
    expect(missing).toEqual([]);
  });

  it("only change density: nothing hides, clips, truncates or removes from the flow", () => {
    const forbidden = /^(hidden|invisible|sr-only|truncate|line-clamp-\d+|overflow-(hidden|clip)|max-h-.+|h-0|opacity-0|contents)$/;
    // The utility itself: what follows the last variant (`…]:` or `max-sm:`).
    const utility = (t: string) => t.slice(t.lastIndexOf("]:") >= 0 ? t.lastIndexOf("]:") + 2 : t.lastIndexOf(":") + 1);
    const offenders = TOKENS.filter((t) => forbidden.test(utility(t)));
    expect(offenders).toEqual([]);
  });

  it("cancel the frame's gap exactly, in every tier", () => {
    const gap = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[1]);
    // `gap-4 max-sm:gap-3 [@media(...)]:gap-2` ↔ `-mt-4 max-sm:-mt-3 [@media(...)]:-mt-2`
    expect(gap(density.RESULT_FRAME_GAP, /gap-(\d)/g))
      .toEqual(gap(density.RESULT_GAP_CANCEL, /-mt-(\d)/g));
  });

  it("never touch the sm+ layout: every override is scoped to a phone or a short viewport", () => {
    for (const [name, value] of Object.entries(STRINGS)) {
      if (name === "TOUCH_TARGET") continue;
      for (const t of value.split(/\s+/)) {
        if (/^gap-4$|^-mt-4$/.test(t)) continue; // the existing default
        expect(t, `${name}: ${t}`).toMatch(/^(max-sm:|\[@media\(max-height:540px\)\]:)/);
      }
    }
  });
});

const PHONE_FLOOR: Record<DailyStage["kind"], string> = {
  review: "min-h-[4.25rem]", standard: "min-h-[10rem]", weak_areas: "min-h-[10rem]",
  order_forge: "min-h-[10rem]", time_trial: "min-h-[9rem]", survival: "min-h-[9rem]",
};
/** The `sm` floors DRS1 measured — F05 must not move them. */
const SM_FLOOR: Record<DailyStage["kind"], string> = {
  review: "sm:min-h-[4.75rem]", standard: "sm:min-h-[6rem]", weak_areas: "sm:min-h-[6rem]",
  order_forge: "sm:min-h-[6rem]", time_trial: "sm:min-h-[11rem]", survival: "sm:min-h-[11rem]",
};

function stageView(kind: DailyStage["kind"], settled = true) {
  // A v5 run's main pair exists exactly when Standard is completed, so a
  // pending Standard is only drawn by a legacy (v1) day.
  const specs = kind === "standard" ? FOUR_STAGE_DAY : V5_ELIGIBLE_DAY;
  const idx = specs.findIndex((s) => s.kind === kind);
  const over: Record<number, Record<string, unknown>> = {};
  specs.forEach((s, i) => {
    if (i < idx || (i === idx && settled)) {
      over[i] = { status: "completed", child_match_id: `m${i}`, result: wireResult({ ended_by: "time_bank_exhausted" }) };
    } else if (i === idx) over[i] = { status: "in_progress", child_match_id: `m${i}` };
  });
  const current = settled ? Math.min(idx + 1, specs.length - 1) : idx;
  const run = kind === "standard"
    ? fixtureRun(FOUR_STAGE_DAY, { current_stage_index: current }, over)
    : fixtureV5Run(specs, {
      current_stage_index: current, main_completed_at: "2026-10-17T12:00:00Z", main_score: 1234,
    }, over);
  return { run, stage: run.stages[idx] };
}

describe("the stage result frame", () => {
  for (const kind of ["review", "standard", "weak_areas", "time_trial", "survival"] as const) {
    it(`${kind}: phone floor re-measured, sm floor unchanged, one layout pending and settled`, () => {
      const classes: string[] = [];
      for (const settled of [false, true]) {
        const { run, stage } = stageView(kind, settled);
        const { unmount } = render(
          <MemoryRouter><DailyStageResult run={run} stage={stage} onDone={() => {}} /></MemoryRouter>);
        const slot = screen.getByTestId("daily-stage-result-snapshot-slot");
        classes.push(slot.className);
        expect(slot.className).toContain(PHONE_FLOOR[kind]);
        expect(slot.className).toContain(SM_FLOOR[kind]);
        const frame = screen.getByTestId("daily-stage-result");
        expect(frame.className).toContain("max-sm:gap-3");
        expect(frame.className).toContain("max-sm:[&_[data-testid=result-hero]]:py-4");
        unmount();
      }
      // Settling fills the slot; it must not change the slot's layout (DRS1).
      expect(classes[0]).toBe(classes[1]);
    });
  }

  it("three- and five-tile kinds go to three phone columns; four-tile kinds stay two", () => {
    const cols3 = "max-sm:[&_[data-testid=result-snapshot]>div]:grid-cols-3";
    for (const [kind, three] of [["review", true], ["time_trial", true], ["survival", true],
      ["standard", false], ["weak_areas", false]] as const) {
      const { run, stage } = stageView(kind);
      const { unmount } = render(
        <MemoryRouter><DailyStageResult run={run} stage={stage} onDone={() => {}} /></MemoryRouter>);
      expect(screen.getByTestId("daily-stage-result-snapshot-slot").className.includes(cols3), kind).toBe(three);
      unmount();
    }
  });

  it("keeps the page's DOM (focus) order: tag, hero, snapshot, up next, ladder, actions", () => {
    const { run, stage } = stageView("time_trial");
    render(<MemoryRouter><DailyStageResult run={run} stage={stage} onProceed={() => {}} onDone={() => {}}
      onMoreChallenges={() => {}} /></MemoryRouter>);
    const order = [
      screen.getAllByTestId("daily-stage-tag")[0], screen.getByTestId("result-hero"),
      screen.getByTestId("daily-stage-result-snapshot-slot"), screen.getByTestId("daily-stage-result-next-slot"),
      screen.getByTestId("daily-section-ladder"), screen.getByTestId("result-actions"),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `#${i}`)
        .toBeTruthy();
    }
    const buttons = within(screen.getByTestId("result-actions")).getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Continue", "More Challenges", "Done for now"]);
  });

  it("an error keeps its alert and a 44px Try again", () => {
    const { run, stage } = stageView("time_trial");
    const retry = vi.fn();
    render(<MemoryRouter><DailyStageResult run={run} stage={stage} error="Nope" onRetry={retry}
      onProceed={() => {}} /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
    const btn = screen.getByTestId("daily-run-retry");
    expect(btn.className).toContain("min-h-[44px]");
    fireEvent.click(btn);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("the main result frame", () => {
  const settledMain = () => {
    const run = fixtureV5Run(V5_ELIGIBLE_DAY, { current_stage_index: 1, main_completed_at: "2026-10-17T12:00:00Z", main_score: 1234 },
      { 0: { status: "completed", child_match_id: "m0", result: wireResult({ correct: 9, answered: 10, misses: 1 }) } });
    return { run, stage: run.stages[0] };
  };

  it("wears the density; the snapshot is one row of three on a phone; sm floor unchanged", () => {
    const { run, stage } = settledMain();
    render(<MemoryRouter><DailyMainResult run={run} stage={stage} onDone={() => {}} onProceed={() => {}} /></MemoryRouter>);
    const slot = screen.getByTestId("daily-main-result-snapshot-slot");
    expect(slot.className).toContain("min-h-[5.5rem]");
    expect(slot.className).toContain("sm:min-h-[6rem]");
    expect(slot.className).toContain("max-sm:[&_[data-testid=result-snapshot]>div]:grid-cols-3");
    expect(screen.getByTestId("daily-main-result").className).toContain("max-sm:gap-3");
  });

  it("keeps the order — tag, hero, snapshot, optional, actions — and every control working", () => {
    const { run, stage } = settledMain();
    const proceed = vi.fn(); const done = vi.fn();
    render(<MemoryRouter><DailyMainResult run={run} stage={stage} onDone={done} onProceed={proceed} /></MemoryRouter>);
    const order = [
      screen.getAllByTestId("daily-stage-tag")[0], screen.getByTestId("result-hero"),
      screen.getByTestId("daily-main-result-snapshot-slot"), screen.getByTestId("daily-main-optional"),
      screen.getByTestId("result-actions"),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `#${i}`)
        .toBeTruthy();
    }
    fireEvent.click(screen.getByTestId("daily-main-continue"));
    fireEvent.click(screen.getByTestId("daily-done-for-now"));
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("the final completion", () => {
  const complete = (legacy: boolean, perfect: boolean) => {
    const specs = legacy ? FOUR_STAGE_DAY : V5_ELIGIBLE_DAY;
    const over: Record<number, Record<string, unknown>> = {};
    specs.forEach((s, i) => {
      over[i] = perfect && s.kind === "review"
        ? { status: "skipped", result: null }
        : { status: "completed", child_match_id: `m${i}`, result: wireResult() };
    });
    const base = { status: "completed", outcome: perfect ? "perfect" : "reviewed", current_stage_index: specs.length - 1 };
    return legacy ? fixtureRun(specs, base, over)
      : fixtureV5Run(specs, { ...base, main_completed_at: "2026-10-17T12:00:00Z", main_score: 1234 }, over);
  };

  it("no longer forces a 70vh floor on a phone, and its two links are 44px targets", () => {
    render(<MemoryRouter><DailyCompletion run={complete(false, true)} /></MemoryRouter>);
    const section = screen.getByTestId("daily-run-complete");
    expect(section.getAttribute("style") ?? "").not.toContain("min-height");
    expect(section.className).toContain("sm:min-h-[min(70vh,38rem)]");
    expect(section.className).toContain("py-5");
    expect(section.className).toContain("sm:py-10");
    for (const id of ["daily-run-more-challenges", "daily-run-home"]) {
      expect(screen.getByTestId(id).className, id).toContain("min-h-[44px]");
    }
  });

  it("states every fact it did: the title, the perfect line, each stage's numbers and both exits", () => {
    for (const legacy of [false, true]) {
      for (const perfect of [false, true]) {
        const { unmount } = render(<MemoryRouter><DailyCompletion run={complete(legacy, perfect)} /></MemoryRouter>);
        expect(screen.getByTestId("daily-run-complete-title")).toBeInTheDocument();
        expect(screen.queryByTestId("daily-run-perfect") !== null).toBe(perfect);
        expect(within(screen.getByTestId("daily-run-recap")).getAllByTestId(/^daily-recap-\d+$/).length)
          .toBeGreaterThanOrEqual(legacy ? 4 : 5);
        expect(screen.getByTestId("daily-run-home")).toHaveAttribute("href", "/quiz");
        expect(screen.queryByTestId("daily-run-more-challenges") !== null).toBe(!legacy);
        unmount();
      }
    }
  });
});
