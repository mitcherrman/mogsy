/**
 * HUB6.3G — the final Premium analytics polish, proven through the REAL page
 * (the Analytics Lab's HUB6.3C golden through the production parser) and,
 * where a state the lab does not hold is needed (a legacy `slice`, an
 * unknown strike limit, a null exposure count), through the same rooms fed a
 * copy of the lab's wire with only that field changed.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Page-level tests mount the whole lobby; under a full-suite run they need
// more than the 5s default.
vi.setConfig({ testTimeout: 60000 });

vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null, session: null }) }));

import LobbyPreviewPage from "./LobbyPreviewPage";
import QuestionContext, { contextSummary } from "@/components/quiz/workspace/analytics/QuestionContext";
import StandardRoom from "@/components/quiz/workspace/analytics/StandardRoom";
import SurvivalRoom, { stackLabels } from "@/components/quiz/workspace/analytics/SurvivalRoom";
import { WeakAreasRoom } from "@/components/quiz/workspace/analytics/ReviewRoom";
import { CohortProvider } from "@/components/quiz/workspace/analytics/population";
import { CompareBoard } from "@/components/quiz/workspace/analytics/trophies";
import { courseModules, courseSegments, questionContext, unitName } from "@/components/quiz/workspace/analytics/derive";
import { HistoryHighlightProvider } from "@/components/quiz/workspace/historyHighlight";
import { historyIconLabel } from "@/components/quiz/workspace/HistoryQuestionTimeline";
import { buildStageViewModel, stageCurrentFacts } from "@/components/quiz/workspace/historyViewModel";
import { dateBoundaryLabel, instantDateLabel, moduleName, planDateLabel } from "@/components/quiz/workspace/historyFormat";
import { readHistoryPage, type DailyHistoryRecord, type HistoryStage } from "@/lib/history/contracts";
import { ANALYTICS_LAB_GOLDEN } from "./history/analyticsLabSource";
import { ANALYTICS_LAB } from "./history/analyticsLabInput";

let coarse = false;
let width = 1200;
beforeEach(() => {
  coarse = false;
  width = 1200;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("pointer: coarse") ? coarse : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────── helpers

type Wire = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Every lab record, optionally from a wire copy changed by `mutate`. */
function records(mutate?: (item: Wire) => void): DailyHistoryRecord[] {
  return ANALYTICS_LAB_GOLDEN.scenarios.lab_premium.flatMap((page) => {
    const p = clone(page) as unknown as Wire & { items: Wire[] };
    if (mutate) p.items.forEach(mutate);
    return readHistoryPage(p).items;
  });
}
const runOf = (rs: DailyHistoryRecord[], n: number) => rs.find((r) => r.runId === `lab-run-${String(n).padStart(2, "0")}`)!;
const stageOf = (r: DailyHistoryRecord, kind: string) => r.stages.find((s) => s.kind === kind)!;
const isRun = (item: Wire, n: number) => item.run_id === `lab-run-${String(n).padStart(2, "0")}`;
const wireStage = (item: Wire, kind: string) => (item.stages as Wire[]).find((s) => s.kind === kind)!;

function Room({ children }: { children: React.ReactNode }) {
  return (
    <HistoryHighlightProvider>
      <CohortProvider>{children}</CohortProvider>
    </HistoryHighlightProvider>
  );
}

const runRows = () => screen.getAllByTestId("daily-run-row");
const stageRow = (run: HTMLElement, kind: string) =>
  within(run).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === kind)!;
const lit = (el: HTMLElement) => within(el).queryAllByTestId("timeline-icon").filter((i) => i.dataset.lit === "true");

