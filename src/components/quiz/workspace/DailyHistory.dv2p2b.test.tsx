/**
 * DV2-P2B — the Daily History row against the REAL B2 wire
 * (`dv2-b2-history.json`, backend `ec3500d0` output; see
 * `contracts.dv2p2b.test.ts`), parsed by the real reader and rendered by the
 * real History section.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DailyHistorySection from "@/components/quiz/workspace/DailyHistorySection";
import type { DailyHistoryState } from "@/components/quiz/workspace/useDailyHistory";
import { readHistoryPage, type DailyHistoryRecord } from "@/lib/history/contracts";
import golden from "@/lib/history/__fixtures__/hub2-history-v1.golden.json";
import b2 from "@/lib/history/__fixtures__/dv2-b2-history.json";

type Json = Record<string, unknown>;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const V5 = "v5-run";
const DAY = new Date("2026-10-03T23:00:00Z");
const NEXT_DAY = new Date("2026-10-04T09:00:00Z");

const withoutB2 = (page: { items: Json[] }) => {
  const p = clone(page);
  for (const item of p.items) {
    delete item.main;
    delete item.parent;
  }
  return p;
};

function stateOf(records: DailyHistoryRecord[]): DailyHistoryState {
  return {
    status: "ready", records, hasMore: false, loadingMore: false, error: null, loadMoreError: null,
    loadMore: () => {}, reload: () => {},
  };
}

const section = (page: unknown) => (
  <MemoryRouter>
    <DailyHistorySection daily={stateOf(readHistoryPage(clone(page)).items)} frozenReviews={{}} />
  </MemoryRouter>
);
const mount = (page: unknown) => render(section(page));

/** The run id is opaque and never printed: the v5 Daily is the Oct 3 row
 *  (the two legacy Dailies are Oct 1 and Oct 2). */
const v5Row = () =>
  screen.getAllByTestId("daily-run-row").find((r) => within(r).getByTestId("daily-run-date").textContent === "Oct 3")!;
const stageKinds = (row: HTMLElement) => within(row).getAllByTestId("daily-stage-row").map((s) => s.dataset.stageKind);
const stageToggle = (row: HTMLElement, kind: string) =>
  within(within(row).getAllByTestId("daily-stage-row").find((s) => s.dataset.stageKind === kind)!)
    .getByTestId("stage-analysis-toggle");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY);
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: false, media: query, onchange: null,
        addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("DV2-P2B legacy — the row is unchanged", () => {
  it("B2 legacy records render byte-identically to the same records without main/parent", () => {
    const before = mount(withoutB2(b2.legacy_only)).container.innerHTML;
    cleanup();
    const after = mount(b2.legacy_only).container.innerHTML;
    expect(after).toBe(before);
    expect(after).not.toContain("data-headline");
    expect(after).not.toContain("daily-optional-activities");
  });

  it("today's production page leads with basic, as before, and keeps Run analysis", () => {
    mount(golden.premium_page_1);
    const records = readHistoryPage(clone(golden.premium_page_1)).items;
    const rows = screen.getAllByTestId("daily-run-row");
    rows.forEach((row, i) => {
      expect(within(row).getByTestId("daily-run-score").textContent).toBe(String(records[i].basic.score));
      expect(within(row).getByLabelText(`${records[i].basic.correct} of ${records[i].basic.answered} correct`)).toBeTruthy();
      expect(within(row).getByTestId("daily-analysis-toggle")).toBeTruthy();
      expect(within(row).queryByTestId("daily-optional-activities")).toBeNull();
    });
  });
});

