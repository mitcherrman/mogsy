import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import golden from "@/lib/admin/__fixtures__/question-intelligence-v1.json";
import {
  parseQuestionIntelligence,
  QuestionIntelligenceReadError,
  type QiFilters,
} from "@/lib/admin/questionIntelligence/api";
import { defaultQiFilters, dominantOptionCount } from "@/lib/admin/questionIntelligence/view";
import { QuestionIntelligencePanel } from "./QuestionIntelligencePanel";

vi.mock("@/lib/admin-auth/adminCredentials", () => ({
  ADMIN_API_BASE_URL: "https://railway.test",
  buildAdminHeaders: vi.fn(async () => ({})),
}));

const DATA = parseQuestionIntelligence(golden);
const INITIAL: QiFilters = { ...defaultQiFilters(Date.UTC(2026, 9, 12)), from: "2026-10-10" };

function renderPanel(load = vi.fn(async () => DATA)) {
  render(<QuestionIntelligencePanel load={load} initialFilters={INITIAL} />);
  return load;
}

describe("QI1 panel · hover-synchronised detail", () => {
  it("labels rows A1… and opens on A1", async () => {
    renderPanel();
    expect(await screen.findByTestId("qi-row-A1")).toBeTruthy();
    expect(screen.getByTestId("qi-row-A3")).toBeTruthy();
    const detail = screen.getByTestId("qi-detail");
    expect(within(detail).getByTestId("qi-detail-ref").textContent).toBe("quiz:champion:q1");
    expect(within(detail).getByTestId("qi-detail-prompt").textContent).toBe("Prompt for quiz:champion:q1");
    expect(screen.getByTestId("qi-row-A1").getAttribute("data-active")).toBe("true");
  });

  it("hovering A4 moves the side panel to A4 and its option grid", async () => {
    renderPanel();
    fireEvent.mouseEnter(await screen.findByTestId("qi-row-A4"));
    const detail = screen.getByTestId("qi-detail");
    expect(within(detail).getByTestId("qi-detail-ref").textContent).toBe("reflex:hp:garen-teemo");
    expect(screen.getByTestId("qi-row-A4").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("qi-row-A1").getAttribute("data-active")).toBe("false");
    // A two-option card: A4.1 left, A4.2 right, the wrong pick on the right.
    expect(screen.getByTestId("qi-cell-A4.1").getAttribute("data-cell")).toBe("left");
    expect(screen.getByTestId("qi-cell-A4.2").getAttribute("data-cell")).toBe("right");
    expect(screen.getByTestId("qi-cell-A4.2").textContent).toContain("1 wrong");
    expect(screen.queryByTestId("qi-cell-A4.3")).toBeNull();
  });

  it("draws A1.1–A1.4 on the 2×2 grid with the wrong pick at bottom-right", async () => {
    renderPanel();
    await screen.findByTestId("qi-detail");
    const cells = ["A1.1", "A1.2", "A1.3", "A1.4"].map((n) => screen.getByTestId(`qi-cell-${n}`));
    expect(cells.map((c) => c.getAttribute("data-cell"))).toEqual(["top-left", "top-right", "bottom-left", "bottom-right"]);
    expect(cells.map((c) => [c.style.gridRow, c.style.gridColumn])).toEqual([["1", "1"], ["1", "2"], ["2", "1"], ["2", "2"]]);
    expect(cells[3].textContent).toContain("1 wrong");
    expect(cells[0].textContent).toContain("2 correct here");
    fireEvent.mouseEnter(cells[3]);
    expect(screen.getByTestId("qi-grid-caption").textContent).toContain("A1.4 · bottom-right");
    // Repeat serves 1 · players repeated 1 · max days for one player 2.
    expect(screen.getByTestId("qi-detail-repeats").textContent).toBe("Repeat serves1Players repeated1Max days, 1 player2");
  });

  it("a click pins a row so hovering elsewhere does not move the panel", async () => {
    renderPanel();
    fireEvent.click(await screen.findByTestId("qi-row-A2"));
    fireEvent.mouseEnter(screen.getByTestId("qi-row-A3"));
    expect(screen.getByTestId("qi-detail-ref").textContent).toBe("quiz:item:q2");
    fireEvent.click(screen.getByTestId("qi-row-A2"));
    fireEvent.mouseEnter(screen.getByTestId("qi-row-A3"));
    expect(screen.getByTestId("qi-detail-ref").textContent).toBe("quiz:item:q3");
  });

  it("applies filters as one read and continues labels on the next page", async () => {
    const page2 = { ...DATA, page: { offset: 50, limit: 50, total: 54, nextOffset: null } };
    const load = vi.fn(async (f: QiFilters) => (f.offset === 50 ? page2 : { ...DATA, page: { ...DATA.page, total: 54, nextOffset: 50 } }));
    renderPanel(load);
    await screen.findByTestId("qi-row-A1");
    fireEvent.change(screen.getByTestId("qi-host"), { target: { value: "daily" } });
    fireEvent.change(screen.getByTestId("qi-stage"), { target: { value: "survival" } });
    expect(load).toHaveBeenCalledTimes(1); // drafting does not refetch
    fireEvent.click(screen.getByTestId("qi-apply"));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(load.mock.calls[1][0]).toMatchObject({ host: "daily", stageKind: "survival", offset: 0 });
    fireEvent.click(await screen.findByTestId("qi-next"));
    expect(await screen.findByTestId("qi-row-A51")).toBeTruthy();
    expect(screen.getByTestId("qi-pager").textContent).toContain("A51–A54 of 54");
  });

  it("shows a denial as an error, never as an empty table", async () => {
    renderPanel(vi.fn(async () => {
      throw new QuestionIntelligenceReadError("denied", "Owner access to Question Intelligence was refused.");
    }));
    const err = await screen.findByTestId("qi-error");
    expect(err.getAttribute("data-kind")).toBe("denied");
    expect(screen.queryByTestId("qi-table-empty")).toBeNull();
  });

  it("explains a question with no displayed positions", async () => {
    const q = { ...DATA.questions[0], positions: { ...DATA.questions[0].positions, byPosition: [], optionCounts: {}, nonPositionalExposures: 4 } };
    renderPanel(vi.fn(async () => ({ ...DATA, questions: [q] })));
    expect((await screen.findByTestId("qi-grid-none")).textContent).toContain("4 exposures");
  });

  it("shows the DREP1 forced / avoidable split in totals, table and detail", async () => {
    renderPanel();
    await screen.findByTestId("qi-row-A1");
    expect(screen.getByTestId("qi-drep1-totals").textContent).toContain("forced 1 · avoidable 1 (set without it 1, no set 0)");
    expect(screen.getByTestId("qi-avoidable-A1").textContent).toBe("—");
    expect(screen.getByTestId("qi-avoidable-A3").textContent).toBe("1");
    expect(screen.getByTestId("qi-detail-drep1").textContent).toBe("Forced1Avoidable0Outside Daily0Unclassified0");
    fireEvent.mouseEnter(screen.getByTestId("qi-row-A3"));
    expect(screen.getByTestId("qi-detail-drep1").textContent).toBe("Forced0Avoidable1Outside Daily0Unclassified0");
  });

  it("says the DREP1 split was not reported rather than showing zeros", async () => {
    const totals = { ...DATA.totals, repeats: { ...DATA.totals.repeats, drep1: null } };
    const questions = DATA.questions.map((q) => ({ ...q, repeats: { ...q.repeats, drep1: null } }));
    renderPanel(vi.fn(async () => ({ ...DATA, totals, questions })));
    expect((await screen.findByTestId("qi-drep1-totals")).textContent).toBe("DREP1 split not reported by this backend.");
    expect(screen.getByTestId("qi-detail-drep1").textContent).toBe("DREP1 split not reported.");
    expect(screen.getByTestId("qi-avoidable-A1").textContent).toBe("—");
  });
});

describe("QI1 panel · grid shape", () => {
  it("uses the most common option count", () => {
    const q = DATA.questions[0];
    expect(dominantOptionCount(q)).toBe(4);
    expect(dominantOptionCount({ ...q, positions: { ...q.positions, optionCounts: { "2": 5, "4": 1 } } })).toBe(2);
  });
});