async function openLab(entitlement: "premium" | "free" = "premium") {
  render(
    <MemoryRouter initialEntries={["/dev/lobby-preview"]}>
      <LobbyPreviewPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("lobby-preview-analyticsLab"));
  if (entitlement === "free") fireEvent.click(screen.getByTestId("lobby-preview-entitlement-free"));
  await waitFor(() => expect(runRows()).toHaveLength(10), { timeout: 20000 });
}
async function daily(n: number): Promise<HTMLElement> {
  const find = () => runRows().find((r) => within(r).getByTestId("daily-run-date").textContent === `Sep ${n}`);
  if (!find()) {
    fireEvent.click(screen.getByTestId("daily-history-load-more"));
    await waitFor(() => expect(find()).toBeTruthy());
  }
  return find()!;
}
async function overview(n: number, entitlement: "premium" | "free" = "premium") {
  await openLab(entitlement);
  const run = await daily(n);
  fireEvent.click(within(run).getByTestId("daily-analysis-toggle"));
  await waitFor(() => expect(within(run).getByTestId("daily-analytics-region")).toBeTruthy(), { timeout: 20000 });
  return run;
}
async function selectStage(run: HTMLElement, kind: string) {
  fireEvent.click(within(stageRow(run, kind)).getByTestId("stage-analysis-toggle"));
  await waitFor(() => expect(within(run).getByTestId("stage-analytics").dataset.stageKind).toBe(kind), { timeout: 20000 });
}
async function stageRoom(n: number, kind: string) {
  await openLab();
  const run = await daily(n);
  await selectStage(run, kind);
  return run;
}

const FORBIDDEN = /\bpp\b|settled|Learning signals?|Recurring weakness|Recovered|recovery rate|mastered|mastery|weak at|strong at|you are weak|you are strong|learning state|still learning/i;

// ─────────────────────────────────────────────────────────── A1 legacy slice

describe("A1 — a legacy `slice` is a Journey", () => {
  const legacy = () => {
    const rs = records((item) => {
      if (!isRun(item, 12)) return;
      const s = wireStage(item, "standard");
      for (const m of (s.modules as Wire[] | null) ?? []) if (m.unit === "journey") m.unit = "slice";
      for (const q of s.questions as Wire[]) if (q.unit === "journey") q.unit = "slice";
    });
    return { record: runOf(rs, 12), stage: stageOf(runOf(rs, 12), "standard") };
  };

  it("1. the raw value is kept; the course names it Journey, shapes it as a gate, with five children", () => {
    const { stage } = legacy();
    const mods = courseModules(stage);
    expect(mods[9].unit).toBe("slice");
    expect(mods[9].family).toBe("journey");
    expect(courseSegments(mods).map((g) => g.family)).toEqual(["splash", "meta_reflex", "splash", "meta_reflex", "journey"]);
    render(<Room><StandardRoom stage={stage} review={ANALYTICS_LAB.reviews[stage.reviewMatchId!] ?? null} /></Room>);
    const journey = screen.getAllByTestId("course-module")[9];
    expect(journey.dataset.unit).toBe("journey");
    expect(journey.dataset.rawUnit).toBe("slice");
    expect(journey.getAttribute("aria-label")).toMatch(/Journey, 5 of 5 correct/);
    fireEvent.focus(journey);
    expect(screen.getByTestId("course-detail").textContent).toMatch(/Module 10 · Journey/);
  });

  it("2. \"Slice\" can never be a module label — the course, the rail's label, the question context", () => {
    const { record, stage } = legacy();
    expect(unitName("slice")).toBe("Journey");
    expect(moduleName("slice")).toBe("Journey");
    const vm = buildStageViewModel(stage);
    expect(historyIconLabel(vm.rounds[9], 10)).toMatch(/Journey/);
    expect(historyIconLabel(vm.rounds[9], 10)).not.toMatch(/Slice/);
    const { container } = render(<Room><StandardRoom stage={stage} /></Room>);
    expect(container.textContent).not.toMatch(/\bSlice\b/);
    cleanup();
    render(<QuestionContext record={record} stage={stage} round={vm.rounds[9]} />);
    expect(screen.getByTestId("question-context-summary").textContent).toMatch(/Journey, 5 questions/);
    expect(document.body.textContent).not.toMatch(/\bSlice\b/);
  });
});

