/**
 * HUB6.3E — the Premium analytics room through the REAL page:
 * `LobbyPreviewPage` → `LeaguecraftHub` → `DailyRunRow` → `analytics/*`, fed
 * by the Analytics Lab's HUB6.3C golden through the production parser.
 *
 * The HUB6.2 shell stays the frame: the same Daily expands in place, every
 * stage row and rail stays, a stage is selected by its own row, and the room
 * below is the only thing that changes.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null, session: null }) }));

import LobbyPreviewPage from "./LobbyPreviewPage";
import QuestionContext from "@/components/quiz/workspace/analytics/QuestionContext";
import { buildStageViewModel } from "@/components/quiz/workspace/historyViewModel";
import { readHistoryPage } from "@/lib/history/contracts";
import { ANALYTICS_LAB_GOLDEN } from "./history/analyticsLabSource";

let coarse = false;
beforeEach(() => {
  coarse = false;
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 1200);
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
  document.documentElement.classList.remove("reduce-motion");
});

const runRows = () => screen.getAllByTestId("daily-run-row");
const stageRow = (run: HTMLElement, kind: string) =>
  within(run).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === kind)!;
const lit = (el: HTMLElement) => within(el).queryAllByTestId("timeline-icon").filter((i) => i.dataset.lit === "true");
const dimmed = (el: HTMLElement) => within(el).queryAllByTestId("timeline-icon").filter((i) => i.dataset.lit === "false");

async function openLab(entitlement: "premium" | "free" = "premium") {
  render(
    <MemoryRouter initialEntries={["/dev/lobby-preview"]}>
      <LobbyPreviewPage />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId("lobby-preview-analyticsLab"));
  if (entitlement === "free") fireEvent.click(screen.getByTestId("lobby-preview-entitlement-free"));
  await waitFor(() => expect(runRows()).toHaveLength(10));
  await waitFor(() => expect(runRows()[0].textContent).toContain("Sep 14"));
}

/** The lab Daily for `Sep n` (loading the second page when needed). */
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
  await waitFor(() => expect(within(run).getByTestId("daily-analytics-region")).toBeTruthy());
  return run;
}

async function stageRoom(n: number, kind: string, entitlement: "premium" | "free" = "premium") {
  await openLab(entitlement);
  const run = await daily(n);
  fireEvent.click(within(stageRow(run, kind)).getByTestId("stage-analysis-toggle"));
  await waitFor(() => expect(within(run).getByTestId("stage-analytics")).toBeTruthy());
  return run;
}

const FORBIDDEN = /\bpp\b|settled|Learning signals?|Recurring weakness|Recovered|recovery rate|mastered|mastery|weak at|strong at|you are weak|you are strong/i;
const RAW_FAMILY = /item_cost|champion_stat|summoner_spell_cooldown|objective_timer|wave_composition|casts_before_oom|mastery_slice/;

