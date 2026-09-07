/**
 * CON1 Step 1E — Admin Quiz Review exposes the COMPUTED asset signal, and
 * keeps it distinguishable from the reviewer's manual `missing_asset` flag.
 *
 * The two are different claims by different authors — a backend computation
 * against the canonical resolver, and a human's annotation — so the surface
 * must never let one be mistaken for the other. These tests hold that line.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminQuizReview from "./AdminQuizReview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { ReviewQuestion } from "@/lib/quiz/api";
import type { AssetStatus } from "@/lib/quiz/assetStatus";

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

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => undefined,
  getChampionSplash: () => undefined,
  getChampionLoading: () => undefined,
}));

/** The shapes `quiz.asset_health.compute_asset_status` really returns. */
const RESOLVED: AssetStatus = {
  status: "resolved",
  reason: "",
  references: [
    {
      channel: "image_path",
      path: "assets/champions/Aatrox/icon.png",
      requirement: "required",
      resolution: "match",
      resolved_path: "assets/champions/Aatrox/icon.png",
      reason: "",
    },
  ],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
};

const UNRESOLVED: AssetStatus = {
  ...RESOLVED,
  status: "unresolved",
  reason: "image_path: 'assets/champions/Ghost/icon.png' does not resolve to a file on disk",
  references: [
    { ...RESOLVED.references[0], path: "assets/champions/Ghost/icon.png", resolution: "missing", resolved_path: null },
  ],
  unresolved: [
    { ...RESOLVED.references[0], path: "assets/champions/Ghost/icon.png", resolution: "missing", resolved_path: null },
  ],
};

const NOT_REQUIRED: AssetStatus = {
  status: "not_required",
  reason: "",
  references: [],
  unresolved: [],
  degraded_to_text: false,
  optional_unresolved: false,
  case_repaired: false,
};

const WITHHELD: AssetStatus = {
  ...NOT_REQUIRED,
  degraded_to_text: true,
  references: [
    {
      channel: "image_path",
      path: "assets/items/3003.png",
      requirement: "withheld",
      resolution: "match",
      resolved_path: "assets/items/3003.png",
      reason: "",
    },
  ],
};

const mkQuestion = (id: number, over: Partial<ReviewQuestion> = {}): ReviewQuestion => ({
  id,
  question_text: `Question number ${id}`,
  category: "items",
  format: "multiple_choice",
  choices: ["A", "B", "C", "D"],
  correct_answer: { type: "text", value: "A" },
  is_active: true,
  review_status: "unreviewed",
  favorite_for_shorts: false,
  missing_asset: false,
  ...over,
});

const listOf = (questions: ReviewQuestion[]) => ({
  ok: true, total: questions.length, page: 1, page_size: 50, pages: 1, questions,
});

const FILTER_OPTIONS = {
  ok: true, categories: ["items"], source_types: ["pro"],
  formats: ["multiple_choice"], review_statuses: ["unreviewed"], packs: [],
};

function renderReview(selectedQuestionId: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminQuizReview embedded selectedQuestionId={selectedQuestionId} onSelectQuestion={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ROWS = [
  mkQuestion(1, { asset_status: RESOLVED }),
  mkQuestion(2, { asset_status: UNRESOLVED }),
  mkQuestion(3, { asset_status: NOT_REQUIRED }),
  mkQuestion(4, { asset_status: WITHHELD }),
  // A reviewer's flag on a row whose assets all resolve — the case that proves
  // the two signals are not the same signal.
  mkQuestion(5, { asset_status: RESOLVED, missing_asset: true }),
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setAdminKey("secret-admin");
  getReviewFilterOptions.mockResolvedValue(FILTER_OPTIONS);
  getReviewQuestions.mockResolvedValue(listOf(ROWS));
  getReviewQuestion.mockImplementation(async (id: number) => {
    const q = ROWS.find((r) => r.id === id);
    if (!q) throw new Error("Quiz API 404: not found");
    return { ok: true, question: q };
  });
  downloadReviewExport.mockResolvedValue({ blob: new Blob([""]), filename: "x.csv", rowCount: 0 });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); clearAdminKey(); vi.clearAllMocks(); });

const badges = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[data-asset-status]"));

describe("the computed badge in the list", () => {
  it("marks every row with the status the backend computed", async () => {
    const { container } = renderReview(1);
    await waitFor(() => expect(badges(container).length).toBeGreaterThan(0));
    const listed = badges(container).map((n) => n.getAttribute("data-asset-status"));
    // one per row, plus the detail panel's own badge for the selected row
    for (const expected of ["resolved", "unresolved", "not_required"]) {
      expect(listed).toContain(expected);
    }
  });

  it("renders the unresolved state distinctly, not as a generic warning", async () => {
    const { container } = renderReview(2);
    await waitFor(() => expect(badges(container).length).toBeGreaterThan(0));
    const bad = badges(container).filter(
      (n) => n.getAttribute("data-asset-status") === "unresolved",
    );
    expect(bad.length).toBeGreaterThan(0);
    expect(await screen.findByText("Asset unresolved")).toBeTruthy();
  });
});

describe("the computed signal and the manual flag stay separate", () => {
  it("shows a reviewer flag AND a computed OK on the same row", async () => {
    const { container } = renderReview(5);
    // the manual annotation, addressed to a human
    expect(await screen.findByLabelText("Flagged by a reviewer as missing an asset")).toBeTruthy();
    // and the backend's independent computation, which disagrees
    await waitFor(() => {
      const detail = badges(container).map((n) => n.getAttribute("data-asset-status"));
      expect(detail).toContain("resolved");
    });
    expect(await screen.findByText("Asset OK")).toBeTruthy();
  });

  it("says the computed states are COMPUTED, in help text", async () => {
    const { container } = renderReview(2);
    await waitFor(() => expect(badges(container).length).toBeGreaterThan(0));
    const detail = badges(container).find(
      (n) => n.tagName.toLowerCase() === "span" && n.getAttribute("title"),
    );
    expect(detail?.getAttribute("title")).toContain("Computed:");
    expect(detail?.getAttribute("title")).toContain("does not resolve");
  });

  it("labels the manual control as the reviewer's annotation, not verification", async () => {
    renderReview(1);
    const flag = await screen.findByText("Flag Asset");
    expect(flag.closest("button")?.getAttribute("title")).toContain("not the computed asset check");
  });

  it("offers no control that could set the computed status", async () => {
    renderReview(2);
    await screen.findByText("Asset unresolved");
    // the computed badge is a span, never a button: Admin reports it, and only
    // the backend decides it
    const computed = document.querySelectorAll("button[data-asset-status]");
    expect(computed).toHaveLength(0);
  });
});

describe("deliberate text degradation is visible without being an error", () => {
  it("tells the operator an image exists that production withholds", async () => {
    renderReview(4);
    const badge = await screen.findByText("No asset required");
    expect(badge.closest("[data-asset-status]")?.getAttribute("title"))
      .toContain("production deliberately does not show");
  });
});

describe("a row with no computed signal", () => {
  it("renders no badge rather than inventing a state", async () => {
    getReviewQuestions.mockResolvedValue(listOf([mkQuestion(9)]));
    getReviewQuestion.mockResolvedValue({ ok: true, question: mkQuestion(9) });
    const { container } = renderReview(9);
    await screen.findByText("Question number 9");
    expect(badges(container)).toHaveLength(0);
  });
});