// ─────────────────────────────────────────────────────────── A2 / A5 strikes

describe("A2 / A5 — strikes are only ever the server's", () => {
  const survival = (mutate?: (s: Wire) => void) => {
    const rs = records((item) => {
      if (isRun(item, 11) && mutate) mutate(wireStage(item, "survival"));
    });
    return stageOf(runOf(rs, 11), "survival");
  };
  const unknownLimit = (s: Wire) => {
    (s.basic as Wire).max_strikes = null;
    ((s.ruleset as Wire).config as Wire).max_strikes = null;
    const facts = s.analytics as Wire | null;
    if (facts?.current) (facts.current as Wire).max_strikes = null;
  };

  it("3. an unknown max_strikes never becomes 3: no plates, no 'of 3', the facts that happened stay", () => {
    const stage = survival(unknownLimit);
    expect(stageCurrentFacts(stage).maxStrikes).toBeNull();
    render(<Room><SurvivalRoom stage={stage} /></Room>);
    const shaft = screen.getByTestId("survival-shaft");
    expect(within(shaft).queryAllByTestId("shield-plate")).toHaveLength(0);
    expect(within(shaft).getByTestId("strike-shield").dataset.max).toBeUndefined();
    expect(within(shaft).getByTestId("strike-count").textContent).toBe("3 strikes used");
    expect(screen.getByTestId("survival-room").textContent).not.toMatch(/of 3/);
    expect(within(shaft).getAllByTestId("shaft-strike").map((s) => s.dataset.depth)).toEqual(["24", "30", "33"]);
  });

  it("4. a known max_strikes draws its plates", () => {
    render(<Room><SurvivalRoom stage={survival()} /></Room>);
    const shaft = screen.getByTestId("survival-shaft");
    expect(within(shaft).getAllByTestId("shield-plate")).toHaveLength(3);
    expect(within(shaft).getAllByTestId("shield-plate").filter((p) => p.dataset.cracked === "true")).toHaveLength(3);
    expect(within(shaft).getByTestId("strike-count").textContent).toBe("3 of 3 strikes used");
  });

  it("8. strikes_used null stays unknown — never rebuilt from misses", () => {
    const stage = survival((s) => {
      (s.basic as Wire).strikes_used = null;
      const facts = s.analytics as Wire | null;
      if (facts?.current) (facts.current as Wire).strikes_used = null;
    });
    expect(stage.basic.depth).not.toBeNull();
    expect(stageCurrentFacts(stage).strikesUsed).toBeNull();
    // Even with no HUB6.3B/C facts at all (a HUB2.3 shape and no factual
    // strikes_used), nothing is counted.
    const bare: HistoryStage = { ...stage, basic: { ...stage.basic, depth: null, strikesUsed: null }, analytics: null };
    expect(stageCurrentFacts(bare).strikesUsed).toBeNull();
    render(<Room><SurvivalRoom stage={stage} /></Room>);
    expect(screen.queryByTestId("strike-count")).toBeNull();
    // The tower and shield say nothing of a count (the previous Survival's
    // own count may still appear in the comparison — that one is known).
    expect(screen.getByTestId("survival-shaft").textContent).not.toMatch(/strikes? used/i);
  });

  it("9. the exact strike markers still render from strike_index, on their own floors", () => {
    const stage = survival((s) => {
      (s.basic as Wire).strikes_used = null;
    });
    render(<Room><SurvivalRoom stage={stage} /></Room>);
    const tags = screen.getAllByTestId("shaft-strike");
    expect(tags.map((t) => [t.dataset.strike, t.dataset.depth])).toEqual([["1", "24"], ["2", "30"], ["3", "33"]]);
    expect(tags.map((t) => t.textContent)).toEqual(["Strike 1", "Strike 2", "Strike 3"]);
    expect(screen.getAllByTestId("strike-item").map((b) => b.dataset.position)).toEqual(["22", "28", "31"]);
  });
});