describe("Daily Overview — the mature Daily (L14)", () => {
  it("every section, in the frozen shell: rows and rails stay, the room sits below", async () => {
    const run = await overview(14);
    expect(within(run).getAllByTestId("daily-stage-row")).toHaveLength(5);
    const room = within(run).getByTestId("daily-overview");
    for (const id of ["this-daily", "core-records", "core-history", "daily-donut", "mode-profile", "core-population"]) {
      expect(within(room).getByTestId(id)).toBeTruthy();
    }
    expect(room.textContent).not.toMatch(FORBIDDEN);
    expect(room.textContent).not.toMatch(RAW_FAMILY);
  });

  it("no raw Daily-score personal best — the score stays only as the header's saved total", async () => {
    const run = await overview(14);
    expect(within(run).queryByTestId("daily-analysis-best")).toBeNull();
    expect(within(run).getByTestId("daily-run-score").textContent).toBe("459");
    expect(within(run).getByTestId("daily-overview").textContent).not.toMatch(/personal best score|best score/i);
  });

  it("the previous Daily, factually: 72 / 82 vs 84 / 91 — −12 correct, 9 fewer questions played, 88% vs 92%", async () => {
    const run = await overview(14);
    const board = within(run).getByTestId("daily-compare");
    expect(within(board).getByTestId("compare-current").textContent).toContain("72 / 82");
    expect(within(board).getByTestId("compare-previous").textContent).toContain("84 / 91");
    expect(within(board).getByTestId("daily-change-correct").textContent).toContain("−12 correct");
    expect(within(board).getByTestId("daily-change-played").textContent).toContain("9 fewer questions played");
    expect(within(board).getByTestId("daily-change-accuracy").textContent).toContain("88% vs 92% · 4 points lower");
    expect(within(run).getByTestId("daily-core-streak").textContent).toContain("15");
    expect(within(run).getByTestId("daily-core-streak").textContent).toContain("Standard");
  });

  it("the previous Daily with a different stage composition says so (L2 after the four-stage L1)", async () => {
    const run = await overview(2);
    expect(within(run).getByTestId("compare-note").textContent).toMatch(/Different stage composition: this Daily had 5 stages, the previous one 4/);
  });

  it("Core Daily records: most correct and longest streak, with the server's status", async () => {
    const run = await overview(13);
    expect(within(run).getByTestId("core-record-correct").dataset.status).toBe("new_record");
    expect(within(run).getByTestId("core-record-streak").dataset.status).toBe("below_record");
    const first = await (async () => { cleanup(); return overview(1); })();
    expect(within(first).getByTestId("core-record-correct").dataset.status).toBe("first_attempt");
  });

  it("Core Daily history: one chart, a metric toggle, one axis at a time", async () => {
    const run = await overview(14);
    const panel = within(run).getByTestId("core-history");
    expect(panel.querySelector("[data-metric]")!.getAttribute("data-metric")).toBe("accuracy");
    expect(within(panel).getAllByTestId(/line-(point|current)/)).toHaveLength(14);
    fireEvent.click(within(within(panel).getByTestId("history-metric")).getByText("Longest streak"));
    expect(panel.querySelector("[data-metric]")!.getAttribute("data-metric")).toBe("longestStreak");
    // The keyboard reads a point: date, correct / played, accuracy, streak.
    const scrubber = within(panel).getByTestId("history-line-scrubber");
    fireEvent.keyDown(scrubber, { key: "End" });
    expect(within(panel).getByTestId("history-line-tip").textContent).toMatch(/Sep 14 · this Daily.*67 \/ 75 correct · 89%.*Longest streak 15/);
  });

  it("the Daily donut (result × stage) lights every rail on hover, locks on click, clears on Escape", async () => {
    const run = await overview(14);
    const donut = within(run).getByTestId("daily-donut");
    const correct = within(donut).getAllByTestId("donut-legend-outcome").find((b) => b.dataset.outcome === "correct")!;
    fireEvent.pointerEnter(correct, { pointerType: "mouse" });
    const total = within(run).getAllByTestId("daily-stage-row").reduce((a, s) => a + lit(s).length, 0);
    expect(total).toBeGreaterThan(20);
    fireEvent.pointerLeave(correct, { pointerType: "mouse" });
    expect(within(run).getAllByTestId("daily-stage-row").every((s) => lit(s).length === 0)).toBe(true);
    // A stage group lights only its own rail.
    const tt = within(donut).getAllByTestId("donut-legend-group").find((g) => g.textContent!.includes("Time Trial"))!;
    fireEvent.click(within(tt).getAllByRole("button")[0]);
    expect(lit(stageRow(run, "time_trial"))).toHaveLength(28);
    expect(stageRow(run, "standard").querySelector('[data-lit]')).toBeNull();
    expect(within(run).getByTestId("highlight-bar").textContent).toContain("Lighting 28 questions");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(within(run).queryByTestId("highlight-bar")).toBeNull();
    expect(lit(stageRow(run, "time_trial"))).toHaveLength(0);
  });
});

