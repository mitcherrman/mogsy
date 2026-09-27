/**
 * HUB6.3G1 — the selected History stage row opens further: historical topic
 * stats under its question icons, and the current-vs-previous comparison on
 * the row itself; the analytics room continues below without a second stage
 * title or comparison board. Through the real page on the lab's HUB6.3C
 * golden, plus pure derivations for states the lab does not hold.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 60000 });
vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null, session: null }) }));

import LobbyPreviewPage from "./LobbyPreviewPage";
import { topicStats } from "@/components/quiz/workspace/analytics/derive";
import { buildStageViewModel, type StageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { readHistoryPage, type DailyHistoryRecord, type HistoryStage } from "@/lib/history/contracts";
import { ANALYTICS_LAB_GOLDEN } from "./history/analyticsLabSource";

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
        media: query, onchange: null, addListener: () => {}, removeListener: () => {},
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }) as MediaQueryList,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const records = (): DailyHistoryRecord[] =>
  ANALYTICS_LAB_GOLDEN.scenarios.lab_premium.flatMap((page) => readHistoryPage(page).items);
const labStage = (n: number, kind: string): HistoryStage =>
  records().find((r) => r.runId === `lab-run-${String(n).padStart(2, "0")}`)!.stages.find((s) => s.kind === kind)!;

const runRows = () => screen.getAllByTestId("daily-run-row");
const stageRow = (run: HTMLElement, kind: string) =>
  within(run).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === kind)!;
const lit = (el: HTMLElement) => within(el).queryAllByTestId("timeline-icon").filter((i) => i.dataset.lit === "true");

async function stageRoom(n: number, kind: string, entitlement: "premium" | "free" = "premium") {
  render(
    <MemoryRouter initialEntries={["/dev/lobby-preview"]}>
      <LobbyPreviewPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("lobby-preview-analyticsLab"));
  if (entitlement === "free") fireEvent.click(screen.getByTestId("lobby-preview-entitlement-free"));
  await waitFor(() => expect(runRows()).toHaveLength(10), { timeout: 20000 });
  const find = () => runRows().find((r) => within(r).getByTestId("daily-run-date").textContent === `Sep ${n}`);
  if (!find()) {
    fireEvent.click(screen.getByTestId("daily-history-load-more"));
    await waitFor(() => expect(find()).toBeTruthy(), { timeout: 20000 });
  }
  const run = find()!;
  fireEvent.click(within(stageRow(run, kind)).getByTestId("stage-analysis-toggle"));
  await waitFor(() => expect(within(run).getByTestId("stage-analytics").dataset.stageKind).toBe(kind), { timeout: 20000 });
  return run;
}

const RAW_FAMILY = /item_cost|champion_stat|summoner_spell_cooldown|objective_timer|wave_composition|casts_before_oom|mastery_slice|_/;
const FORBIDDEN = /\bpp\b|settled|Learning signals?|Recurring weakness|Recovered|recovery rate|mastered|mastery|improving|weak at|strong at|you are weak|you are strong|learning state/i;

/** The topic line under the icon at `li`, and that position's round number. */
function topicCells(row: HTMLElement) {
  return within(row).getAllByTestId("timeline-topic").map((t) => {
    const li = t.closest("li")!;
    return { text: t.textContent!, round: Number(li.querySelector<HTMLElement>("[data-testid='timeline-icon']")!.dataset.roundNumber) };
  });
}

// ─────────────────────────────────────────────────────────── A micro-stat