// ─────────────────────────────────────────────────────────── A3 cutoff

describe("A3 — the Weak Areas cutoff is a date, not an instant", () => {
  it("5. midnight-UTC Sep 14 reads Sep 14 in any timezone", () => {
    expect(dateBoundaryLabel("2026-09-14T00:00:00+00:00")).toMatch(/Sep 14/);
    expect(dateBoundaryLabel("2026-09-14")).toMatch(/Sep 14/);
    // The instant formatter it replaced reads the reader's timezone (Sep 13
    // anywhere west of Greenwich); this one reads the date part.
    expect(dateBoundaryLabel("2026-09-14T00:00:00+00:00")).toBe(planDateLabel("2026-09-14"));
    if (new Date("2026-09-14T00:00:00Z").getTimezoneOffset() > 0) {
      expect(instantDateLabel("2026-09-14T00:00:00+00:00")).toMatch(/Sep 13/);
    }
  });

  it("5b. the Weak Areas room prints the cutoff's own day", () => {
    const rs = records((item) => {
      if (!isRun(item, 14)) return;
      const facts = wireStage(item, "weak_areas").analytics as Wire;
      (facts.selection as Wire).evidence_cutoff = "2026-09-14T00:00:00+00:00";
    });
    const stage = stageOf(runOf(rs, 14), "weak_areas");
    render(<Room><WeakAreasRoom stage={stage} /></Room>);
    expect(screen.getByTestId("weak-areas-cutoff").textContent).toMatch(/^Sep 14$/);
  });
});

// ─────────────────────────────────────────────────────────── A4 prior exposures

describe("A4 — prior_exposures null is unknown, never 0", () => {
  const nulled = () => {
    let target = "";
    const rs = records((item) => {
      if (!isRun(item, 4)) return;
      const facts = wireStage(item, "time_trial").analytics as Wire;
      const first = (facts.question_history as Wire[])[0];
      first.prior_exposures = null;
      first.prior_correct = null;
      first.last_prior = null;
      target = first.question_result_id as string;
    });
    const record = runOf(rs, 4);
    const stage = stageOf(record, "time_trial");
    const vm = buildStageViewModel(stage);
    const round = vm.rounds.find((r) => r.occurrences.some((o) => o.occurrenceId === target))!;
    return { record, stage, round, occurrence: round.occurrences.find((o) => o.occurrenceId === target)! };
  };

  it("6. the parser keeps null", () => {
    const { occurrence } = nulled();
    expect(occurrence.priorHistory!.priorExposures).toBeNull();
    expect(occurrence.priorHistory!.priorCorrect).toBeNull();
  });

  it("7. a null exposure count never says 'First time'", () => {
    const { record, stage, round, occurrence } = nulled();
    const ctx = questionContext(record, stage, occurrence);
    expect(ctx.prior!.exposures).toBeNull();
    expect(contextSummary(ctx, "Time Trial")).not.toMatch(/First time/);
    render(<QuestionContext record={record} stage={stage} round={round} />);
    expect(screen.getByTestId("question-context").textContent).not.toMatch(/First time/);
    expect(screen.queryByTestId("question-context-prior")).toBeNull();
  });

  it("7b. an explicit 0 still says 'First time'", () => {
    const rs = records((item) => {
      if (!isRun(item, 4)) return;
      const facts = wireStage(item, "time_trial").analytics as Wire;
      const first = (facts.question_history as Wire[])[0];
      first.prior_exposures = 0;
      first.prior_correct = 0;
      first.last_prior = null;
    });
    const record = runOf(rs, 4);
    const stage = stageOf(record, "time_trial");
    const round = buildStageViewModel(stage).rounds.find((r) => r.occurrences.some((o) => o.priorHistory?.priorExposures === 0))!;
    render(<QuestionContext record={record} stage={stage} round={round} />);
    expect(screen.getByTestId("question-context-prior").textContent).toMatch(/First time this question appeared/);
  });
});

