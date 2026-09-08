/**
 * CON1 Step 2 — the Admin Quiz Review → Content Factory workflow.
 *
 * What is being held:
 *   1. an operator can start a content run from a question they are reading,
 *      and from a multi-selection, WITHOUT leaving Quiz Review;
 *   2. a question with a KNOWN failure cannot be handed off as normal
 *      publishing, and the reason is on screen;
 *   3. the reviewer's `missing_asset` annotation stays visibly its own claim,
 *      never a computed verdict and never a blocker;
 *   4. the selection is ordered, survives paging/filtering, and cannot pick up
 *      a non-publishable source kind;
 *   5. nothing on this surface offers the diagnostic override flags.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminQuizReview from "./AdminQuizReview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { ReviewQuestion } from "@/lib/quiz/api";
import type { AssetStatus } from "@/lib/quiz/assetStatus";
import { EXACT_MINION_PRESENTATION } from "@/lib/quiz-screenshot/presentationFixtures";

const getReviewQuestions = vi.fn();
const getReviewQuestion = vi.fn();
const getReviewFilterOptions = vi.fn();
const getReviewUniverse = vi.fn();

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getReviewQuestions: (...a: unknown[]) => getReviewQuestions(...a),
      getReviewQuestion: (...a: unknown[]) => getReviewQuestion(...a),
      getReviewFilterOptions: () => getReviewFilterOptions(),
      getReviewUniverse: (...a: unknown[]) => getReviewUniverse(...a),
    },
  };
});

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => undefined,
  getChampionSplash: () => undefined,
  getChampionLoading: () => undefined,
}));

const NOT_REQUIRED: AssetStatus = {
  status: "not_required", reason: "", references: [], unresolved: [],
  degraded_to_text: false, optional_unresolved: false, case_repaired: false,
};

const RESOLVED: AssetStatus = { ...NOT_REQUIRED, status: "resolved" };

const UNRESOLVED: AssetStatus = {
  status: "unresolved",
  reason: "image_path: 'assets/champions/Ghost/icon.png' does not resolve to a file on disk",
  references: [{
    channel: "image_path", path: "assets/champions/Ghost/icon.png",
    requirement: "required", resolution: "missing", resolved_path: null,
    reason: "does not resolve",
  }],
  unresolved: [{
    channel: "image_path", path: "assets/champions/Ghost/icon.png",
    requirement: "required", resolution: "missing", resolved_path: null,
    reason: "does not resolve",
  }],
  degraded_to_text: false, optional_unresolved: false, case_repaired: false,
};

const mkQuestion = (id: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion => ({
  id,
  question_text: `Question number ${id}`,
  category: "items",
  format: "multiple_choice",
  choices: ["Thornmail", "Sunfire Aegis", "Randuin's Omen"],
  correct_answer: { type: "text", value: "Thornmail" },
  is_active: true,
  review_status: "unreviewed",
  favorite_for_shorts: false,
  missing_asset: false,
  asset_status: NOT_REQUIRED,
  ...over,
});

/** 1 plain and ready · 2 asset-unresolved · 3 presentation-incomplete ·
 *  4 unsupported source shape · 5 reviewer-flagged but computed-OK ·
 *  6 a shorts favorite. */
const ROWS: ReviewQuestion[] = [
  mkQuestion(1),
  mkQuestion(2, { asset_status: UNRESOLVED }),
  mkQuestion(3, { presentation: EXACT_MINION_PRESENTATION as Record<string, unknown> }),
  mkQuestion(4, { choices: ["Only one option"] }),
  mkQuestion(5, { missing_asset: true, asset_status: RESOLVED }),
  mkQuestion(6, { favorite_for_shorts: true }),
];

const listOf = (questions: ReviewQuestion[]) => ({
  ok: true, total: questions.length, page: 1, page_size: 50, pages: 1, questions,
});

const FILTER_OPTIONS = {
  ok: true, categories: ["items"], source_types: ["pro"],
  formats: ["multiple_choice"], review_statuses: ["unreviewed"], packs: [],
};