describe("DV2-P2B main Daily — headline", () => {
  it("leads with main.daily_score and Standard's own C/A and accuracy, never the aggregate", () => {
    mount(b2.open_partial);
    const row = v5Row();
    const basic = within(row).getByTestId("daily-run-basic");
    expect(basic.dataset.headline).toBe("main");
    // Standard 2/3, aggregate (Standard + Time Trial) 19 points, 3/5.
    expect(within(basic).getByTestId("daily-run-score").textContent).toBe("17");
    expect(within(basic).getByLabelText("2 of 3 correct")).toBeTruthy();
    expect(within(basic).getByTestId("daily-run-accuracy").textContent).toBe("67%");
    expect(basic.textContent).not.toContain("19");
    expect(within(basic).queryByLabelText("3 of 5 correct")).toBeNull();
  });

  it("the headline does not move as optional stages settle and the parent completes", () => {
    const headline = () => within(within(v5Row()).getByTestId("daily-run-basic"));
    const facts = () => [
      headline().getByTestId("daily-run-score").textContent,
      headline().getByTestId("daily-run-accuracy").textContent,
      headline().getByLabelText("2 of 3 correct").textContent,
    ];
    const view = mount(b2.open_standard);
    const first = facts();
    expect(stageKinds(v5Row())).toEqual(["standard"]);
    view.rerender(section(b2.open_partial));
    expect(stageKinds(v5Row())).toEqual(["standard", "time_trial"]);
    expect(facts()).toEqual(first);
    view.rerender(section(b2.completed));
    expect(stageKinds(v5Row())).toEqual(["standard", "time_trial", "survival", "weak_areas", "review"]);
    expect(facts()).toEqual(first);
    expect(first).toEqual(["17", "67%", "2/3"]);
  });

  it("fails neutral without a Standard stage: the frozen score, no borrowed C/A", () => {
    const wire = clone(b2.open_partial);
    const item = wire.items.find((i) => i.run_id === V5) as Json;
    item.stages = (item.stages as Json[]).filter((s) => s.kind !== "standard");
    mount(wire);
    const basic = within(v5Row()).getByTestId("daily-run-basic");
    expect(within(basic).getByTestId("daily-run-score").textContent).toBe("17");
    expect(within(basic).getByTestId("daily-run-correct-neutral").textContent).toBe("—");
    expect(within(basic).queryByTestId("daily-run-accuracy")).toBeNull();
    expect(within(basic).queryByLabelText(/correct$/)).toBeNull();
  });
});