// ─────────────────────────────────────────────────────────── B Survival tower

describe("B — the Survival tower", () => {
  it("10. previous / average / deepest are ruled AND named; every lane label clears the next", async () => {
    const run = await stageRoom(11, "survival");
    const shaft = within(run).getByTestId("survival-shaft");
    for (const id of ["shaft-previous", "shaft-average", "shaft-deepest"]) {
      expect(within(shaft).getByTestId(id)).toBeTruthy();
      expect(within(shaft).getByTestId(`${id}-rule`)).toBeTruthy();
    }
    expect(within(shaft).getByTestId("shaft-previous").textContent).toMatch(/^Previous\d+$/);
    expect(within(shaft).getByTestId("shaft-average").textContent).toMatch(/^Average[\d.]+$/);
    expect(within(shaft).getByTestId("shaft-deepest").textContent).toMatch(/^Deepest\d+$/);
    const tops = [...shaft.querySelectorAll<HTMLElement>("[data-top]")].map((el) => Number(el.dataset.top)).sort((a, b) => a - b);
    expect(tops.length).toBeGreaterThanOrEqual(6);
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(22);
    // The tower keeps the exact strike floors and 33 answered floors.
    expect(within(shaft).getAllByTestId("shaft-floor")).toHaveLength(33);
  });

  it("10b. stackLabels never overlaps, however close the labels' floors", () => {
    const placed = stackLabels([{ at: 100 }, { at: 101 }, { at: 99 }, { at: 300 }, { at: 102 }]);
    for (let i = 1; i < placed.length; i++) expect(placed[i].top - placed[i - 1].top).toBeGreaterThanOrEqual(22 + 3);
    expect(placed[placed.length - 1].top).toBe(300 - 11);
  });

  it("22. locking a strike still pages the rail to its question", async () => {
    const run = await stageRoom(11, "survival");
    const item = within(run).getAllByTestId("strike-item")[2];
    fireEvent.click(item);
    await waitFor(() => expect(lit(stageRow(run, "survival")).map((i) => i.dataset.round)).toEqual(["31"]));
    expect(within(run).getByTestId("highlight-bar").textContent).toMatch(/Strike 3 · question 31/);
  });
});

// ─────────────────────────────────────────────────────────── C League art

describe("C — authoritative League art", () => {
  it("11–12. the Standard course wears the questions' proven art, grouped by segment; the Journey has five children", async () => {
    const run = await stageRoom(12, "standard");
    const course = within(run).getByTestId("standard-course");
    const arts = within(course).getAllByTestId("course-art");
    expect(arts).toHaveLength(10);
    expect(arts.filter((a) => a.dataset.art === "proven").length).toBeGreaterThan(0);
    // Meta Reflex never borrows a portrait: its module sigil.
    const modules = within(course).getAllByTestId("course-module");
    expect(within(modules[4]).getByTestId("course-art").dataset.art).toBe("sigil");
    expect(within(course).getAllByTestId("course-segment").map((g) => `${g.dataset.family}×${g.dataset.size}`)).toEqual([
      "splash×4", "meta_reflex×1", "splash×3", "meta_reflex×1", "journey×1",
    ]);
    expect(within(modules[9]).queryByTestId("course-children")).toBeNull();
    const children = within(modules[9].parentElement!).getByTestId("course-children");
    expect(children.dataset.count).toBe("5");
  });

  it("13. Review's three steps carry the exact questions' art — original and replay", async () => {
    const run = await stageRoom(14, "review");
    const link = within(run).getAllByTestId("review-link")[0];
    const arts = within(link).getAllByTestId("review-step-art");
    expect(arts).toHaveLength(2);
    expect(arts.filter((a) => a.dataset.art === "proven").length).toBeGreaterThan(0);
    // Still original → replay → result, in that order.
    const order = [...link.querySelectorAll("[data-testid^='review-link-']")].map((e) => e.getAttribute("data-testid"));
    expect(order.slice(0, 3)).toEqual(["review-link-source", "review-link-replay", "review-link-result"]);
  });
});