function renderReview(selectedQuestionId: number | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminQuizReview
          embedded
          selectedQuestionId={selectedQuestionId}
          onSelectQuestion={vi.fn()}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Tick the checkbox on a list row (the first button inside it). */
function check(container: HTMLElement, id: number) {
  const row = container.querySelector<HTMLElement>(`[data-question-id="${id}"]`);
  expect(row).toBeTruthy();
  fireEvent.click(within(row!).getAllByRole("button")[0]);
}

const commandText = () => screen.getByTestId("generate-content-command").textContent ?? "";

/**
 * Open a disclosure the way an operator does.
 *
 * `<details>` keeps its children mounted, so a fireEvent.click would "work"
 * without this — which is exactly why it is here: a test that never opens the
 * section cannot notice if the section stops being reachable.
 */
const openDisclosure = (testId: string) => {
  const details = screen.getByTestId(testId) as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
};
const openAdvanced = () => openDisclosure("generate-content-advanced");
const openDeveloperTools = () => openDisclosure("generate-content-developer");

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setAdminKey("secret-admin");
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  getReviewFilterOptions.mockResolvedValue(FILTER_OPTIONS);
  getReviewQuestions.mockResolvedValue(listOf(ROWS));
  getReviewUniverse.mockResolvedValue({
    ok: true, total: 0, rows: [],
    provenance: {
      schema_version: "1", baseline_id: "baseline000", database: { name: "test" },
      collector_errors: [],
    },
  });
  getReviewQuestion.mockImplementation(async (id: number) => {
    const q = ROWS.find((r) => r.id === id);
    if (!q) throw new Error("Quiz API 404: not found");
    return { ok: true, question: q };
  });
});
afterEach(() => { cleanup(); clearAdminKey(); vi.clearAllMocks(); });

// ---------------------------------------------------------------------------
// Single stored question
// ---------------------------------------------------------------------------

