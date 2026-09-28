/**
 * HUB5 — product certification of History against Timmy's deterministic
 * fixtures, through the REAL page: `LobbyPreviewPage` → `LeaguecraftHub` →
 * `DailyHistorySection` / `DailyRunRow` / `HistoryAnalysis` /
 * `QuestionTimeline` / `QuestionReviewHost` / `StudyHistoryLedger` /
 * `ReviewPane`. Nothing here renders a History component on its own; every
 * assertion is about what the production components do with a fixture.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
/* The app mounts every route inside AuthProvider; this test mounts the page
   alone. The Missed hook reads only `loading`, and the preview hands it a
   resolved bank, so an inert, settled auth is the whole of what it needs. */
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ loading: false, user: null, session: null }) }));

import LobbyPreviewPage from "./LobbyPreviewPage";
import { TIMMY_DAILY } from "./history/timmyHistoryInput";
import { quizContentOf, quizRef } from "./history/questionIdentity";

let coarse = false;

beforeEach(() => {
  coarse = false;
  // A wide row, so a stage's question rail shows a whole page of icons.
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => 1200);
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query === "(pointer: coarse)" ? coarse : false,
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

function renderPreview() {
  return render(
    <MemoryRouter initialEntries={["/dev/lobby-preview"]}>
      <LobbyPreviewPage />
    </MemoryRouter>,
  );
}

const runRows = () => screen.getAllByTestId("daily-run-row");
const stageKinds = (row: HTMLElement) =>
  within(row).getAllByTestId("daily-stage-row").map((s) => s.getAttribute("data-stage-kind"));
const pick = (id: string) => fireEvent.click(screen.getByTestId(id));

async function loadAllRuns() {
  await waitFor(() => expect(runRows()).toHaveLength(10));
  pick("daily-history-load-more");
  await waitFor(() => expect(runRows()).toHaveLength(11));
}

describe("History is one surface, and Daily leads it", () => {
  it("1, 2, 12, 13 — Daily runs first, then the ordinary Ranked and Practice ledger", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const record = screen.getByTestId("history-record");
    const daily = within(record).getByTestId("daily-history");
    const ledger = within(record).getByTestId("study-history");
    expect(daily.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(ledger).getAllByTestId("ranked-match-row").length).toBeGreaterThan(0);
    expect(within(ledger).getAllByTestId("study-history-row").length).toBeGreaterThan(0);
    // One History: no workspace tabs.
    expect(screen.queryByRole("tab", { name: /trends/i })).toBeNull();
  });

  it("14 — no Daily child match appears as an ordinary Ranked row", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const children = new Set(TIMMY_DAILY.rows.daily_run_stages.map((s) => s.child_match_id));
    const rankedIds = screen.getAllByTestId("ranked-match-row")
      .map((row) => row.querySelector("[data-testid='question-timeline']")?.getAttribute("data-match-id"));
    for (const id of rankedIds) expect(children.has(id ?? "")).toBe(false);
  });
});

describe("Daily → Stage → Question", () => {
  it("3, 4, 5 — five-stage runs in saved order, then More loads the four-stage first run", async () => {
    renderPreview();
    await loadAllRuns();
    const rows = runRows();
    expect(rows.slice(0, 10).every((r) => r.getAttribute("data-run-stages") === "5")).toBe(true);
    expect(rows[10].getAttribute("data-run-stages")).toBe("4");
    expect(stageKinds(rows[10])).toEqual(["time_trial", "standard", "survival", "review"]);
    // Run 2 played its own day's shuffle; the saved order is what renders.
    expect(stageKinds(rows[9])).toEqual(["survival", "weak_areas", "standard", "time_trial", "review"]);
    expect(stageKinds(rows[0])).toEqual(["time_trial", "standard", "survival", "weak_areas", "review"]);
    expect(screen.queryByTestId("daily-history-load-more")).toBeNull();
  });

  it("6, 7 — Free: every question is open to inspect with nothing expanded", async () => {
    renderPreview();
    pick("lobby-preview-entitlement-free");
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    expect(within(latest).getByTestId("daily-run-score")).toHaveTextContent("173");
    expect(within(latest).getByTestId("daily-run-accuracy")).toHaveTextContent("88%");
    for (const stage of within(latest).getAllByTestId("daily-stage-row")) {
      expect(within(stage).getAllByTestId("timeline-icon").length).toBeGreaterThan(0);
    }
    expect(screen.queryByTestId("daily-analysis")).toBeNull();
  });

  it("16 — a Survival stage draws one position per round, however many questions it settled", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const survival = within(runRows()[0]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    // Eight question results in four rounds: four icons, never eight.
    expect(within(survival).getAllByTestId("timeline-icon")).toHaveLength(4);
    expect(within(survival).getByTestId("daily-stage-result")).toHaveTextContent("7/8");
  });

  it("19, 20 — Time Trial and Survival state their own terminal facts", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const poor = runRows()[2]; // run 9
    const kind = (k: string) => within(poor).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === k)!;
    expect(within(kind("time_trial")).getByTestId("daily-stage-ended")).toHaveTextContent("bank ran out");
    expect(within(kind("survival")).getByTestId("daily-stage-ended")).toHaveTextContent("out of mistakes");
    expect(within(kind("standard")).queryByTestId("daily-stage-ended")).toBeNull();
    // No speed, response-time or duration claim anywhere in the Daily record.
    expect(within(screen.getByTestId("daily-history")).queryByText(/second|speed|faster|slower|ms\b/i)).toBeNull();
  });
});