// ─────────────────────────────────────────────────────────── E one cohort control

describe("E — one cohort control, persisted", () => {
  it("14. exactly one cohort selector in the expanded Daily, defaulting to the last 28 days", async () => {
    const run = await overview(14);
    expect(within(run).getAllByTestId("cohort-toggle")).toHaveLength(1);
    expect(within(within(run).getByTestId("cohort-toggle")).getByText("Last 28 days").getAttribute("aria-pressed")).toBe("true");
    expect(within(within(run).getByTestId("mode-profile")).queryByTestId("cohort-toggle")).toBeNull();
    expect(within(within(run).getByTestId("core-population")).queryByTestId("cohort-toggle")).toBeNull();
  });

  it("15. the choice persists across Overview → Time Trial → Standard → Survival → Overview", async () => {
    const run = await overview(14);
    fireEvent.click(within(within(run).getByTestId("cohort-toggle")).getByText("Same day"));
    const pressed = () => within(within(run).getByTestId("cohort-toggle")).getByText("Same day").getAttribute("aria-pressed");
    for (const kind of ["time_trial", "standard", "survival"]) {
      await selectStage(run, kind);
      expect(within(run).getAllByTestId("cohort-toggle")).toHaveLength(1);
      expect(pressed()).toBe("true");
      expect(within(run).getByTestId("stage-population").querySelector("[data-cohort]")!.getAttribute("data-cohort")).toBe("same_day");
    }
    fireEvent.click(within(run).getByTestId("daily-overview-return"));
    await waitFor(() => expect(within(run).getByTestId("daily-overview")).toBeTruthy());
    expect(pressed()).toBe("true");
    expect(within(run).getByTestId("core-population").querySelector("[data-cohort]")!.getAttribute("data-cohort")).toBe("same_day");
  });
});

// ─────────────────────────────────────────────────────────── D mobile

describe("D — mobile compaction", () => {
  it("16. a narrow compare board is Current | Previous with each change under its figure", () => {
    width = 330;
    render(
      <CompareBoard
        currentTitle="Today"
        previousTitle="Previous Daily · Sep 13"
        current={[{ key: "correct", label: "Correct", value: "72 / 82" }, { key: "accuracy", label: "Accuracy", value: "88%" }]}
        previous={[{ key: "correct", label: "Correct", value: "84 / 91" }, { key: "accuracy", label: "Accuracy", value: "92%" }]}
        changes={[
          { text: "−12 correct", direction: "down", metric: "correct", testId: "c1" },
          { text: "9 fewer questions played", direction: "down", metric: "correct", testId: "c2" },
          { text: "88% vs 92% · 4 points lower", direction: "down", metric: "accuracy", testId: "c3" },
        ]}
        testId="board"
      />,
    );
    expect(screen.getByTestId("board").dataset.layout).toBe("narrow");
    const rows = screen.getAllByTestId("compare-row");
    expect(rows.map((r) => r.dataset.metric)).toEqual(["correct", "accuracy"]);
    expect(within(rows[0]).getByTestId("c1")).toBeTruthy();
    expect(within(rows[0]).getByTestId("c2")).toBeTruthy();
    expect(within(rows[1]).getByTestId("c3")).toBeTruthy();
    expect(rows[0].textContent).toMatch(/72 \/ 82.*84 \/ 91/);
    expect(screen.queryByTestId("compare-change")).toBeNull();
  });

  it("16b. a wide board keeps Today / Previous / Change", async () => {
    const run = await overview(14);
    const board = within(run).getByTestId("daily-compare");
    expect(board.dataset.layout).toBe("wide");
    for (const id of ["compare-current", "compare-previous", "compare-change"]) expect(within(board).getByTestId(id)).toBeTruthy();
  });

  it("17–18. the mode dials share one row (wrapping only when narrow), and records fill one row of 3 or 2", async () => {
    const run = await overview(14);
    const dials = within(run).getByTestId("mode-dials");
    expect(dials.className).toMatch(/\[@container\(min-width:16rem\)\]:grid-cols-3/);
    // Fluid dials fill their cell rather than forcing a fixed 94–104px.
    for (const svg of within(dials).getAllByRole("img")) expect((svg as unknown as SVGElement).style.width).toBe("100%");
    expect(within(within(run).getByTestId("core-records")).getByTestId("records-grid").className).toMatch(/grid-cols-2/);
    cleanup();
    const tt = await stageRoom(14, "time_trial");
    const grid = within(within(tt).getByTestId("stage-records")).getByTestId("records-grid");
    expect(grid.dataset.count).toBe("3");
    expect(grid.className).toMatch(/\[@container\(min-width:16rem\)\]:grid-cols-3/);
    expect(grid.className).not.toMatch(/auto-fit/);
  });
});

