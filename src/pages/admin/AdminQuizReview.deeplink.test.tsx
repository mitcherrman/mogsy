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

vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: {
      ...actual.quizApi,
      getReviewQuestions: (...a: unknown[]) => getReviewQuestions(...a),
      getReviewQuestion: (...a: unknown[]) => getReviewQuestion(...a),
      getReviewFilterOptions: () => getReviewFilterOptions(),
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
});
