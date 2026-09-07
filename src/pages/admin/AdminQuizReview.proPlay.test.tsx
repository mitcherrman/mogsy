/**
 * CON1 Step 5 — CURRENT Pro Play in Admin, and the legacy population beside it.
 *
 * What is being held:
 *   1. a generated Pro Play specimen is discoverable and can start a run;
 *   2. it identifies itself as Pro Play and shows the context an editor needs
 *      to judge it — player/team, scope and metric — without opening it;
 *   3. readiness over the RESOLVED payload passes, because the presentation
 *      contract reaches the production card;
 *   4. a stored `pro_champion_scope_comparison` row is marked LEGACY and is
 *      still refused as a review key, exactly as every stored row is;
 *   5. the emitted command carries `--review-key` and no credential.
 *
 * The rows and the resolver item are the SHAPES the backend emits — copied
 * from the real collector output rather than imagined.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminQuizReview from "./AdminQuizReview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { ReviewUniverseItem, ReviewUniverseRow } from "@/lib/quiz/api";
import type { AssetStatus } from "@/lib/quiz/assetStatus";
import { NEVER_EMITTED_FLAGS } from "@/lib/quiz-screenshot/command";
import fixture from "../../../scripts/quiz-screenshots/visual-qa-fixture.json";

const getReviewQuestions = vi.fn();
const getReviewQuestion = vi.fn();
const getReviewFilterOptions = vi.fn();
const getReviewUniverse = vi.fn();
const getReviewUniverseItem = vi.fn();

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
      getReviewUniverseItem: (...a: unknown[]) => getReviewUniverseItem(...a),
    },
  };
});

vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: undefined }),
  getChampionIcon: () => undefined,
  getChampionSplash: () => undefined,
  getChampionLoading: () => undefined,
}));

/** The real resolver payload for the Worlds-watchlist specimen. */
const PRO_FIXTURE = (fixture as { questions: Array<Record<string, unknown>> })
  .questions.find((q) => q.id === "vq-11") as Record<string, unknown>;
const PRO_KEY = String(PRO_FIXTURE.review_key);
const LEGACY_KEY = "pro_champion_scope_comparison:worlds:4.14:picks";

const NOT_REQUIRED: AssetStatus = {
  status: "not_required", reason: "", references: [], unresolved: [],
  degraded_to_text: false, optional_unresolved: false, case_repaired: false,
};

const universeRow = (over: Partial<ReviewUniverseRow>): ReviewUniverseRow => ({
  review_key: "", source_kind: "", materialization: "", family: "",
  question_text: "", options: [], correct_answer: "", explanation: "",
  difficulty: "", topic_category: "", source_status: "", review_status: "",
  source_version: "", dataset_id: "d1", metadata: {},
  ...over,
});

const UNIVERSE_ROWS: ReviewUniverseRow[] = [
  universeRow({
    review_key: PRO_KEY,
    source_kind: "pro_question",
    materialization: "code_generated",
    family: "pro_team_champion_comparison",
    question_text: String(PRO_FIXTURE.question_text),
    options: (PRO_FIXTURE.choices as Array<{ label: string }>).map((c) => c.label),
    correct_answer: String(PRO_FIXTURE.correct_answer),
    explanation: String(PRO_FIXTURE.explanation),
    topic_category: "Pro Play",
    source_status: "on_demand_current",
    review_status: "generated",
    // The discovery projection the backend builds from the FROZEN contract.
    metadata: {
      slug: "worlds-focus-lck",
      question_key: String(PRO_FIXTURE.question_key),
      metric: "wins",
      shape: "team_ranking",
      relationship: "team_champion",
      recent: false,
      scope_label: "Gen.G",
      scope_tags: ["ALL PRO PLAY", "ALL TIME"],
      subjects: ["Sejuani", "Azir", "Ezreal", "Rakan"],
    },
  }),
  // A request the current corpus cannot answer. It must still appear, with its
  // reason, so "no current supply" is visible rather than inferred.
  universeRow({
    review_key: "pro-unavailable:player-champion-recent",
    source_kind: "pro_question",
    materialization: "code_generated",
    family: "pro_player_champion_comparison",
    question_text: "Current-season player pool",
    source_status: "no_current_supply",
    explanation: "no eligible question after 0 attempt(s)",
  }),
  // The legacy population: one of the ~50k stored rows.
  universeRow({
    review_key: LEGACY_KEY,
    source_kind: "stored_question",
    materialization: "stored",
    family: "pro_champion_scope_comparison",
    question_text:
      "In the World Championship on patch 4.14, which champion had the higher pick count?",
    options: ["Lee Sin", "Elise"],
    correct_answer: "Lee Sin",
    source_status: "legacy_superseded",
    review_status: "stored",
  }),
];

const PRO_ITEM: ReviewUniverseItem = {
  review_key: PRO_KEY,
  source_kind: "pro_question",
  materialization: "code_generated",
  id: PRO_KEY,
  question_key: String(PRO_FIXTURE.question_key),
  question_text: String(PRO_FIXTURE.question_text),
  format: "multiple_choice",
  category: "Pro Play",
  choices: PRO_FIXTURE.choices as Array<{ label: string }>,
  correct_answer: String(PRO_FIXTURE.correct_answer),
  correct_index: Number(PRO_FIXTURE.correct_index),
  explanation: String(PRO_FIXTURE.explanation),
  image_path: null,
  metadata: PRO_FIXTURE.metadata as Record<string, unknown>,
  presentation: PRO_FIXTURE.presentation as Record<string, unknown>,
  context: PRO_FIXTURE.context,
  asset_status: NOT_REQUIRED,
  provenance: PRO_FIXTURE.provenance as never,
} as ReviewUniverseItem;