describe("Premium gates analysis only; the other states are not a paywall", () => {
  it("8, 17 — Premium opens the strong run's Daily Focus: accuracy history; no raw-score best, no signals, no recovery tile", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    const analysis = within(latest).getByTestId("daily-analysis");
    expect(analysis).toHaveAttribute("data-state", "available");
    // HUB6.3E: the raw Daily score is not a performance record (Review awards
    // points after misses) — no "personal best" tile, anywhere.
    expect(within(analysis).queryByTestId("daily-analysis-best")).toBeNull();
    expect(within(analysis).queryByText(/personal best/i)).toBeNull();
    // The HUB2.3 accuracy history stays, without an Up / Down / Stable verdict.
    expect(within(analysis).getByTestId("history-trajectory")).not.toHaveAttribute("data-direction");
    // HUB6.1: Review recovery and the learning-signal labels (recurring /
    // recovered weakness) are not launch presentation. The golden still
    // carries them; nothing renders them.
    expect(within(analysis).queryByTestId("daily-analysis-recovery")).toBeNull();
    expect(within(latest).queryByText(/Learning signals|Recurring weakness|Recovered|Review recovery/)).toBeNull();
    expect(within(analysis).queryByText(/Upgrade/)).toBeNull();
    // No invented praise.
    expect(within(analysis).queryByText(/amazing|great job|crushing|well done/i)).toBeNull();
  });

  it("F — accuracy history draws for every run with no trend verdict (HUB6.3E: Up / Down / Stable removed)", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    for (const i of [1, 2]) {
      fireEvent.click(within(runRows()[i]).getByTestId("daily-analysis-toggle"));
      const trend = within(runRows()[i]).getByTestId("history-trajectory");
      expect(trend.textContent).not.toMatch(/\b(Up|Down|Stable)\b/);
    }
  });

  it("E, J — the poor run states its drop and its failed replay, without judgment", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const poor = runRows()[2];
    fireEvent.click(within(poor).getByTestId("daily-analysis-toggle"));
    expect(within(poor).getByTestId("daily-analysis-delta")).toHaveTextContent(/−\d+ points?/);
    // The failed replay is the Review stage's own exact record (HUB6.1).
    const reviewRow = within(poor).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === "review")!;
    fireEvent.click(within(reviewRow).getByTestId("stage-analysis-toggle"));
    const review = within(poor).getByTestId("stage-analytics");
    const results = within(review).getAllByTestId("stage-question-card").map((c) => c.dataset.outcome);
    expect(results.filter((o) => o === "correct")).toHaveLength(1);
    expect(results.filter((o) => o === "incorrect")).toHaveLength(2);
    expect(within(poor).queryByText(/bad|poor|fail|weak run/i)).toBeNull();
  });

  it("L — Survival strikes appear only in Premium stage analysis", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const survival = within(runRows()[2]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    fireEvent.click(within(survival).getByTestId("stage-analysis-toggle"));
    const focus = runRows()[2];
    expect(within(focus).getByTestId("stage-analysis-strikes")).toHaveTextContent("3 of 3");
    expect(within(survival).getByTestId("daily-stage-ended")).toHaveTextContent("out of mistakes");
  });

  it("8, N — Free: one invitation per run, no stage-level upsells, basic record intact", async () => {
    renderPreview();
    pick("lobby-preview-entitlement-free");
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    expect(within(latest).getByTestId("daily-analysis-upgrade")).toHaveTextContent("Mogzy Premium");
    // Stages stay navigable and repeat no invitation; Survival's strikes stay
    // Premium-only.
    for (const nav of within(latest).getAllByTestId("stage-analysis-toggle")) {
      fireEvent.click(nav);
      const focus = within(latest).getByTestId("stage-analytics");
      expect(within(focus).queryByText(/Upgrade|Premium/)).toBeNull();
      expect(within(focus).queryByTestId("stage-analysis-strikes")).toBeNull();
    }
  });

  it("10, O — entitlement unavailable: a retry, never an upsell", async () => {
    renderPreview();
    pick("lobby-preview-entitlement-unavailable");
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    expect(within(latest).getByTestId("daily-analysis-unavailable")).toHaveTextContent("unavailable right now");
    expect(within(screen.getByTestId("daily-history")).queryByText(/Upgrade|Premium/)).toBeNull();
    // The Missed bank's read failed too: an error, not the paywall.
    pick("history-questions-toggle");
    pick("review-source-missed");
    expect(await screen.findByTestId("missed-questions-error")).toBeInTheDocument();
    expect(screen.queryByTestId("missed-questions-locked")).toBeNull();
  });

  it("9, M — first Daily: counts, not a paywall", async () => {
    renderPreview();
    pick("lobby-preview-firstDaily");
    await waitFor(() => expect(runRows()).toHaveLength(1));
    const only = runRows()[0];
    expect(stageKinds(only)).toEqual(["time_trial", "standard", "survival", "review"]);
    fireEvent.click(within(only).getByTestId("daily-analysis-toggle"));
    const analysis = within(only).getByTestId("daily-analysis");
    expect(analysis).toHaveAttribute("data-state", "insufficient_evidence");
    // HUB6: every comparison keeps its place, dormant, with the server's count.
    expect(within(analysis).getByTestId("history-pending-delta")).toHaveTextContent("0 of 1 matching runs");
    expect(within(analysis).getByTestId("history-pending-average")).toHaveTextContent("0 of 3 matching runs");
    expect(within(analysis).getByTestId("history-pending-trend")).toHaveTextContent("1 of 5 matching runs");
    expect(within(analysis).queryByTestId("history-trajectory")).toBeNull();
    expect(within(analysis).queryByText(/Upgrade|Premium/)).toBeNull();
  });

  it("11, P — a not-applicable stage shows its record and no analysis", async () => {
    renderPreview();
    await loadAllRuns();
    const first = runRows()[10];
    const survival = within(first).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    fireEvent.click(within(survival).getByTestId("stage-analysis-toggle"));
    const focus = within(first).getByTestId("stage-analytics");
    expect(focus.dataset.stageKind).toBe("survival");
    expect(within(focus).queryByTestId("stage-analysis")).toBeNull();
    fireEvent.click(within(first).getByTestId("daily-overview-return"));
    // Back on the Daily Overview of the same Focus: the run cannot be
    // compared, and says why in the server's terms.
    expect(first.dataset.focused).toBe("true");
    expect(within(first).getByTestId("daily-analysis-insufficient")).toHaveTextContent(/settings were not recorded/);
  });

  it("A — the newcomer's History renders no Daily section and no fake analysis", async () => {
    renderPreview();
    pick("lobby-preview-newcomer");
    await waitFor(() => expect(screen.getByTestId("study-history-empty")).toBeInTheDocument());
    expect(screen.queryByTestId("daily-history")).toBeNull();
    expect(screen.queryByTestId("daily-analysis-toggle")).toBeNull();
  });
});

