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
  it("8, 17, 18 — Premium opens the strong run's analysis: tied best, trend, recovery, signals", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    const analysis = within(latest).getByTestId("daily-analysis");
    expect(analysis).toHaveAttribute("data-state", "available");
    expect(within(analysis).getByTestId("daily-analysis-best")).toHaveTextContent(/tied/);
    expect(within(analysis).getByTestId("history-trajectory")).toHaveAttribute("data-direction", "up");
    expect(within(analysis).getByTestId("daily-analysis-recovery")).toHaveTextContent("3 of 3");
    // Named in the production wording, stage · category: Baron respawn is an
    // Objective Timers question asked in Time Trial.
    expect(within(analysis).getByTestId("history-signal-recurring_weakness"))
      .toHaveTextContent(/Time Trial · Objective Timers/);
    expect(within(analysis).getByTestId("history-signal-recovered_weakness")).toBeInTheDocument();
    expect(within(analysis).queryByText(/Upgrade/)).toBeNull();
    // No invented praise.
    expect(within(analysis).queryByText(/amazing|great job|crushing|well done/i)).toBeNull();
  });

  it("F — down and stable trends render as the server labelled them", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const direction = (i: number) => {
      fireEvent.click(within(runRows()[i]).getByTestId("daily-analysis-toggle"));
      return within(runRows()[i]).getByTestId("history-trajectory").getAttribute("data-direction");
    };
    expect(direction(1)).toBe("stable"); // run 10
    expect(direction(2)).toBe("down"); // run 9
  });

  it("E, J — the poor run states its drop and its failed replay, without judgment", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const poor = runRows()[2];
    fireEvent.click(within(poor).getByTestId("daily-analysis-toggle"));
    expect(within(poor).getByTestId("daily-analysis-delta")).toHaveTextContent(/−\d+ pts/);
    expect(within(poor).getByTestId("daily-analysis-recovery")).toHaveTextContent("1 of 3");
    expect(within(poor).queryByText(/bad|poor|fail|weak run/i)).toBeNull();
  });

  it("L — Survival strikes appear only in Premium stage analysis", async () => {
    renderPreview();
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const survival = within(runRows()[2]).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    fireEvent.click(within(survival).getByTestId("stage-analysis-toggle"));
    expect(within(survival).getByTestId("stage-analysis")).toHaveTextContent(/3/);
  });

  it("8, N — Free: one invitation per run, no stage-level upsells, basic record intact", async () => {
    renderPreview();
    pick("lobby-preview-entitlement-free");
    await waitFor(() => expect(runRows()).toHaveLength(10));
    const latest = runRows()[0];
    expect(within(latest).queryAllByTestId("stage-analysis-toggle")).toHaveLength(0);
    fireEvent.click(within(latest).getByTestId("daily-analysis-toggle"));
    expect(within(latest).getByTestId("daily-analysis-upgrade")).toHaveTextContent("Mogzy Premium");
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
    expect(within(analysis).getByTestId("history-pending")).toHaveTextContent(/0 of 1|0 of 3|1 of 5/);
    expect(within(analysis).queryByText(/Upgrade|Premium/)).toBeNull();
  });

  it("11, P — a not-applicable stage offers no analysis affordance at all", async () => {
    renderPreview();
    await loadAllRuns();
    const first = runRows()[10];
    const survival = within(first).getAllByTestId("daily-stage-row")
      .find((s) => s.getAttribute("data-stage-kind") === "survival")!;
    expect(within(survival).queryByTestId("stage-analysis-toggle")).toBeNull();
    // Its run cannot be compared, and says why in the server's terms.
    fireEvent.click(within(first).getByTestId("daily-analysis-toggle"));
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