describe("single stored question", () => {
  it("offers Generate Content from the question the operator is reading", async () => {
    renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    expect(await screen.findByTestId("generate-content-panel")).toBeTruthy();
    expect(screen.getByText("Generate Content (1)")).toBeTruthy();
  });

  it("a known-ready question produces a copyable, parser-valid command", async () => {
    renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    openDeveloperTools();
    expect(commandText()).toBe(
      'npm run quiz:screenshots -- --question-id 1 --states "question,correct" ' +
        "--formats mobile-social",
    );
    const copy = screen.getByTestId("generate-content-copy") as HTMLButtonElement;
    expect(copy.disabled).toBe(false);
    fireEvent.click(copy);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(commandText()));
  });

  it("the command reflects the configured formats and states", async () => {
    renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    openAdvanced();
    fireEvent.click(screen.getByTestId("content-format-vertical"));
    fireEvent.click(screen.getByTestId("content-state-correct"));
    fireEvent.click(screen.getByTestId("content-difficulty-diamond"));
    openDeveloperTools();

    expect(commandText()).toBe(
      "npm run quiz:screenshots -- --question-id 1 --states question " +
        '--formats "mobile-social,vertical" --difficulty diamond',
    );
  });

  it("a post mode replaces the state selection, as the CLI requires", async () => {
    renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    openAdvanced();
    fireEvent.click(screen.getByTestId("content-post-answer-reveal"));
    openDeveloperTools();
    expect(commandText()).toContain("--post answer-reveal");
    expect(commandText()).not.toContain("--states");
    // and the now-irrelevant state toggles are gone from the surface
    expect(screen.queryByTestId("content-state-question")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Readiness blocking
// ---------------------------------------------------------------------------

describe("known failures are blocked from normal publishing", () => {
  it("an unresolved REQUIRED asset blocks the handoff and says why", async () => {
    renderReview(2);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    expect(screen.getByTestId("readiness-row-2").getAttribute("data-content-readiness"))
      .toBe("asset-unresolved");
    expect(screen.getByTestId("generate-content-blocked")).toBeTruthy();
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("readiness-reason-2").textContent).toContain(
      "canonical resolver could not resolve",
    );
  });

  it("an incomplete presentation blocks the handoff and says why", async () => {
    renderReview(3);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    expect(screen.getByTestId("readiness-row-3").getAttribute("data-content-readiness"))
      .toBe("presentation-incomplete");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("readiness-reason-3").textContent).toContain(
      "production layout system draws no scenario",
    );
  });

  it("an unsupported question shape blocks the handoff", async () => {
    renderReview(4);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");
    expect(screen.getByTestId("readiness-row-4").getAttribute("data-content-readiness"))
      .toBe("unsupported");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
  });

  it("never offers the diagnostic override flags", async () => {
    const { container } = renderReview(2);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");
    // Not as a control, and not as text an operator could copy.
    expect(container.textContent).not.toContain("--allow-incomplete-presentation");
    expect(container.textContent).not.toContain("--allow-missing-assets");
  });

  it("never puts the admin key in the command", async () => {
    const { container } = renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");
    expect(commandText()).not.toContain("secret-admin");
    expect(commandText()).not.toContain("--admin-key");
    expect(container.textContent).not.toContain("secret-admin");
  });
});

describe("the reviewer's flag stays a separate, non-blocking claim", () => {
  it("shows a reviewer flag beside a computed-ready verdict, and still allows the handoff", async () => {
    renderReview(5);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");

    expect(screen.getByTestId("readiness-reviewer-flag-5")).toBeTruthy();
    expect(screen.getByTestId("readiness-row-5").getAttribute("data-content-readiness"))
      .toBe("ready");
    expect(screen.getByTestId("readiness-reviewer-flagged").textContent)
      .toContain("1 reviewer-flagged");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("generate-content-blocked")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multi-select
// ---------------------------------------------------------------------------

describe("multi-select", () => {
  it("selects several stored questions and generates one package", async () => {
    const { container } = renderReview();
    await screen.findByText("Question number 1");

    check(container, 1);
    check(container, 6);
    expect(screen.getByText("2 selected")).toBeTruthy();

    fireEvent.click(screen.getByTestId("generate-content-open-selection"));
    const panel = await screen.findByTestId("generate-content-panel");
    expect(within(panel).getByText("Generate Content (2)")).toBeTruthy();
    expect(commandText()).toContain('--question-ids "1,6"');
  });

  it("orders ids by selection, deterministically", async () => {
    const { container } = renderReview();
    await screen.findByText("Question number 1");

    check(container, 6);
    check(container, 1);
    check(container, 5);
    fireEvent.click(screen.getByTestId("generate-content-open-selection"));
    await screen.findByTestId("generate-content-panel");
    expect(commandText()).toContain('--question-ids "6,1,5"');
  });

  it("survives a page of filtering: the selection holds its own row data", async () => {
    const { container } = renderReview();
    await screen.findByText("Question number 1");
    check(container, 1);
    check(container, 6);

    // The list is replaced by a narrower result set that excludes both rows.
    // The search term has to actually change: an unchanged filter object is
    // the same react-query key, so nothing would refetch.
    getReviewQuestions.mockResolvedValue(listOf([ROWS[1]]));
    fireEvent.change(screen.getByPlaceholderText(/Malphite/), { target: { value: "ghost" } });
    fireEvent.click(screen.getByText("Search"));
    await waitFor(() => expect(screen.queryByText("Question number 1")).toBeNull());

    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByTestId("generate-content-open-selection"));
    await screen.findByTestId("generate-content-panel");
    expect(commandText()).toContain('--question-ids "1,6"');
  });

  it("blocks a package containing a blocked row, and drops it only on request", async () => {
    const { container } = renderReview();
    await screen.findByText("Question number 1");
    check(container, 1);
    check(container, 2); // unresolved required asset

    fireEvent.click(screen.getByTestId("generate-content-open-selection"));
    await screen.findByTestId("generate-content-panel");

    expect(screen.getByTestId("readiness-blocked").textContent).toBe("1 blocked");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(true);
    // The blocked row is NOT silently dropped — the command still names it.
    expect(commandText()).toContain('--question-ids "1,2"');

    fireEvent.click(screen.getByTestId("generate-content-drop-blocked"));
    await waitFor(() => expect(commandText()).toContain("--question-id 1"));
    expect(commandText()).not.toContain("--question-ids");
    expect((screen.getByTestId("generate-content-copy") as HTMLButtonElement).disabled).toBe(false);
  });

  it("cannot include a non-materialized source-universe row", async () => {
    // The universe tab lists family definitions, Ranked candidates and
    // specimens. They are a DIFFERENT list with no checkbox, so a stored-
    // question package cannot pick one up.
    const { container } = renderReview();
    await screen.findByText("Question number 1");
    check(container, 1);
    fireEvent.click(screen.getByText("All sources"));
    await waitFor(() =>
      expect(container.querySelectorAll("[data-question-id]").length).toBe(0),
    );
  });
});

// ---------------------------------------------------------------------------
// Readiness visibility in the list, and the shorts shortlist
// ---------------------------------------------------------------------------

describe("readiness is visible before the handoff", () => {
  it("stamps a readiness state on every list row", async () => {
    const { container } = renderReview();
    await screen.findByText("Question number 1");
    const states = Array.from(container.querySelectorAll("[data-content-readiness]"))
      .map((n) => n.getAttribute("data-content-readiness"));
    expect(states).toContain("ready");
    expect(states).toContain("asset-unresolved");
    expect(states).toContain("presentation-incomplete");
    expect(states).toContain("unsupported");
  });
});

// ---------------------------------------------------------------------------
// Simple mode — the operator questions, over the canonical registries
// ---------------------------------------------------------------------------

describe("Generate Content simple mode", () => {
  const openPanel = async () => {
    renderReview(1);
    fireEvent.click(await screen.findByTestId("generate-content-open"));
    await screen.findByTestId("generate-content-panel");
  };

  it("asks where you are posting, and writes real renderer format keys", async () => {
    await openPanel();

    // Default is the one default format key, shown under its operator name.
    expect(screen.getByTestId("content-destination-mobile-social").getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByTestId("content-destination-landscape").getAttribute("aria-pressed"))
      .toBe("false");

    fireEvent.click(screen.getByTestId("content-destination-landscape"));
    openDeveloperTools();
    expect(commandText()).toContain('--formats "mobile-social,landscape"');
  });

  it("asks what you want, and writes real render states in post order", async () => {
    await openPanel();

    // Default states are question + correct — "Question + Reveal".
    expect(screen.getByTestId("content-intent-reveal").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("content-intent-explained"));
    openDeveloperTools();
    expect(commandText()).toContain('--states "question,correct,explanation"');

    fireEvent.click(screen.getByTestId("content-intent-question"));
    expect(commandText()).toContain("--states question");
  });

  it("reflects an advanced edit rather than disagreeing with it", async () => {
    await openPanel();

    // An arbitrary state set matches no intent, and simple mode says so
    // instead of showing a stale selection.
    openAdvanced();
    fireEvent.click(screen.getByTestId("content-state-incorrect"));
    expect(screen.getByTestId("content-intent-custom").textContent)
      .toContain("Question → Reveal → Wrong answer");
    expect(screen.getByTestId("content-intent-reveal").getAttribute("aria-pressed")).toBe("false");
  });

  it("hides the card question under a post composition, which owns its slides", async () => {
    await openPanel();
    openAdvanced();
    fireEvent.click(screen.getByTestId("content-post-answer-reveal"));

    expect(screen.queryByTestId("content-intent-reveal")).toBeNull();
    // Named in operator language in both places: the simple-mode sentence and
    // the advanced toggle that set it.
    expect(screen.getAllByText(/Reveal post/).length).toBeGreaterThan(0);
  });

  it("makes the export itself the one primary action, and names what it will produce", async () => {
    await openPanel();
    const action = screen.getByTestId("generate-content-export-action");
    // The default selection is one question in `question,correct`, so the
    // button has to say two cards — a label that counted differently from the
    // plan would be a promise the run does not keep.
    expect(action.textContent).toContain("Export 2 PNGs as ZIP");

    // One card is one PNG, and the label follows the selection rather than a
    // fixed string.
    fireEvent.click(screen.getByTestId("content-intent-question"));
    expect(screen.getByTestId("generate-content-export-action").textContent).toContain("Export PNG");
    expect(screen.getByTestId("generate-content-export-hint").textContent).toContain(".png");
  });

  it("moves the local renderer into Developer tools, and no normal copy asks for localhost", async () => {
    await openPanel();
    // `<details>` keeps its children mounted, so the question is not whether
    // the link EXISTS — it is where it lives. It must be inside Developer
    // tools, and the normal path must not mention a local server at all.
    const developer = screen.getByTestId("generate-content-developer");
    expect(within(developer).getByTestId("generate-content-open-workspace")).toBeTruthy();

    const primary = screen.getByTestId("generate-content-export");
    expect(primary.textContent).not.toMatch(/127\.0\.0\.1|localhost|Content Workspace/);
    expect(within(primary).queryByTestId("generate-content-open-workspace")).toBeNull();

    openDeveloperTools();
    expect(screen.getByTestId("generate-content-copy")).toBeTruthy();
    expect(screen.getByTestId("generate-content-copy-config")).toBeTruthy();
  });

  it("refuses an audit format in the browser rather than exporting the wrong viewport", async () => {
    await openPanel();
    openAdvanced();
    fireEvent.click(screen.getByTestId("content-format-mobile-audit"));

    const errors = screen.getByTestId("generate-content-export-errors");
    expect(errors.textContent).toContain("mobile-audit");
    expect(errors.textContent).toMatch(/Developer tools/);
    expect((screen.getByTestId("generate-content-export-action") as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Progressive disclosure in the filter toolbar
// ---------------------------------------------------------------------------

describe("advanced filters are hidden until asked for", () => {
  it("keeps every advanced filter, one click behind More filters", async () => {
    renderReview();
    await screen.findByText("Question number 1");

    // Not on the toolbar…
    expect(screen.queryByLabelText("Category")).toBeNull();
    expect(screen.queryByLabelText("Subject type")).toBeNull();

    fireEvent.click(screen.getByTestId("more-filters-toggle"));
    const panel = screen.getByTestId("more-filters-panel");
    for (const label of [
      "Category", "Answer certainty", "Format", "Ability slot",
      "Subject type", "Live in the app", "Difficulty", "Shortcuts",
    ]) {
      expect(within(panel).getByText(label)).toBeTruthy();
    }
  });

  it("reports how many advanced filters are narrowing the list", async () => {
    renderReview();
    await screen.findByText("Question number 1");

    fireEvent.click(screen.getByTestId("more-filters-toggle"));
    fireEvent.click(within(screen.getByTestId("more-filters-panel")).getByText("🚨 Missing Asset"));

    expect(screen.getByTestId("more-filters-toggle").textContent).toContain("1");
  });
});

describe("favorite_for_shorts remains the one content shortlist", () => {
  it("is still the existing filter and toggle — no second content flag exists", async () => {
    const { container } = renderReview(6);
    await screen.findByText("Question number 1");
    // The existing shortlist filter. It moved behind "More filters" with the
    // rest of the advanced set — still the same filter, one click further in.
    expect(screen.queryByText("⭐ Shorts Favorites")).toBeNull();
    fireEvent.click(screen.getByTestId("more-filters-toggle"));
    expect(screen.getByText("⭐ Shorts Favorites")).toBeTruthy();
    // The existing per-row toggle, unchanged.
    expect(await screen.findByText("Shorts Fav")).toBeTruthy();
    // And Generate Content introduced no rival persistent flag.
    expect(container.textContent).not.toMatch(/content favorite|featured for content/i);
  });
});