describe("question review hosts on Timmy's data", () => {
  it("23 — touch opens the stage's question in a Sheet, with the frozen content", async () => {
    coarse = true;
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const standard = within(runRows()[0]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "standard")!;
    fireEvent.click(within(standard).getAllByTestId("timeline-icon")[1]);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("data-testid", "question-review-sheet");
    expect(within(dialog).getByText(quizContentOf(quizRef("rabadon-ap")).prompt)).toBeInTheDocument();
    expect(screen.queryByTestId("question-review-popover")).toBeNull();
  });

  it("15 — a repeated ref opens its OWN occurrence: round 2 of run 11's Survival", async () => {
    coarse = true;
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const survival = within(runRows()[0]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    fireEvent.click(within(survival).getAllByTestId("timeline-icon")[1]);
    const dialog = await screen.findByRole("dialog");
    // Round 2 asked the Annie concept's SECOND instance (160 AP), not the first.
    expect(within(dialog).getByText(/With 160 AP/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/With 100 AP/)).toBeNull();
  });

  it("24 — a fine pointer opens the same card in a Popover", { timeout: 60000 }, async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const standard = within(runRows()[0]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "standard")!;
    fireEvent.click(within(standard).getAllByTestId("timeline-icon")[1]);
    const popover = await screen.findByTestId("question-review-popover");
    expect(within(popover).getByText(quizContentOf(quizRef("rabadon-ap")).prompt)).toBeInTheDocument();
    expect(screen.queryByTestId("question-review-sheet")).toBeNull();
  });
});