describe("mode profile and strongest mode — the server's verdict", () => {
  it.each([[8, "time_trial"], [11, "survival"], [12, "standard"]])("Sep %i: %s is crowned", async (n, kind) => {
    const run = await overview(n as number);
    expect(within(run).getByTestId("strongest-mode").dataset.kind).toBe(kind);
    const crowned = within(run).getAllByTestId("mode-dial").filter((d) => d.dataset.crowned === "true");
    expect(crowned.map((d) => d.dataset.kind)).toEqual([kind]);
    // The other modes still show their percentiles.
    expect(within(run).getAllByTestId("mode-dial").every((d) => d.querySelector("[data-percentile]"))).toBe(true);
  });

  it("no winner when the lead is under 10 points (L13): the reason, no crown", async () => {
    const run = await overview(13);
    expect(within(run).queryByTestId("strongest-mode")).toBeNull();
    expect(within(run).getByTestId("strongest-none").dataset.reason).toBe("margin_below_threshold");
    expect(within(run).getAllByTestId("mode-dial").every((d) => d.dataset.crowned === "false")).toBe(true);
  });

  it("no winner when one mode is insufficient (L9): Survival's dial is empty with its count", async () => {
    const run = await overview(9);
    expect(within(run).getByTestId("strongest-none").dataset.reason).toBe("mode_population_insufficient");
    const surv = within(run).getAllByTestId("mode-dial").find((d) => d.dataset.kind === "survival")!;
    expect(surv.querySelector('[data-state="none"]')).toBeTruthy();
    expect(surv.textContent).toContain("60 of 100 players");
  });

  it("insufficient population (L1): no percentile anywhere, the count said plainly — never a zero", async () => {
    const run = await overview(1);
    const pop = within(run).getByTestId("core-population");
    expect(within(pop).getByTestId("population-reason").textContent).toContain("Not enough players yet — 40 of the 100 needed.");
    expect(within(run).queryByTestId("population-percentile")).toBeNull();
    expect(within(run).getByTestId("mode-profile").textContent).not.toMatch(/\b0th\b|0 percentile/);
  });

  it("aggregate_not_built (L7): the date's comparison hasn't been built yet", async () => {
    const run = await overview(7);
    expect(within(run).getByTestId("population-reason").dataset.reason).toBe("aggregate_not_built");
    expect(within(run).getByTestId("population-reason").textContent).toMatch(/hasn't been built yet/);
  });

  it("the global distribution: You, percentile, median, players, cohort — and the cohort toggle", async () => {
    const run = await overview(14);
    const pop = within(run).getByTestId("core-population");
    expect(within(pop).getByTestId("population-sentence").textContent).toBe("You: 67 · 88th percentile · median 55 · 1,455 players");
    expect(within(pop).getByTestId("population-cohort").textContent).toMatch(/1,455 players · last 28 days to Sep 14/);
    expect(within(pop).getAllByTestId("dist-bin").filter((b) => b.dataset.subject === "true")).toHaveLength(1);
    fireEvent.click(within(within(pop).getByTestId("cohort-toggle")).getByText("Same day"));
    expect(within(pop).getByTestId("population-sentence").textContent).toMatch(/173 players/);
    // One cohort choice for the whole room.
    expect(within(run).getByTestId("strongest-mode").getAttribute("aria-label")).toMatch(/97th percentile/);
    // Metric tabs, not three giant histograms.
    expect(within(pop).getAllByTestId("population-distribution")).toHaveLength(1);
    fireEvent.click(within(within(pop).getByTestId("population-metric")).getByText("Accuracy"));
    expect(within(pop).getByTestId("population-sentence").textContent).toMatch(/You: 89%/);
  });

  it("the extreme outlier (L14 Time Trial) reads 99th, never 100th", async () => {
    const run = await stageRoom(14, "time_trial");
    expect(within(within(run).getByTestId("stage-population")).getByTestId("population-percentile").textContent).toMatch(/99th$/);
    expect(run.textContent).not.toMatch(/100th/);
  });
});

describe("Time Trial room", () => {
  it("23 / 29 → 25 / 28 (L4): +2 correct, 1 fewer question played, 89% vs 79% · 10 points higher, Streak +3", async () => {
    const run = await stageRoom(4, "time_trial");
    const room = within(run).getByTestId("time-trial-room");
    expect(within(room).getByTestId("change-correct").textContent).toContain("+2 correct");
    expect(within(room).getByTestId("change-played").textContent).toContain("1 fewer question played");
    expect(within(room).getByTestId("change-accuracy").textContent).toContain("89% vs 79% · 10 points higher");
    expect(within(room).getByTestId("change-streak").textContent).toContain("Streak +3");
    expect(room.textContent).not.toMatch(FORBIDDEN);
  });

  it("records: most correct NEW (25 over 23), most played below, streak new", async () => {
    const run = await stageRoom(4, "time_trial");
    expect(within(run).getByTestId("record-correct").dataset.status).toBe("new_record");
    expect(within(run).getByTestId("record-correct").textContent).toMatch(/25.*New record.*Previous best 23/);
    expect(within(run).getByTestId("record-questions_played").dataset.status).toBe("below_record");
    expect(within(run).getByTestId("record-longest_streak").dataset.status).toBe("new_record");
  });

  it("the stopwatch: one tick per question played, by result, with previous / average / record", async () => {
    const run = await stageRoom(4, "time_trial");
    const sw = within(run).getByTestId("stopwatch");
    const ticks = within(sw).getAllByTestId("stopwatch-tick");
    expect(ticks).toHaveLength(28);
    expect(ticks.filter((t) => t.dataset.outcome === "timeout")).toHaveLength(2);
    expect(within(sw).getByTestId("throughput-previous").textContent).toContain("29");
    expect(within(sw).getByTestId("throughput-average").textContent).toContain("26.3");
    expect(within(sw).getByTestId("throughput-record").textContent).toContain("29");
  });

  it("the nested donut: a category × outcome slice lights exactly its questions on the Time Trial rail only", async () => {
    const run = await stageRoom(14, "time_trial");
    const donut = within(run).getByTestId("category-donut");
    const group = within(donut).getAllByTestId("donut-legend-group").find((g) => g.dataset.group === "itemization")!;
    const slice = within(group).getAllByTestId("donut-legend-slice").find((b) => b.dataset.outcome === "correct")!;
    fireEvent.click(slice);
    const tt = stageRow(run, "time_trial");
    const n = Number(slice.textContent!.match(/\d+/)![0]);
    // Every visible icon is either lit or stepped back; the lock names all n.
    const shown = within(tt).getAllByTestId("timeline-icon").length;
    expect(lit(tt).length + dimmed(tt).length).toBe(shown);
    expect(lit(tt).length).toBeGreaterThan(0);
    expect(within(run).getByTestId("highlight-bar").textContent).toContain(`Lighting ${n} question`);
    expect(lit(tt).every((i) => i.dataset.outcome === "correct")).toBe(true);
    for (const kind of ["standard", "survival", "weak_areas", "review"]) {
      expect(stageRow(run, kind).querySelector("[data-lit]")).toBeNull();
    }
    expect(slice.getAttribute("aria-pressed")).toBe("true");
    // The slice's detail: this Time Trial and earlier ones, as counts.
    expect(within(group).getByTestId("donut-group-detail").textContent).toMatch(/Itemization.*correct.*this Time Trial/);
    fireEvent.click(within(run).getByTestId("highlight-clear"));
    expect(lit(tt)).toHaveLength(0);
  });

  it("the streak lights its exact span", async () => {
    const run = await stageRoom(10, "time_trial");
    fireEvent.click(within(within(run).getByTestId("stage-streak")).getByTestId("streak-light"));
    expect(lit(stageRow(run, "time_trial"))).toHaveLength(25);
  });

  it("history toggles correct · played · accuracy · streak; population is correct-first with three dials", async () => {
    const run = await stageRoom(14, "time_trial");
    const hist = within(run).getByTestId("stage-history");
    expect([...within(within(hist).getByTestId("history-metric")).getAllByRole("button")].map((b) => b.textContent)).toEqual(["Correct", "Played", "Accuracy", "Streak"]);
    const pop = within(run).getByTestId("stage-population");
    expect(within(pop).getByTestId("population-sentence").textContent).toMatch(/^You: 24 · 99th percentile/);
    expect(within(pop).getAllByTestId("population-dial")).toHaveLength(3);
  });
});

describe("Standard room", () => {
  it("the real ten-module course; a five-child Journey (L12)", async () => {
    const run = await stageRoom(12, "standard");
    const modules = within(run).getAllByTestId("course-module");
    expect(modules.map((m) => m.dataset.unit)).toEqual([
      "splash", "splash", "splash", "splash", "meta_reflex", "splash", "splash", "splash", "meta_reflex", "journey",
    ]);
    expect(modules[9].dataset.played).toBe("5");
    expect(modules[9].getAttribute("aria-label")).toMatch(/Journey, 5 of 5 correct/);
    expect(run.textContent).not.toMatch(/\bSlice\b/);
  });

  it("a module lights its own position on the Standard rail and names itself", async () => {
    const run = await stageRoom(14, "standard");
    const journey = within(run).getAllByTestId("course-module")[9];
    fireEvent.focus(journey);
    expect(lit(stageRow(run, "standard"))).toHaveLength(1);
    expect(lit(stageRow(run, "standard"))[0].dataset.round).toBe("10");
    expect(within(run).getByTestId("course-detail").textContent).toMatch(/Module 10 · Journey · 3 \/ 4 correct|Module 10 · Journey · \d \/ 4 correct/);
  });

  it("records (score, correct, streak), history (score · accuracy · streak), score-first population", async () => {
    const run = await stageRoom(12, "standard");
    expect(within(run).getByTestId("record-score").dataset.status).toBe("new_record");
    expect(within(run).getByTestId("record-correct")).toBeTruthy();
    expect(within(run).getByTestId("record-longest_streak")).toBeTruthy();
    expect(within(run).getByTestId("change-score").textContent).toContain("Score +15");
    expect(within(within(run).getByTestId("stage-population")).getByTestId("population-sentence").textContent).toMatch(/^You: 120 · 98th percentile/);
    expect(within(run).getByTestId("category-donut")).toBeTruthy();
    expect(within(run).getByTestId("stage-streak")).toBeTruthy();
  });
});

describe("Survival room", () => {
  it("the shaft: depth 33, strikes on their exact floors, previous and average ruled", async () => {
    const run = await stageRoom(11, "survival");
    const shaft = within(run).getByTestId("survival-shaft");
    expect(within(shaft).getAllByTestId("shaft-floor")).toHaveLength(33);
    expect(within(shaft).getAllByTestId("shaft-strike").map((s) => [s.dataset.strike, s.dataset.depth])).toEqual([["1", "24"], ["2", "30"], ["3", "33"]]);
    expect(within(shaft).getByTestId("shaft-previous")).toBeTruthy();
    expect(within(shaft).getByTestId("shaft-average")).toBeTruthy();
    expect(within(shaft).getByTestId("strike-shield").dataset.used).toBe("3");
    expect(within(shaft).getAllByTestId("shield-plate").filter((p) => p.dataset.cracked === "true")).toHaveLength(3);
  });

  it("a strike lights exactly its question on the Survival rail (rail 22 / 28 / 31)", async () => {
    const run = await stageRoom(11, "survival");
    const items = within(run).getAllByTestId("strike-item");
    expect(items.map((i) => i.dataset.position)).toEqual(["22", "28", "31"]);
    fireEvent.click(items[1]);
    const surv = stageRow(run, "survival");
    // The rail pages to the locked strike.
    await waitFor(() => expect(lit(surv)).toHaveLength(1));
    expect(lit(surv)[0].dataset.round).toBe("28");
  });

  it("the rail's own strike tabs are Free facts, on Premium and Free alike", async () => {
    await openLab("free");
    const run = await daily(11);
    const tabs = within(stageRow(run, "survival")).getAllByTestId("timeline-strike");
    expect(tabs.map((t) => t.dataset.strike)).toEqual(["1", "2", "3"].slice(0, tabs.length));
  });

  it("compare, records (deepest, correct, streak), depth-first history and population", async () => {
    const run = await stageRoom(11, "survival");
    expect(within(run).getByTestId("change-depth").textContent).toContain("5 questions deeper");
    expect(within(run).getByTestId("record-depth").dataset.status).toBe("new_record");
    expect(within(within(run).getByTestId("stage-history")).getByTestId("history-metric").textContent).toMatch(/^Depth/);
    expect(within(within(run).getByTestId("stage-population")).getByTestId("population-sentence").textContent).toMatch(/^You: 33 · 94th percentile/);
  });
});

describe("Review and Weak Areas rooms", () => {
  it("Review: each replay linked to its exact miss; 'Light both' lights both rails and nothing else", async () => {
    const run = await stageRoom(14, "review");
    const links = within(run).getAllByTestId("review-link");
    expect(links.map((l) => [l.dataset.sourceStage, l.dataset.sourcePosition, l.dataset.replayOutcome])).toEqual([
      ["time_trial", "7", "correct"], ["survival", "6", "incorrect"], ["weak_areas", "4", "correct"],
    ]);
    fireEvent.click(within(links[0]).getByTestId("review-link-light"));
    expect(lit(stageRow(run, "review")).map((i) => i.dataset.round)).toEqual(["1"]);
    await waitFor(() => expect(lit(stageRow(run, "time_trial")).map((i) => i.dataset.round)).toEqual(["7"]));
    expect(stageRow(run, "standard").querySelector("[data-lit]")).toBeNull();
    expect(run.textContent).not.toMatch(FORBIDDEN);
  });

  it("Review donut (result × source stage) appears with two or more linked replays", async () => {
    const run = await stageRoom(14, "review");
    expect(within(within(run).getByTestId("review-donut")).getAllByTestId("donut-legend-group")).toHaveLength(3);
  });

  it("Weak Areas: slots, cutoff and what the record does NOT keep — nothing invented", async () => {
    const run = await stageRoom(14, "weak_areas");
    expect(within(run).getAllByTestId("weak-areas-slot")).toHaveLength(4);
    const prov = within(run).getByTestId("weak-areas-provenance").textContent!;
    expect(prov).toMatch(/Chosen from your results before Sep 1[34]/);
    expect(prov).toMatch(/not which earlier question led to each one/);
    expect(run.textContent).not.toMatch(/missed \d+ times|last missed|miss count/i);
    expect(run.textContent).not.toMatch(FORBIDDEN);
  });
});

describe("Free / Premium", () => {
  it("Free keeps every factual row, rail and this Daily's facts; one invitation; no room", async () => {
    const run = await overview(14, "free");
    expect(within(run).getAllByTestId("daily-stage-row")).toHaveLength(5);
    expect(within(run).getByTestId("daily-free-facts").textContent).toMatch(/72 \/ 82.*88%.*15/);
    expect(within(run).getAllByTestId("daily-analysis-upgrade")).toHaveLength(1);
    expect(within(run).queryByTestId("daily-overview")).toBeNull();
    fireEvent.click(within(stageRow(run, "time_trial")).getByTestId("stage-analysis-toggle"));
    expect(within(run).getByTestId("stage-analytics").dataset.room).toBeUndefined();
    expect(within(run).queryByTestId("time-trial-room")).toBeNull();
    expect(within(run).queryByTestId("stage-analysis-upgrade")).toBeNull();
    // The selected row's Free facts stay.
    expect(within(stageRow(run, "time_trial")).getByTestId("stage-fact-streak").textContent).toContain("7");
  });
});

describe("question analytics", () => {
  const golden = (s: "lab_premium" | "lab_free") =>
    ANALYTICS_LAB_GOLDEN.scenarios[s].flatMap((p) => readHistoryPage(p).items).find((r) => r.runId === "lab-run-04")!;

  it("Premium: prior attempts and earlier-stage category totals under the review card; Free: only this run's facts", () => {
    const prem = golden("lab_premium");
    const stage = prem.stages.find((s) => s.kind === "time_trial")!;
    const { unmount } = render(<QuestionContext record={prem} stage={stage} round={buildStageViewModel(stage).rounds[1]} />);
    expect(screen.getByTestId("question-context-prior").textContent).toMatch(/Seen \d+ times? before · \d+ correct/);
    expect(screen.getByTestId("question-context-category-history").textContent).toMatch(/Earlier Time Trial stages, .*: \d+ \/ \d+ correct/);
    expect(screen.getByTestId("question-context-stage-category").textContent).toMatch(/in this Time Trial: \d+ \/ \d+ correct/);
    unmount();
    const free = golden("lab_free");
    const fstage = free.stages.find((s) => s.kind === "time_trial")!;
    render(<QuestionContext record={free} stage={fstage} round={buildStageViewModel(fstage).rounds[1]} />);
    expect(screen.queryByTestId("question-context-prior")).toBeNull();
    expect(screen.queryByTestId("question-context-category-history")).toBeNull();
    expect(screen.getByTestId("question-context-stage-category")).toBeTruthy();
  });

  it("a Journey lists each child; no learning-state words", () => {
    const rec = golden("lab_premium");
    const std = rec.stages.find((s) => s.kind === "standard")!;
    const journey = buildStageViewModel(std).rounds[9];
    render(<QuestionContext record={rec} stage={std} round={journey} />);
    expect(screen.getAllByTestId("question-context-item")).toHaveLength(journey.occurrences.length);
    expect(screen.getByTestId("question-context").textContent).not.toMatch(FORBIDDEN);
  });
});

describe("keyboard, touch, motion, performance", () => {
  it("keyboard: focus previews, Enter/click locks (aria-pressed), Escape clears", async () => {
    const run = await stageRoom(14, "time_trial");
    const donut = within(run).getByTestId("category-donut");
    const timeout = within(donut).getAllByTestId("donut-legend-outcome").find((b) => b.dataset.outcome === "timeout")!;
    act(() => timeout.focus());
    const rail = within(stageRow(run, "time_trial")).getByTestId("question-timeline");
    expect(rail.dataset.highlight).toBe("on");
    fireEvent.click(timeout);
    expect(timeout.getAttribute("aria-pressed")).toBe("true");
    fireEvent.blur(timeout);
    expect(within(run).getByTestId("highlight-bar").textContent).toContain("Lighting 2 questions");
    expect(rail.dataset.highlight).toBe("on");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(rail.dataset.highlight).toBeUndefined();
    expect(timeout.getAttribute("aria-pressed")).toBe("false");
  });

  it("touch: legend and strike targets are 44px, and a tap locks", async () => {
    coarse = true;
    const run = await stageRoom(11, "survival");
    const item = within(run).getAllByTestId("strike-item")[0];
    expect(item.className).toContain("min-h-[44px]");
    fireEvent.click(item);
    expect(item.getAttribute("aria-pressed")).toBe("true");
    const legend = within(within(run).getByTestId("stage-streak")).getByTestId("streak-light");
    expect(legend.className).toContain("min-h-[44px]");
  });

  it("reduced motion: every figure is final at once", async () => {
    document.documentElement.classList.add("reduce-motion");
    const run = await stageRoom(4, "time_trial");
    expect(within(run).getByTestId("record-correct").textContent).toContain("25");
    expect(within(within(run).getByTestId("stopwatch")).getAllByTestId("stopwatch-tick")).toHaveLength(28);
    expect(within(run).getAllByTestId("donut-inner").length).toBeGreaterThan(0);
    expect(within(run).getAllByTestId("donut-outer").length).toBeGreaterThan(0);
  });

  it("performance: one expanded Daily mounts one room; collapsed Dailies mount none; a hover keeps the chart", async () => {
    const run = await overview(14);
    expect(screen.getAllByTestId("daily-analytics-region")).toHaveLength(1);
    expect(screen.getAllByTestId("daily-overview")).toHaveLength(1);
    const svg = within(run).getByTestId("daily-donut-chart").querySelector("svg")!;
    const btn = within(run).getAllByTestId("donut-legend-outcome")[0];
    fireEvent.pointerEnter(btn, { pointerType: "mouse" });
    fireEvent.pointerLeave(btn, { pointerType: "mouse" });
    expect(within(run).getByTestId("daily-donut-chart").querySelector("svg")).toBe(svg);
    // Opening another Daily closes this one: still one room.
    fireEvent.click(within(runRows()[1]).getByTestId("daily-analysis-toggle"));
    await waitFor(() => expect(screen.getAllByTestId("daily-overview")).toHaveLength(1));
  });
});
