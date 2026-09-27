/**
 * HUB6.3D — the Analytics Lab through the REAL page: `LobbyPreviewPage` →
 * `LeaguecraftHub` → `DailyRunRow` → History's timeline and the selected
 * row's quick facts, fed by HUB6.3B's golden and the production parser.
 * The HUB6.2 shell is the frozen frame: the same Daily expands in place, all
 * stage rows and rails stay, and a stage is selected by its own row.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null, session: null }) }));

import LobbyPreviewPage from "./LobbyPreviewPage";

let width = 1200;
beforeEach(() => {
  width = 1200;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: false,
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

const runRows = () => screen.getAllByTestId("daily-run-row");
const pick = (id: string) => fireEvent.click(screen.getByTestId(id));
const row = (run: HTMLElement, kind: string) =>
  within(run).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === kind)!;

async function openLab(entitlement: "premium" | "free" = "premium") {
  render(
    <MemoryRouter initialEntries={["/dev/lobby-preview"]}>
      <LobbyPreviewPage />
    </MemoryRouter>,
  );
  pick("lobby-preview-analyticsLab");
  if (entitlement === "free") pick("lobby-preview-entitlement-free");
  await waitFor(() => expect(runRows()).toHaveLength(10));
  await waitFor(() => expect(runRows()[0].textContent).toContain("Sep 14"));
  return runRows();
}

const select = (run: HTMLElement, kind: string) => {
  fireEvent.click(within(row(run, kind)).getByTestId("stage-analysis-toggle"));
  return row(run, kind);
};
const fact = (stage: HTMLElement, id: string) => within(stage).getByTestId(id).textContent;

describe("Analytics Lab — the persistent History timeline", () => {
  it("every stage row carries History's track, with more than five icons where they fit", async () => {
    const [latest] = await openLab();
    for (const stage of within(latest).getAllByTestId("daily-stage-row")) {
      expect(within(stage).getByTestId("question-timeline").dataset.timelineMode).toBe("history");
    }
    const tt = row(latest, "time_trial");
    expect(within(tt).getAllByTestId("timeline-icon").length).toBeGreaterThan(5);
    expect(within(tt).getByTestId("question-timeline").dataset.total).toBe("28");
  });

  it("outcomes are the History DTO's: the timeouts of a bank-exhausted Time Trial read timed out", async () => {
    const runs = await openLab();
    const l5 = runs.find((r) => r.textContent!.includes("Sep 5"))!;
    const icons = within(row(l5, "time_trial")).getAllByTestId("timeline-icon");
    expect(icons.filter((i) => i.dataset.outcome === "timeout")).toHaveLength(6);
  });

  it("selecting a stage grows its icons in place; the other rows keep theirs", async () => {
    const [latest] = await openLab();
    const before = parseFloat(within(row(latest, "time_trial")).getAllByTestId("timeline-icon")[0].style.width);
    const tt = select(latest, "time_trial");
    expect(tt.dataset.selected).toBe("true");
    expect(within(tt).getByTestId("question-timeline").dataset.size).toBe("selected");
    expect(parseFloat(within(tt).getAllByTestId("timeline-icon")[0].style.width)).toBeGreaterThan(before);
    expect(within(row(latest, "standard")).getByTestId("question-timeline").dataset.size).toBe("row");
    expect(within(latest).getAllByTestId("daily-stage-row")).toHaveLength(5);
    expect(runRows()).toHaveLength(10);
  });
});

describe("Analytics Lab — the selected row's quick facts", () => {
  it("Standard: score, correct / played, accuracy, longest streak", async () => {
    const runs = await openLab();
    const l12 = runs.find((r) => r.textContent!.includes("Sep 12"))!;
    const s = select(l12, "standard");
    expect(fact(s, "stage-fact-score")).toContain("120");
    expect(fact(s, "stage-fact-played")).toContain("22 / 22");
    expect(fact(s, "stage-fact-accuracy")).toContain("100%");
    expect(fact(s, "stage-fact-streak")).toContain("22");
  });

  it("Time Trial: correct / played, accuracy, longest streak, how it ended", async () => {
    const [latest] = await openLab();
    const tt = select(latest, "time_trial");
    expect(fact(tt, "stage-fact-played")).toContain("24 / 28");
    expect(fact(tt, "stage-fact-accuracy")).toContain("86%");
    expect(fact(tt, "stage-fact-streak")).toContain("7");
    expect(fact(tt, "stage-fact-ended")).toBeTruthy();
    expect(tt.textContent).not.toMatch(/settled/i);
  });

  it("Survival: depth, strikes used, correct / played, accuracy, streak", async () => {
    const runs = await openLab();
    const l11 = runs.find((r) => r.textContent!.includes("Sep 11"))!;
    const s = select(l11, "survival");
    expect(fact(s, "stage-analysis-depth")).toContain("33");
    expect(fact(s, "stage-analysis-strikes")).toContain("3 of 3");
    expect(fact(s, "stage-fact-played")).toContain("30 / 33");
    expect(fact(s, "stage-fact-streak")).toContain("23");
  });

  it("Weak Areas and Review: current correct / played and accuracy, no streak", async () => {
    const [latest] = await openLab();
    for (const kind of ["weak_areas", "review"]) {
      const s = select(latest, kind);
      expect(within(s).getByTestId("stage-fact-played")).toBeTruthy();
      expect(within(s).queryByTestId("stage-fact-streak")).toBeNull();
    }
  });

  it("Free keeps every current fact, the streak included", async () => {
    const runs = await openLab("free");
    const l11 = runs.find((r) => r.textContent!.includes("Sep 11"))!;
    const s = select(l11, "survival");
    expect(fact(s, "stage-fact-streak")).toContain("23");
    expect(fact(s, "stage-analysis-depth")).toContain("33");
    expect(fact(s, "stage-analysis-strikes")).toContain("3 of 3");
  });
});

describe("Analytics Lab — terminology", () => {
  it("the Daily overview compares accuracy in points, never pp", async () => {
    const [latest] = await openLab();
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    // HUB6.3E: the previous-Daily comparison is the room's change chips.
    const delta = await within(latest).findByTestId("daily-change-accuracy");
    expect(delta.textContent).toMatch(/\d+ points? (higher|lower)|Same accuracy/);
    expect(delta.textContent).toMatch(/\d+% vs \d+%/);
    expect(latest.textContent).not.toMatch(/\bpp\b/);
  });
});