const FILTER_OPTIONS = {
  ok: true, categories: ["items"], source_types: ["pro"],
  formats: ["multiple_choice"], review_statuses: ["unreviewed"], packs: [],
};

function renderReview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminQuizReview embedded selectedQuestionId={null} onSelectQuestion={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openUniverse() {
  renderReview();
  fireEvent.click(await screen.findByRole("button", { name: "All sources" }));
  await screen.findByTestId(`universe-generate-${PRO_KEY}`);
}

beforeEach(() => {
  setAdminKey("test-key");
  getReviewQuestions.mockResolvedValue({ ok: true, questions: [], total: 0, page: 1, page_size: 25 });
  getReviewQuestion.mockResolvedValue({ ok: false });
  getReviewFilterOptions.mockResolvedValue(FILTER_OPTIONS);
  getReviewUniverse.mockResolvedValue({
    ok: true, rows: UNIVERSE_ROWS, total: UNIVERSE_ROWS.length,
    provenance: {
      schema_version: "mogzy-quiz-review.v2", baseline_id: "b".repeat(16),
      database: { name: "lol_calc.db" }, exported_at: "", source_counts: {},
      collector_errors: [], row_count: UNIVERSE_ROWS.length, content_digest: "d",
    },
  });
  getReviewUniverseItem.mockResolvedValue({ ok: true, item: PRO_ITEM });
});

afterEach(() => {
  clearAdminKey();
  cleanup();
  vi.clearAllMocks();
});

describe("Admin — current Pro Play specimens", () => {
  it("shows the specimen as Pro Play, with its scope and metric", async () => {
    await openUniverse();
    // The row is legible WITHOUT opening it: an editor scanning for something
    // to post has to be able to tell one Pro specimen from another.
    expect(screen.getAllByText("Pro Play (current)").length).toBeGreaterThan(0);
    const context = await screen.findByTestId(`universe-framing-${PRO_KEY}`);
    expect(context.textContent).toContain("Gen.G");
    expect(context.textContent).toContain("ALL PRO PLAY");
    expect(context.textContent).toContain("metric: wins");
    expect(context.textContent).toContain("Sejuani");
  });

  it("enables Generate Content for it", async () => {
    await openUniverse();
    const button = screen.getByTestId(`universe-generate-${PRO_KEY}`);
    expect(button).not.toBeDisabled();
    expect(button.getAttribute("data-source-supported")).toBe("true");
    expect(button.getAttribute("data-refusal-code")).toBeNull();
  });

  it("resolves through the backend and reports the payload as ready", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${PRO_KEY}`));
    await waitFor(() => expect(getReviewUniverseItem).toHaveBeenCalledWith(PRO_KEY));
    // Readiness runs over the RESOLVED item — which carries the presentation
    // contract the discovery row does not.
    expect(await screen.findByText(/Content ready/i)).toBeTruthy();
  });

  it("emits a --review-key command and no credential", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${PRO_KEY}`));
    await waitFor(() => expect(getReviewUniverseItem).toHaveBeenCalled());
    const page = document.body.textContent ?? "";
    expect(page).toContain("--review-key");
    for (const flag of NEVER_EMITTED_FLAGS) expect(page).not.toContain(flag);
    // The admin key must never reach a copyable command.
    expect(page).not.toContain("test-key");
  });

  it("surfaces a request the corpus cannot answer, with its reason", async () => {
    await openUniverse();
    expect(screen.getByText("Current-season player pool")).toBeTruthy();
    const reason = screen.getByTestId(
      "universe-framing-pro-unavailable:player-champion-recent",
    );
    expect(reason.textContent).toMatch(/No current supply/i);
    expect(reason.textContent).toMatch(/no eligible question/i);
  });
});

describe("Admin — the legacy stored Pro Play population", () => {
  it("marks a superseded stored row as legacy", async () => {
    await openUniverse();
    const badge = await screen.findByTestId(`universe-legacy-${LEGACY_KEY}`);
    expect(badge.textContent).toContain("Legacy");
    expect(badge.getAttribute("title")).toMatch(/served on demand/i);
  });

  it("still refuses it as a review key, with the stored reason", async () => {
    await openUniverse();
    const button = screen.getByTestId(`universe-generate-${LEGACY_KEY}`);
    expect(button).toBeDisabled();
    expect(button.getAttribute("data-refusal-code")).toBe("use_question_id");
    // The refusal is on SCREEN, not only in a tooltip — a tooltip is invisible
    // in a screenshot and to anyone not hovering.
    const reason = screen.getByTestId(`universe-generate-reason-${LEGACY_KEY}`);
    expect(reason.textContent).toMatch(/handed off by its id/i);
  });

  it("does not mark a CURRENT generated specimen as legacy", async () => {
    await openUniverse();
    expect(screen.queryByTestId(`universe-legacy-${PRO_KEY}`)).toBeNull();
  });
});
