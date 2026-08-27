import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminQuizReview from "./AdminQuizReview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { ReviewQuestion } from "@/lib/quiz/api";

// --- mock the quiz admin API surface Review consumes -----------------------
const getReviewQuestions = vi.fn();
const getReviewQuestion = vi.fn();
const getReviewFilterOptions = vi.fn();
const downloadReviewExport = vi.fn();

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getReviewQuestions: (...a: unknown[]) => getReviewQuestions(...a),
      getReviewQuestion: (...a: unknown[]) => getReviewQuestion(...a),
      getReviewFilterOptions: () => getReviewFilterOptions(),
      downloadReviewExport: (...a: unknown[]) => downloadReviewExport(...a),
    },
  };
});

// Champion asset manifest hook — irrelevant here; keep it inert.
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => undefined,
  getChampionSplash: () => undefined,
  getChampionLoading: () => undefined,
}));

const mkQuestion = (id: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion => ({
  id,
  question_text: `Question number ${id}`,
  category: "items",
  format: "multiple_choice",
  choices: ["A", "B", "C", "D"],
  correct_answer: { type: "text", value: "A" },
  is_active: false,
  review_status: "unreviewed",
  favorite_for_shorts: false,
  missing_asset: false,
  ...over,
});

const listOf = (questions: ReviewQuestion[]) => ({
  ok: true,
  total: questions.length,
  page: 1,
  page_size: 50,
  pages: 1,
  questions,
});

const FILTER_OPTIONS = {
  ok: true,
  categories: ["items", "champions"],
  source_types: ["pro"],
  formats: ["multiple_choice"],
  review_statuses: ["unreviewed", "approved", "rejected"],
  packs: [],
};

function renderReview(props: {
  selectedQuestionId?: number | null;
  onSelectQuestion?: (id: number | null) => void;
  focusFilters?: import("@/lib/quiz/api").ReviewFilters;
  focusLabel?: string;
  onClearFocus?: () => void;
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminQuizReview embedded {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // jsdom lacks scrollIntoView (used by the deep-link scroll effect and Radix).
  Element.prototype.scrollIntoView = vi.fn();
  setAdminKey("secret-admin");
  getReviewFilterOptions.mockResolvedValue(FILTER_OPTIONS);
  getReviewQuestions.mockResolvedValue(listOf([mkQuestion(1), mkQuestion(2), mkQuestion(42)]));
  getReviewQuestion.mockImplementation(async (id: number) => {
    if (id === 42) return { ok: true, question: mkQuestion(42, { question_text: "The deep-linked one" }) };
    if (id === 1) return { ok: true, question: mkQuestion(1) };
    throw new Error("Quiz API 404: not found");
  });
  downloadReviewExport.mockResolvedValue({ blob: new Blob(["question_id\n1\n"]), filename: "mogzy-question-review_all_26.17_2026-08-25.csv", rowCount: 1 });
  URL.createObjectURL = vi.fn(() => "blob:review-export");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.clearAllMocks();
});

describe("Review deep link (controlled selection by id)", () => {
  it("opens the exact question from the deep-link id (identity by id, not text)", async () => {
    renderReview({ selectedQuestionId: 42, onSelectQuestion: vi.fn() });
    await waitFor(() => expect(getReviewQuestion).toHaveBeenCalledWith(42));
    expect(await screen.findByText("The deep-linked one")).toBeTruthy();
  });

  it("fails safely on an invalid / missing id instead of spinning forever", async () => {
    renderReview({ selectedQuestionId: 999999, onSelectQuestion: vi.fn() });
    expect(await screen.findByTestId("review-detail-not-found")).toBeTruthy();
    expect(screen.getByTestId("review-detail-not-found").textContent).toContain("#999999");
  });

  it("reports the selected id back through onSelectQuestion when a row is clicked", async () => {
    const onSelect = vi.fn();
    renderReview({ selectedQuestionId: null, onSelectQuestion: onSelect });
    // Row bodies show the question text; click the first row.
    const row = await screen.findByText("Question number 1");
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("keeps existing Review filters working (search refetches the list with the term)", async () => {
    renderReview({ selectedQuestionId: null, onSelectQuestion: vi.fn() });
    await waitFor(() => expect(getReviewQuestions).toHaveBeenCalled());
    const callsBefore = getReviewQuestions.mock.calls.length;

    const searchBox = screen.getByPlaceholderText(/Malphite, ultimate/i);
    fireEvent.change(searchBox, { target: { value: "sunfire" } });
    fireEvent.keyDown(searchBox, { key: "Enter" });

    await waitFor(() => expect(getReviewQuestions.mock.calls.length).toBeGreaterThan(callsBefore));
    const lastFilters = getReviewQuestions.mock.calls.at(-1)?.[0] as { search?: string };
    expect(lastFilters.search).toBe("sunfire");
  });

  it("downloads the canonical all-questions CSV from the protected backend", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderReview({ selectedQuestionId: null, onSelectQuestion: vi.fn() });
    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/i }));
    await waitFor(() => expect(downloadReviewExport).toHaveBeenCalledWith("all"));
    expect(click).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalled();
    click.mockRestore();
  });
});

describe("Diagnostics focus (a diagnostic filter arriving from the other tab)", () => {
  it("requests exactly the rows the diagnostic named", async () => {
    renderReview({ selectedQuestionId: null, focusFilters: { ids: [101, 102], page: 1 } });
    await waitFor(() => expect(getReviewQuestions).toHaveBeenCalled());
    const filters = getReviewQuestions.mock.calls.at(-1)?.[0] as { ids?: number[] };
    expect(filters.ids).toEqual([101, 102]);
  });

  it("passes a family focus through as a family filter", async () => {
    renderReview({ selectedQuestionId: null, focusFilters: { family: "combat_cooldown", page: 1 } });
    await waitFor(() => expect(getReviewQuestions).toHaveBeenCalled());
    const filters = getReviewQuestions.mock.calls.at(-1)?.[0] as { family?: string };
    expect(filters.family).toBe("combat_cooldown");
  });

  it("says WHY the list is short, and offers a way back to the whole bank", async () => {
    const onClearFocus = vi.fn();
    renderReview({
      selectedQuestionId: null,
      focusFilters: { ids: [101, 102], page: 1 },
      focusLabel: "Live answer defects",
      onClearFocus,
    });
    const banner = await screen.findByTestId("review-focus-banner");
    expect(banner.textContent).toContain("Live answer defects");
    expect(banner.textContent).toContain("(2)");

    fireEvent.click(screen.getByRole("button", { name: /Clear diagnostic filter/i }));
    expect(onClearFocus).toHaveBeenCalled();
    await waitFor(() => {
      const filters = getReviewQuestions.mock.calls.at(-1)?.[0] as { ids?: number[] };
      expect(filters.ids).toBeUndefined();
    });
  });

  it("shows no focus banner when no diagnostic sent one", async () => {
    renderReview({ selectedQuestionId: null });
    await waitFor(() => expect(getReviewQuestions).toHaveBeenCalled());
    expect(screen.queryByTestId("review-focus-banner")).toBeNull();
  });

  it("keeps an empty diagnostic selection meaning NO rows, not the whole bank", async () => {
    // A finding that matched nothing in this database must not silently show
    // every question — the exact inversion this filter exists to avoid.
    renderReview({ selectedQuestionId: null, focusFilters: { ids: [], page: 1 } });
    await waitFor(() => expect(getReviewQuestions).toHaveBeenCalled());
    const filters = getReviewQuestions.mock.calls.at(-1)?.[0] as { ids?: number[] };
    expect(filters.ids).toEqual([]);
  });
});