describe("A — historical topic stats under the selected stage's icons", () => {
  it("1–2. a single-question position shows the server's historical public-category accuracy, by its public label", async () => {
    const run = await stageRoom(14, "time_trial");
    const row = stageRow(run, "time_trial");
    const cells = topicCells(row);
    expect(cells.length).toBeGreaterThan(0);
    const stats = topicStats(labStage(14, "time_trial"));
    const history = labStage(14, "time_trial").analytics!.personalFacts.personal!.categoryHistory;
    for (const c of cells) {
      const st = stats.get(c.round)!;
      expect(c.text).toBe(`${Math.round(st.accuracy * 100)}%${st.label}`);
      // The label is the server's public category label (or "General"), never a family id.
      const h = history.find((x) => x.publicCategory.key === st.key)!;
      expect([h.publicCategory.label, "General"]).toContain(st.label);
      expect(st.label).not.toMatch(RAW_FAMILY);
      expect(st.accuracy).toBe(h.accuracy);
      expect([st.correct, st.played]).toEqual([h.correct, h.questionsPlayed]);
    }
    // The fuller fact is in the icon's name (hover / focus / tap).
    const icon = row.querySelector<HTMLElement>(`[data-round-number="${cells[0].round}"]`)!;
    expect(icon.getAttribute("aria-label")).toMatch(/\d+ of \d+ correct in your earlier matching stages, \d+%/);
  });

  it("3–4. no history for the category, no accuracy or nothing played → no stat at all (never 0%, never 'first time')", () => {
    const stage = labStage(14, "time_trial");
    const personal = stage.analytics!.personalFacts.personal!;
    const strip = (categoryHistory: typeof personal.categoryHistory): HistoryStage => ({
      ...stage,
      analytics: { ...stage.analytics!, personalFacts: { ...stage.analytics!.personalFacts, personal: { ...personal, categoryHistory } } },
    });
    expect(topicStats(strip([])).size).toBe(0);
    expect(topicStats(strip(personal.categoryHistory.map((h) => ({ ...h, accuracy: null })))).size).toBe(0);
    expect(topicStats(strip(personal.categoryHistory.map((h) => ({ ...h, questionsPlayed: 0, correct: 0, accuracy: 0 })))).size).toBe(0);
    const noPersonal: HistoryStage = { ...stage, analytics: { ...stage.analytics!, personalFacts: { ...stage.analytics!.personalFacts, personal: null } } };
    expect(topicStats(noPersonal).size).toBe(0);
  });

  it("5–6. a multi-question module: one stat only when every child shares a category; mixed children get none", () => {
    const stage = labStage(12, "standard");
    const vm = buildStageViewModel(stage);
    const journey = vm.rounds[9];
    expect(journey.occurrences.length).toBe(5);
    const cat = (key: string, label: string) => ({ key, label });
    const history = stage.analytics!.personalFacts.personal!.categoryHistory;
    const [a, b] = history.filter((h) => h.accuracy !== null && h.questionsPlayed > 0);
    const withChildren = (keys: Array<{ key: string; label: string }>): StageViewModel => ({
      ...vm,
      rounds: vm.rounds.map((r, i) => (i !== 9 ? r : {
        ...r,
        occurrences: r.occurrences.map((o, j) => ({ ...o, publicCategory: { ...o.publicCategory!, ...keys[j % keys.length] } })),
      })),
    });
    const same = topicStats(stage, withChildren([cat(a.publicCategory.key, a.publicCategory.label)]));
    expect(same.get(journey.roundNumber)?.key).toBe(a.publicCategory.key);
    const mixed = topicStats(stage, withChildren([cat(a.publicCategory.key, a.publicCategory.label), cat(b.publicCategory.key, b.publicCategory.label)]));
    expect(mixed.has(journey.roundNumber)).toBe(false);
  });

  it("7 / 23. Free: the selected timeline, outcomes and quick facts stay; no historical %, no comparison", async () => {
    const run = await stageRoom(14, "time_trial", "free");
    const row = stageRow(run, "time_trial");
    expect(within(row).getAllByTestId("timeline-icon").length).toBeGreaterThan(0);
    expect(within(row).getByTestId("stage-local-facts")).toBeTruthy();
    expect(within(row).queryAllByTestId("timeline-topic")).toHaveLength(0);
    expect(within(row).queryByTestId("stage-row-compare")).toBeNull();
  });

  it("20–21. touch / narrow: the micro-stats stay (two short lines) and the rail pages by column", async () => {
    coarse = true;
    width = 330;
    const run = await stageRoom(14, "time_trial");
    const row = stageRow(run, "time_trial");
    const timeline = within(row).getByTestId("question-timeline");
    expect(timeline.dataset.paged).toBe("true");
    const cells = topicCells(row);
    expect(cells.length).toBeGreaterThan(0);
    expect(within(row).getAllByTestId("timeline-topic")[0].children).toHaveLength(2);
    const first = timeline.dataset.page;
    fireEvent.click(within(timeline).getByTestId("timeline-next"));
    expect(timeline.dataset.page).not.toBe(first);
    expect(topicCells(row).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────── B comparison in the row

describe("B — the comparison is part of the selected row", () => {
  it("8. Standard (L12): previous Sep 11 · 105 · 19 / 22 · 86% · streak 9, and its changes, on the row", async () => {
    const run = await stageRoom(12, "standard");
    const cmp = within(stageRow(run, "standard")).getByTestId("stage-row-compare");
    const prev = within(cmp).getByTestId("stage-row-previous").textContent!;
    expect(prev).toMatch(/Previous · Sep 11/);
    expect(prev).toMatch(/Score\s*105/);
    expect(prev).toMatch(/19 \/ 22/);
    expect(prev).toMatch(/86%/);
    expect(prev).toMatch(/Longest streak\s*9/);
    expect(within(cmp).getByTestId("change-score").textContent).toContain("Score +15");
    expect(within(cmp).getByTestId("change-accuracy").textContent).toContain("100% vs 86% · 14 points higher");
    // This attempt's own figures are the row's quick facts, right above.
    expect(within(stageRow(run, "standard")).getByTestId("stage-local-facts").textContent).toMatch(/Score\s*120/);
  });

  it("9. Time Trial (L4): 23 / 29 → 25 / 28 on the row", async () => {
    const run = await stageRoom(4, "time_trial");
    const cmp = within(stageRow(run, "time_trial")).getByTestId("stage-row-compare");
    expect(within(cmp).getByTestId("stage-row-previous").textContent).toMatch(/23 \/ 29/);
    expect(within(cmp).getByTestId("change-correct").textContent).toContain("+2 correct");
    expect(within(cmp).getByTestId("change-played").textContent).toContain("1 fewer question played");
  });

  it("10. Survival (L11): depth, strikes and changes on the row", async () => {
    const run = await stageRoom(11, "survival");
    const cmp = within(stageRow(run, "survival")).getByTestId("stage-row-compare");
    expect(within(cmp).getByTestId("stage-row-previous").textContent).toMatch(/Depth\s*28/);
    expect(within(cmp).getByTestId("stage-row-previous").textContent).toMatch(/Strikes used\s*2 of 3/);
    expect(within(cmp).getByTestId("change-depth").textContent).toContain("5 questions deeper");
    expect(within(cmp).getByTestId("change-strikes").textContent).toContain("1 more strike used");
  });

  it("11–12. one comparison only; the room has no stage title or 'vs the previous one' board", async () => {
    for (const [n, kind] of [[12, "standard"], [14, "time_trial"], [11, "survival"]] as const) {
      const run = await stageRoom(n, kind);
      const region = within(run).getByTestId("daily-analytics-region");
      expect(within(region).queryByTestId("stage-compare")).toBeNull();
      expect(within(region).queryByTestId("compare-current")).toBeNull();
      expect(region.textContent).not.toMatch(/vs the previous one|· analytics/i);
      expect(within(run).getAllByTestId("stage-row-compare")).toHaveLength(1);
      expect(within(region).getByTestId("stage-analytics-heading").className).toMatch(/sr-only/);
      cleanup();
    }
  });

  it("16–17. the region continues the selected stage (its ink and wash); every other row stays", async () => {
    const run = await stageRoom(12, "standard");
    expect(within(run).getByTestId("daily-analytics-region").dataset.continues).toBe("standard");
    expect(within(run).getAllByTestId("daily-stage-row")).toHaveLength(5);
    expect(stageRow(run, "standard").dataset.selected).toBe("true");
  });
});

// ─────────────────────────────────────────────────────────── D course

describe("D — the Standard course is a compact recipe map", () => {
  it("13–15. ten modules in five segments joined by chevrons; smaller frames; only the Journey keeps child pips (five)", async () => {
    const run = await stageRoom(12, "standard");
    const course = within(run).getByTestId("standard-course");
    const modules = within(course).getAllByTestId("course-module");
    expect(modules).toHaveLength(10);
    expect(within(course).getAllByTestId("course-segment").map((g) => g.dataset.family)).toEqual(["splash", "meta_reflex", "splash", "meta_reflex", "journey"]);
    expect(within(course).getAllByTestId("course-then")).toHaveLength(4);
    expect(modules[0].style.width).toBe("36px");
    expect(modules[9].style.width).toBe("42px");
    const children = within(course).getAllByTestId("course-children");
    expect(children).toHaveLength(1);
    expect(children[0].dataset.count).toBe("5");
  });

  it("19. a module still lights its questions on the Standard row", async () => {
    const run = await stageRoom(14, "standard");
    fireEvent.focus(within(run).getAllByTestId("course-module")[9]);
    expect(lit(stageRow(run, "standard")).map((i) => i.dataset.round)).toEqual(["10"]);
  });
});

// ─────────────────────────────────────────────────────────── continuity of behaviour

describe("the rest of History still works", () => {
  it("18. the question Popover opens from a selected-row icon and carries its History", async () => {
    const run = await stageRoom(14, "time_trial");
    const icon = within(stageRow(run, "time_trial")).getAllByTestId("timeline-icon").find((i) => !i.hasAttribute("disabled"))!;
    act(() => { fireEvent.click(icon); });
    await waitFor(() => expect(screen.getByTestId("question-review-popover")).toBeTruthy());
    expect(screen.getByTestId("question-context-summary")).toBeTruthy();
  });

  it("24–27. no pp, settled, raw family or learning-state wording on the row or in the room", async () => {
    for (const [n, kind] of [[12, "standard"], [14, "time_trial"], [11, "survival"]] as const) {
      const run = await stageRoom(n, kind);
      const text = stageRow(run, kind).textContent! + within(run).getByTestId("daily-analytics-region").textContent!;
      expect(text).not.toMatch(FORBIDDEN);
      for (const t of within(stageRow(run, kind)).queryAllByTestId("timeline-topic")) expect(t.textContent).not.toMatch(RAW_FAMILY);
      cleanup();
    }
  });
});
