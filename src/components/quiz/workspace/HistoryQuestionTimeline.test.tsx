/**
 * HUB6.3D — History's persistent question timeline, its view model and its
 * cross-highlight. Real Analytics Lab stages (HUB6.3B golden → production
 * parser) drive every case; nothing is hand-built.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import QuestionTimeline from "@/components/quiz/workspace/QuestionTimeline";
import HistoryQuestionTimeline, {
  HISTORY_GEOMETRY,
  historyIconLabel,
  historyPageSize,
} from "@/components/quiz/workspace/HistoryQuestionTimeline";
import { buildStageViewModel, type StageViewModel } from "@/components/quiz/workspace/historyViewModel";
import {
  HistoryHighlightProvider,
  categoryHighlight,
  occurrenceHighlight,
  outcomeHighlight,
  useHistoryHighlight,
  useStageHighlight,
  type HistoryHighlight,
} from "@/components/quiz/workspace/historyHighlight";
import { readHistoryPage, type DailyHistoryRecord, type HistoryStage } from "@/lib/history/contracts";
import { ANALYTICS_LAB_GOLDEN } from "@/pages/dev/lobby-preview/history/analyticsLabSource";

const records = (scenario: "lab_premium" | "lab_free" = "lab_premium") =>
  ANALYTICS_LAB_GOLDEN.scenarios[scenario].flatMap((p) => readHistoryPage(p).items as DailyHistoryRecord[]);
const stageOf = (run: number, kind: string, scenario?: "lab_premium" | "lab_free"): HistoryStage =>
  records(scenario)
    .find((r) => r.runId === `lab-run-${String(run).padStart(2, "0")}`)!
    .stages.find((s) => s.kind === kind)!;

let coarse = false;
let width = 0;
beforeEach(() => {
  coarse = false;
  width = 0;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Timeline({ stage, size = "row", highlight = null }: {
  stage: HistoryStage; size?: "row" | "selected"; highlight?: ReadonlySet<string> | null;
}) {
  const vm = buildStageViewModel(stage);
  return (
    <HistoryQuestionTimeline
      roundCount={vm.rounds.length}
      review={null}
      matchId="m"
      mode={{ rounds: vm.rounds, size, highlight }}
    />
  );
}

const icons = () => screen.getAllByTestId("timeline-icon");

// ─────────────────────────────────────────────────────────── view model

describe("history view model", () => {
  it("one position per round; occurrence ids are the DTO's and unique", () => {
    const s = stageOf(3, "standard");
    const vm = buildStageViewModel(s);
    expect(vm.rounds).toHaveLength(10);
    const ids = vm.rounds.flatMap((r) => r.occurrences.map((o) => o.occurrenceId));
    expect(new Set(ids).size).toBe(s.questions.length);
    expect(ids).toEqual(expect.arrayContaining(s.questions.map((q) => q.questionResultId!)));
  });

  it("a module's verdict is never rounded in the reader's favour", () => {
    const vm = buildStageViewModel(stageOf(3, "standard"));
    for (const r of vm.rounds.filter((x) => x.occurrences.length > 1)) {
      const known = r.correct + r.incorrect + r.timeout;
      if (r.correct === known) expect(r.verdict).toBe("correct");
      else expect(r.verdict).not.toBe("correct");
    }
  });

  it("hover data: public category, outcome, stage category C/played, exact-question prior history", () => {
    const vm = buildStageViewModel(stageOf(9, "time_trial"));
    const o = vm.rounds[0].occurrences[0];
    expect(o.publicCategory?.label).toBeTruthy();
    expect(["correct", "incorrect", "timeout"]).toContain(o.outcome);
    expect(o.stageCategory!.questionsPlayed).toBeGreaterThanOrEqual(1);
    expect(o.priorHistory).not.toBeNull();
    expect(o.priorHistory!.priorExposures).toBeGreaterThanOrEqual(0);
    // Somewhere in nine earlier Dailies a question repeats with a dated last outcome.
    const all = [...vm.byOccurrence.values()];
    expect(all.some((x) => x.priorHistory?.lastPrior?.completedAt)).toBe(true);
  });

  it("Survival strikes and Review sources reach their occurrences", () => {
    const surv = buildStageViewModel(stageOf(1, "survival"));
    expect([...surv.byOccurrence.values()].filter((o) => o.strikeIndex !== null).map((o) => o.strikeIndex).sort()).toEqual([1, 2, 3]);
    const review = buildStageViewModel(stageOf(4, "review"));
    expect([...review.byOccurrence.values()].every((o) => o.reviewSource?.runId === "lab-run-04")).toBe(true);
  });

  it("the Free view model carries the same outcomes and categories", () => {
    const free = buildStageViewModel(stageOf(5, "time_trial", "lab_free"));
    const premium = buildStageViewModel(stageOf(5, "time_trial"));
    expect(free.rounds.map((r) => r.verdict)).toEqual(premium.rounds.map((r) => r.verdict));
    expect([...free.byOccurrence.values()].every((o) => o.priorHistory === null)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────── the track

describe("History timeline — fit and paging", () => {
  it("unmeasured, it shows every question: no cap of five", () => {
    render(<Timeline stage={stageOf(4, "time_trial")} />);
    expect(icons()).toHaveLength(28);
    expect(screen.queryByTestId("timeline-pager")).toBeNull();
  });

  it("page size follows the width; paging only when needed", () => {
    const g = HISTORY_GEOMETRY.fine.row;
    expect(historyPageSize(10, 700, 1, g)).toMatchObject({ pageSize: 10, paged: false });
    const wide = historyPageSize(28, 700, 1, g);
    expect(wide.paged).toBe(true);
    expect(wide.pageSize).toBeGreaterThan(5);
    expect(historyPageSize(28, 1400, 1, g)).toMatchObject({ pageSize: 28, paged: false });
    // 200% text: half as many fit.
    expect(historyPageSize(28, 700, 2, g).pageSize).toBeLessThan(wide.pageSize);
  });

  it("a measured row pages, and every question is reachable", () => {
    width = 420;
    render(<Timeline stage={stageOf(4, "time_trial")} />);
    const track = screen.getByTestId("question-timeline");
    expect(track.dataset.paged).toBe("true");
    const size = Number(track.dataset.pageSize);
    expect(size).toBeGreaterThan(5);
    const seen = new Set<number>();
    for (let guard = 0; guard < 10; guard++) {
      for (const i of icons()) seen.add(Number(i.dataset.round));
      const next = screen.getByTestId("timeline-next") as HTMLButtonElement;
      if (next.disabled) break;
      fireEvent.click(next);
    }
    expect(seen.size).toBe(28);
  });

  it("a narrow touch row keeps every icon the line holds, with the pager on its own line", () => {
    const g = HISTORY_GEOMETRY.coarse.row;
    // A 320px phone's stacked rail: four 44px icons fit; two inline arrows
    // would have left room for two.
    expect(historyPageSize(28, 230, 1, g)).toEqual({ pageSize: 4, paged: true, stackedPager: true, rangeLabel: true });
    // 200% text on the same phone: one icon a page, and no room for the label.
    expect(historyPageSize(28, 191, 2, g)).toMatchObject({ stackedPager: true, rangeLabel: false });
    coarse = true;
    width = 230;
    render(<Timeline stage={stageOf(4, "time_trial")} />);
    expect(screen.getByTestId("question-timeline").dataset.pager).toBe("stacked");
    expect(icons()).toHaveLength(4);
    expect(screen.getByTestId("timeline-range").textContent).toBe("1–4 of 28");
    fireEvent.click(screen.getByTestId("timeline-next"));
    expect(screen.getByTestId("timeline-range").textContent).toBe("5–8 of 28");
  });

  it("the selected row's icons are larger than an unselected row's", () => {
    const { unmount } = render(<Timeline stage={stageOf(4, "time_trial")} />);
    const row = parseFloat(icons()[0].style.width);
    unmount();
    render(<Timeline stage={stageOf(4, "time_trial")} size="selected" />);
    expect(parseFloat(icons()[0].style.width)).toBeGreaterThan(row);
    expect(row * 16).toBeGreaterThan(28); // larger than the Ranked 28px tile
  });

  it("touch: 44px icons and 44px arrows", () => {
    coarse = true;
    width = 320;
    render(<Timeline stage={stageOf(4, "time_trial")} />);
    expect(parseFloat(icons()[0].style.width) * 16).toBeGreaterThanOrEqual(44);
    const next = screen.getByTestId("timeline-next");
    expect(parseFloat(next.style.width)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(next.style.height)).toBeGreaterThanOrEqual(44);
  });
});

describe("History timeline — results, never colour alone", () => {
  it("correct ✓, incorrect ×, timeout clock with a dashed ring — from the DTO, before any review", () => {
    render(<Timeline stage={stageOf(5, "time_trial")} />);
    const byOutcome = (o: string) => icons().filter((i) => i.dataset.outcome === o);
    for (const o of ["correct", "incorrect", "timeout"]) {
      const icon = byOutcome(o)[0];
      expect(icon).toBeTruthy();
      expect(icon.dataset.loaded).toBe("false");
      const badge = within(icon).getByTestId("timeline-badge");
      expect(badge.dataset.badge).toBe(o);
      expect(badge.querySelector("svg")).not.toBeNull();
    }
    expect(byOutcome("timeout")).toHaveLength(6);
    expect(byOutcome("timeout")[0].style.borderStyle).toBe("dashed");
    expect(byOutcome("correct")[0].style.borderStyle).toBe("solid");
    expect(byOutcome("timeout")[0].style.borderColor).not.toBe(byOutcome("incorrect")[0].style.borderColor);
  });

  it("a non-unanimous module reads C/played with a child-order segment strip", () => {
    const s = stageOf(3, "standard");
    render(<Timeline stage={s} />);
    const vm = buildStageViewModel(s);
    const mixed = vm.rounds.find((r) => r.verdict === "mixed")!;
    const icon = icons()[mixed.position - 1];
    const played = mixed.correct + mixed.incorrect + mixed.timeout;
    expect(within(icon).getByTestId("timeline-badge").textContent).toBe(`${mixed.correct}/${played}`);
    expect(within(icon).getByTestId("timeline-segments").children).toHaveLength(mixed.occurrences.length);
  });

  it("accessible names state position, public category and result", () => {
    const s = stageOf(5, "time_trial");
    render(<Timeline stage={s} />);
    const timeout = icons().find((i) => i.dataset.outcome === "timeout")!;
    expect(timeout.getAttribute("aria-label")).toMatch(/^Question \d+ of 30, .+, timed out$/);
    const vm = buildStageViewModel(stageOf(3, "standard"));
    const journey = vm.rounds.find((r) => r.unit === "journey")!;
    expect(historyIconLabel(journey, 10)).toMatch(/^Question 10 of 10, Journey, \d of 5 correct/);
  });

  it("unit sigils stand in until art is proven — a Journey is never a question mark", () => {
    render(<Timeline stage={stageOf(3, "standard")} />);
    const journey = icons().find((i) => i.dataset.unit === "journey")!;
    expect(within(journey).getByTestId("unit-sigil").dataset.unit).toBe("journey");
  });
});

describe("Ranked rows are unchanged", () => {
  it("without the history prop, QuestionTimeline is HUB3's five-per-page track", () => {
    render(<QuestionTimeline roundCount={12} review={null} matchId="r" />);
    const track = screen.getByTestId("question-timeline");
    expect(track.dataset.timelineMode).toBeUndefined();
    expect(track.dataset.pageSize).toBe("5");
    expect(icons()).toHaveLength(5);
    expect(icons()[0].className).toContain("h-7 w-7");
    expect(screen.queryByTestId("timeline-badge")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── cross-highlight

function Harness({ stage, make }: { stage: HistoryStage; make: (s: HistoryStage) => HistoryHighlight | null }) {
  const { setHighlight } = useHistoryHighlight();
  const lit = useStageHighlight(stage.stageId);
  useEffect(() => {
    setHighlight(make(stage));
  }, [stage, make, setHighlight]);
  return <Timeline stage={stage} highlight={lit} />;
}

describe("cross-highlight", () => {
  const lit = () => icons().filter((i) => i.dataset.lit === "true");
  const dim = () => icons().filter((i) => i.dataset.lit === "false");

  it("an outcome lights exactly its positions and steps the rest back", () => {
    const s = stageOf(5, "time_trial");
    render(
      <HistoryHighlightProvider>
        <Harness stage={s} make={(x) => outcomeHighlight(x, "timeout")} />
      </HistoryHighlightProvider>,
    );
    expect(lit()).toHaveLength(6);
    expect(lit().every((i) => i.dataset.outcome === "timeout")).toBe(true);
    expect(dim()).toHaveLength(24);
    expect(dim()[0].style.opacity).toBe("0.32");
  });

  it("a category × outcome uses the server's exact membership", () => {
    const s = stageOf(6, "time_trial");
    const cat = s.analytics!.personalFacts.categories.find((c) => c.incorrect > 0)!;
    render(
      <HistoryHighlightProvider>
        <Harness stage={s} make={(x) => categoryHighlight(x, cat.publicCategory.key, "incorrect")} />
      </HistoryHighlightProvider>,
    );
    expect(lit()).toHaveLength(cat.idsByOutcome.incorrect.length);
  });

  it("Free: the same highlight from the record's own categories", () => {
    const premium = stageOf(6, "time_trial");
    const free = stageOf(6, "time_trial", "lab_free");
    const key = premium.analytics!.personalFacts.categories[0].publicCategory.key;
    expect([...categoryHighlight(free, key).occurrenceIds].sort()).toEqual(
      [...categoryHighlight(premium, key).occurrenceIds].sort(),
    );
  });

  it("a streak span's occurrences light as one run", () => {
    const s = stageOf(10, "time_trial");
    const span = s.analytics!.personalFacts.current!.longestStreakSpan!;
    const vm: StageViewModel = buildStageViewModel(s);
    const order = vm.rounds.flatMap((r) => r.occurrences.map((o) => o.occurrenceId));
    const ids = order.slice(order.indexOf(span.startQuestionResultId!), order.indexOf(span.endQuestionResultId!) + 1);
    expect(ids).toHaveLength(25);
    render(
      <HistoryHighlightProvider>
        <Harness stage={s} make={(x) => occurrenceHighlight(x, ids)} />
      </HistoryHighlightProvider>,
    );
    expect(lit()).toHaveLength(25);
  });

  it("a highlight on another stage leaves this one untouched", () => {
    const s = stageOf(5, "time_trial");
    const other = stageOf(5, "survival");
    function Cross() {
      const { setHighlight } = useHistoryHighlight();
      const litHere = useStageHighlight(s.stageId);
      useEffect(() => setHighlight(outcomeHighlight(other, "incorrect")), [setHighlight]);
      return <Timeline stage={s} highlight={litHere} />;
    }
    render(
      <HistoryHighlightProvider>
        <Cross />
      </HistoryHighlightProvider>,
    );
    expect(screen.getByTestId("question-timeline").dataset.highlight).toBeUndefined();
    expect(icons().every((i) => i.dataset.lit === undefined)).toBe(true);
  });

  it("clearing the highlight restores every icon", () => {
    const s = stageOf(5, "time_trial");
    let clear: () => void = () => {};
    function Clearable() {
      const { setHighlight } = useHistoryHighlight();
      const litHere = useStageHighlight(s.stageId);
      useEffect(() => {
        setHighlight(outcomeHighlight(s, "correct"));
        clear = () => setHighlight(null);
      }, [setHighlight]);
      return <Timeline stage={s} highlight={litHere} />;
    }
    render(
      <HistoryHighlightProvider>
        <Clearable />
      </HistoryHighlightProvider>,
    );
    expect(lit().length).toBeGreaterThan(0);
    act(() => clear());
    expect(icons().every((i) => i.dataset.lit === undefined)).toBe(true);
  });
});