describe("DV2-P2B open parent — rows, optional activities, analysis", () => {
  it("renders exactly the settled stages: stageCount 5, two rows, no placeholder", () => {
    mount(b2.open_partial);
    const row = v5Row();
    expect(row.dataset.runStages).toBe("2");
    expect(stageKinds(row)).toEqual(["standard", "time_trial"]);
    expect(row.textContent).not.toMatch(/Survival|Weak Areas|Recently Missed|pending|Stage \d of/i);
  });

  it("says the optional challenges are still open today", () => {
    mount(b2.open_partial);
    const note = within(v5Row()).getByTestId("daily-optional-activities");
    expect(note.textContent).toBe("Optional challenges still open");
    expect(note.dataset.optional).toBe("open");
    expect(v5Row().textContent).not.toMatch(/incomplete|unfinished/i);
  });

  it.each(["open_standard", "open_partial"] as const)(
    "on a later day, %s reads 'were left open' — never 'not played', even with Time Trial settled",
    (name) => {
      vi.setSystemTime(NEXT_DAY);
      mount(b2[name]);
      const row = v5Row();
      const note = within(row).getByTestId("daily-optional-activities");
      expect(note.textContent).toBe("Optional challenges were left open");
      expect(note.dataset.optional).toBe("left_open");
      expect(row.textContent).not.toMatch(/not played|unplayed|still open|incomplete|unfinished/i);
      if (name === "open_partial") expect(stageKinds(row)).toEqual(["standard", "time_trial"]);
    },
  );

  it("a different not_applicable reason on an open parent keeps the existing Run analysis toggle", () => {
    const wire = clone(b2.open_partial);
    (wire.items.find((i) => i.run_id === V5) as Json).analytics_capability = {
      state: "not_applicable", reason_code: "some_future_reason" };
    mount(wire);
    const row = v5Row();
    const toggle = within(row).getByTestId("daily-analysis-toggle");
    expect(toggle.dataset.state).toBe("not_applicable");
    // Existing behaviour for a not_applicable run: the toggle expands, no analysis.
    fireEvent.click(toggle);
    expect(within(v5Row()).queryByTestId("daily-analysis")).toBeNull();
    // The open-parent note is about the parent, not the analysis: still said.
    expect(within(v5Row()).getByTestId("daily-optional-activities")).toBeTruthy();
  });

  it("an outage on an open parent keeps the existing restrained retry", () => {
    const wire = clone(b2.open_partial);
    (wire.items.find((i) => i.run_id === V5) as Json).analytics_capability = {
      state: "temporarily_unavailable", reason_code: "analytics_dependency_unavailable" };
    mount(wire);
    fireEvent.click(within(v5Row()).getByTestId("daily-analysis-toggle"));
    expect(within(v5Row()).getByTestId("daily-analysis-unavailable")).toBeTruthy();
  });

  it("offers no Run analysis, so no empty Daily Overview can open", () => {
    mount(b2.open_partial);
    const row = v5Row();
    expect(within(row).queryByTestId("daily-analysis-toggle")).toBeNull();
    expect(within(row).queryByTestId("daily-analytics-region")).toBeNull();
    expect(row.dataset.focused).toBe("false");
  });

  it("keeps the settled Standard's own analysis reachable, and closes back to the collapsed row", () => {
    mount(b2.open_partial);
    fireEvent.click(stageToggle(v5Row(), "standard"));
    let row = v5Row();
    const region = within(row).getByTestId("daily-analytics-region");
    expect(region.dataset.view).toBe("stage");
    const stage = within(region).getByTestId("stage-analytics");
    expect(stage.dataset.state).toBe("available");
    expect(stage.dataset.room).toBe("standard");
    // No route to an Overview: the return control closes instead.
    expect(within(row).queryByTestId("daily-overview-return")).toBeNull();
    fireEvent.click(within(row).getByTestId("daily-stage-close"));
    row = v5Row();
    expect(row.dataset.focused).toBe("false");
    // Re-selecting the lit stage also closes rather than opening an Overview.
    fireEvent.click(stageToggle(row, "time_trial"));
    expect(within(v5Row()).getByTestId("stage-analytics").dataset.stageKind).toBe("time_trial");
    fireEvent.click(stageToggle(v5Row(), "time_trial"));
    expect(v5Row().dataset.focused).toBe("false");
    expect(within(v5Row()).queryByTestId("daily-analysis")).toBeNull();
  });

  it("a free reader's open parent keeps the server's one Premium invitation", () => {
    mount(b2.open_partial_free);
    const row = v5Row();
    expect(within(row).getByTestId("daily-optional-activities")).toBeTruthy();
    const toggle = within(row).getByTestId("daily-analysis-toggle");
    expect(toggle.dataset.state).toBe("upgrade_required");
    fireEvent.click(toggle);
    expect(within(v5Row()).getByTestId("daily-analysis-upgrade")).toBeTruthy();
  });

  it("once the parent completes: no note, Run analysis returns and opens the server's Overview", () => {
    mount(b2.completed);
    const row = v5Row();
    expect(within(row).queryByTestId("daily-optional-activities")).toBeNull();
    fireEvent.click(within(row).getByTestId("daily-analysis-toggle"));
    expect(within(v5Row()).getByTestId("daily-analysis").dataset.state).toBe("available");
  });

  it("adds no rank, leaderboard, percentile or personal-best claim to the row", () => {
    for (const page of [b2.open_standard, b2.open_partial, b2.completed]) {
      mount(page);
      expect(v5Row().textContent).not.toMatch(/rank|leaderboard|percentile|personal best|best score|record/i);
      cleanup();
    }
  });
});