// ─────────────────────────────────────────────────────────── F labels

describe("F — no chart label can collide", () => {
  it("19. line charts carry no text inside the plot; the current value and rules are named above it", async () => {
    const run = await overview(14);
    const hist = within(run).getByTestId("core-history");
    expect(within(hist).getByTestId("history-line-scrubber").textContent).toBe("");
    expect(within(hist).getByTestId("line-key-current").textContent).toMatch(/This Daily\s*89%/);
    fireEvent.click(within(within(hist).getByTestId("history-metric")).getByText("Correct"));
    expect(within(hist).getByTestId("history-line-scrubber").textContent).toBe("");
    expect(within(hist).getByTestId("line-key-average").textContent).toMatch(/Your average/);
    expect(within(hist).getByTestId("line-key-record").textContent).toMatch(/Record/);
    // The histogram's only in-plot text is "You"; the median is in the key.
    const pop = within(run).getByTestId("core-population");
    expect(within(pop).getByTestId("population-distribution-scrubber").textContent).toBe("You");
    expect(within(pop).getByTestId("dist-key").textContent).toMatch(/Median/);
  });

  it("19b. the same holds in every stage history", async () => {
    for (const [n, kind] of [[14, "time_trial"], [12, "standard"], [11, "survival"]] as const) {
      const run = await stageRoom(n, kind);
      const hist = within(run).getByTestId("stage-history");
      for (const b of within(within(hist).getByTestId("history-metric")).getAllByRole("button")) {
        fireEvent.click(b);
        expect(within(hist).getByTestId("history-line-scrubber").textContent).toBe("");
      }
      cleanup();
    }
  });
});

// ─────────────────────────────────────────────────────────── G question context

describe("G — the question's History is discoverable in the Popover", () => {
  const l4 = () => {
    const rs = records();
    const record = runOf(rs, 4);
    const stage = stageOf(record, "time_trial");
    return { record, stage, round: buildStageViewModel(stage).rounds[1] };
  };

  it("20. fine pointer: a sticky History summary with the question's key fact; selecting it shows the section", () => {
    const { record, stage, round } = l4();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(<QuestionContext record={record} stage={stage} round={round} />);
    const summary = screen.getByTestId("question-context-summary");
    expect(summary.className).toMatch(/sticky/);
    expect(summary.className).toMatch(/bottom-\[-0\.875rem\]/);
    expect(summary.textContent).toMatch(/In your History/);
    expect(summary.textContent).toMatch(/Seen \d+ times? before/);
    fireEvent.click(summary);
    expect(scroll).toHaveBeenCalled();
  });

  it("20b. touch Sheet: unchanged — the plain heading, no sticky summary", () => {
    coarse = true;
    const { record, stage, round } = l4();
    render(<QuestionContext record={record} stage={stage} round={round} />);
    expect(screen.queryByTestId("question-context-summary")).toBeNull();
    expect(screen.getByTestId("question-context").textContent).toMatch(/^In your History/);
  });
});