describe("Owned & Missed agree with History", () => {
  it("Premium: Owned counts Daily discoveries; Missed lists the Practice miss of a Daily question", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    pick("history-questions-toggle");
    expect(await screen.findByTestId("owned-total")).toBeInTheDocument();
    pick("review-source-missed");
    const missed = await screen.findAllByTestId("missed-question");
    expect(missed).toHaveLength(25);
    const prompt = quizContentOf(quizRef("rabadon-ap")).prompt;
    expect(missed.some((m) => m.textContent?.includes(prompt))).toBe(true);
  });

  it("Free: the Missed bank is the real paywall; History's basic record is not", async () => {
    renderPreview();
    pick("lobby-preview-entitlement-free");
    await waitFor(() => expect(runRows()).toHaveLength(10));
    pick("history-questions-toggle");
    pick("review-source-missed");
    expect(await screen.findByTestId("missed-questions-locked")).toBeInTheDocument();
    expect(screen.getByTestId("study-history-upsell")).toBeInTheDocument();
  });
});

describe("HUB6.2 — full-length stages stay navigable (real HUB2.3 golden)", () => {
  const openFull = async () => {
    renderPreview();
    pick("lobby-preview-fullDaily");
    await waitFor(() => expect(runRows()).toHaveLength(2));
    return runRows()[0];
  };
  const row = (run: HTMLElement, kind: string) =>
    within(run).getAllByTestId("daily-stage-row").find((s) => s.getAttribute("data-stage-kind") === kind)!;

  /** Walk a stage's HUB3 rail page by page; every round it reaches. */
  const walkRail = (stage: HTMLElement): number[] => {
    const seen = new Set<number>();
    for (let guard = 0; guard < 20; guard++) {
      for (const icon of within(stage).getAllByTestId("timeline-icon")) seen.add(Number(icon.dataset.round));
      const next = within(stage).queryByTestId("timeline-next") as HTMLButtonElement | null;
      if (!next || next.disabled) break;
      fireEvent.click(next);
    }
    return [...seen].sort((a, b) => a - b);
  };

  it("13 — a 28-question Time Trial: every question reachable on its rail and listed below it, ending on its bank", async () => {
    const run = await openFull();
    const tt = row(run, "time_trial");
    expect(within(tt).getByTestId("question-timeline").dataset.total).toBe("28");
    expect(walkRail(tt)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    fireEvent.click(within(tt).getByTestId("stage-analysis-toggle"));
    // HUB6.3E: a HUB2.3 payload has no analytics room; its stage lists its
    // exact questions (HUB6.2's lane is gone — one analytics system).
    expect(within(run).getAllByTestId("stage-question-card")).toHaveLength(28);
    expect(within(run).queryByTestId("stage-lane")).toBeNull();
    expect(within(tt).getByTestId("daily-stage-ended")).toHaveTextContent("bank ran out");
    // HUB6.3D: "questions played", never "settled".
    expect(within(tt).getByTestId("stage-fact-played")).toHaveTextContent(/\/ 28$/);
    expect(tt.textContent).not.toMatch(/settled/i);
    // The rail is still whole while its stage is selected.
    expect(within(tt).getByTestId("question-timeline").dataset.total).toBe("28");
  });

  it("14 — a ten-module Standard: Splash, Meta Reflex and Mastery modules, each reachable", async () => {
    const run = await openFull();
    const std = row(run, "standard");
    expect(walkRail(std)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
    fireEvent.click(within(std).getByTestId("stage-analysis-toggle"));
    expect(within(run).getAllByTestId("stage-question-card")).toHaveLength(10);
    // The rail is the module map: every module in place, its C / played on
    // its badge.
    const icons = within(std).getAllByTestId("timeline-icon");
    expect(icons).toHaveLength(10);
    expect(within(icons[4]).getByTestId("timeline-badge")).toHaveTextContent("4/5");
    expect(within(icons[9]).getByTestId("timeline-badge")).toHaveTextContent("3/4");
  });

  it("a long Survival: mixed single and multi-question rounds, three strikes counted, none pinned to a question", async () => {
    const run = await openFull();
    const surv = row(run, "survival");
    fireEvent.click(within(surv).getByTestId("stage-analysis-toggle"));
    expect(within(run).getAllByTestId("stage-question-card")).toHaveLength(8);
    expect(within(surv).getByTestId("stage-analysis-strikes")).toHaveTextContent("3 of 3");
    expect(within(surv).getByTestId("stage-analysis-depth")).toHaveTextContent("13");
    expect(within(surv).getByTestId("daily-stage-ended")).toHaveTextContent("out of mistakes");
    // A HUB2.3 payload has no per-question strike markers: none is pinned.
    expect(within(surv).queryAllByTestId("timeline-strike")).toHaveLength(0);
    expect(run.textContent).not.toMatch(/strike \d|struck/i);
  });
});