// ─────────────────────────────────────────────────────────── H preview status

describe("H — a hover preview says what it lights", () => {
  it("21. preview → a temporary status; lock → the lock bar; Escape clears (23)", async () => {
    const run = await stageRoom(14, "time_trial");
    const donut = within(run).getByTestId("category-donut");
    const timeout = within(donut).getAllByTestId("donut-legend-outcome").find((b) => b.dataset.outcome === "timeout")!;
    act(() => timeout.focus());
    expect(screen.getByTestId("preview-status").textContent).toMatch(/Lighting 2 Time Trial questions/);
    // A preview never moves the page or locks anything.
    expect(within(run).queryByTestId("highlight-bar")).toBeNull();
    fireEvent.click(timeout);
    expect(screen.queryByTestId("preview-status")).toBeNull();
    expect(within(run).getByTestId("highlight-bar").textContent).toMatch(/Lighting 2 questions/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(run).queryByTestId("highlight-bar")).toBeNull();
    fireEvent.blur(timeout);
    expect(screen.queryByTestId("preview-status")).toBeNull();
  });

  it("21b. a run-wide preview names its rows", async () => {
    const run = await overview(14);
    const donut = within(run).getByTestId("daily-donut");
    const correct = within(donut).getAllByTestId("donut-legend-outcome").find((b) => b.dataset.outcome === "correct")!;
    act(() => correct.focus());
    expect(screen.getByTestId("preview-status").textContent).toMatch(/Lighting \d+ questions on 5 rows/);
    act(() => correct.blur());
    expect(screen.queryByTestId("preview-status")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── I / Review / wording

describe("I — Weak Areas simplified; no Review donut; no forbidden wording", () => {
  it("24. Weak Areas: the served questions with art, category and result — no donut, no invented provenance", async () => {
    const run = await stageRoom(14, "weak_areas");
    const room = within(run).getByTestId("weak-areas-room");
    expect(within(room).queryByTestId("category-donut")).toBeNull();
    expect(within(room).getAllByTestId("weak-areas-slot")).toHaveLength(4);
    expect(within(room).getAllByTestId("weak-areas-art")).toHaveLength(4);
    expect(within(room).getByTestId("weak-areas-tally").textContent).toMatch(/correct/);
    expect(room.textContent).toMatch(/the question this Weak Areas served/);
    expect(room.textContent).not.toMatch(/missed \d+ times|last missed|miss count|source question|led to this/i);
  });

  it("25. there is no Review donut in the launch UI", async () => {
    const run = await stageRoom(14, "review");
    expect(within(run).queryByTestId("review-donut")).toBeNull();
    expect(within(within(run).getByTestId("review-room")).queryAllByTestId("donut-legend-group")).toHaveLength(0);
    expect(within(within(run).getByTestId("review-room")).queryByRole("img", { name: /by result and source stage/i })).toBeNull();
  });

  it("26. Free Overview keeps this Daily's facts and one invitation; no room, no cohort control", async () => {
    const run = await overview(14, "free");
    expect(within(run).getByTestId("daily-free-facts").textContent).toMatch(/72 \/ 82.*88%.*15/);
    expect(within(run).queryByTestId("daily-overview")).toBeNull();
    expect(within(run).queryByTestId("cohort-toggle")).toBeNull();
  });

  it("28–30. no 'pp', no 'settled', no learning-state wording in any room", async () => {
    const run = await overview(14);
    const texts = [within(run).getByTestId("daily-analytics-region").textContent!];
    for (const kind of ["time_trial", "standard", "survival", "review", "weak_areas"]) {
      await selectStage(run, kind);
      texts.push(within(run).getByTestId("daily-analytics-region").textContent!);
    }
    for (const t of texts) expect(t).not.toMatch(FORBIDDEN);
  });
});
