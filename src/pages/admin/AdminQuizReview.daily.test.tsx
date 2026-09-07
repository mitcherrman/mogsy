/**
 * CON1 Step 3C — a frozen Daily card handed off from Admin.
 *
 * What is being held:
 *   1. a Daily row identifies itself AS Daily, and says which day, which
 *      challenge version and which card it is — on screen, not in a tooltip;
 *   2. a publishable frozen quiz card enables Generate;
 *   3. a frozen Meta Reflex card in the SAME day, under the SAME namespace,
 *      does not — the refusal comes from the row itself, which is the only way
 *      a per-card verdict can reach the button;
 *   4. readiness runs over the RESOLVED frozen payload, and the frozen media
 *      reaches the picture (`cinematic`), which no generated source did before;
 *   5. the emitted command names the Daily review key, and no credential.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import AdminQuizReview from "./AdminQuizReview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import type { ReviewUniverseItem, ReviewUniverseRow } from "@/lib/quiz/api";
import { NEVER_EMITTED_FLAGS } from "@/lib/quiz-screenshot/command";

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

const QUIZ_KEY = "daily:2026-08-20:v1:12";
const REFLEX_KEY = "daily:2026-08-20:v1:4";

const FRAMING = {
  kind: "daily",
  challenge_date: "2026-08-20",
  challenge_version: 1,
  sequence: 12,
  card_index: 1,
  slot_index: 8,
  card_kind: "quiz",
  tier: "easy",
  wave: "close",
  pool_id: "easy_item_cost",
  points: 100,
  card_count: 12,
  theme: null,
  rules_version: 1,
  plan_version: 1,
  content_fingerprint: "58173623e3094b7b84d08d0afdbefe4fc76d96edb16f44779ebe8ba395c8a746",
  frozen: true,
};

const universeRow = (over: Partial<ReviewUniverseRow>): ReviewUniverseRow => ({
  review_key: "", source_kind: "", materialization: "", family: "",
  question_text: "", options: [], correct_answer: "", explanation: "",
  difficulty: "", topic_category: "", source_status: "", review_status: "",
  source_version: "", dataset_id: "d1", metadata: {},
  ...over,
});

/** Two cards of ONE frozen day, exactly as the backend collector emits them. */
const UNIVERSE_ROWS: ReviewUniverseRow[] = [
  universeRow({
    review_key: QUIZ_KEY,
    source_kind: "daily_card",
    materialization: "frozen_snapshot",
    family: "item_cost",
    question_text: "Fixture question for item_cost:fixture-1-86?",
    options: ["item_cost opt 86.0", "item_cost opt 86.1", "item_cost opt 86.2", "item_cost opt 86.3"],
    correct_answer: "item_cost opt 86.2",
    explanation: "Because item_cost:fixture-1-86 says so.",
    topic_category: "item_cost category",
    source_status: "frozen",
    review_status: "served",
    source_version: FRAMING.content_fingerprint,
    metadata: FRAMING,
  }),
  universeRow({
    review_key: REFLEX_KEY,
    source_kind: "daily_card",
    materialization: "frozen_snapshot",
    family: "champion_stat:hp",
    question_text: "Which champion has more base health?",
    source_status: "renderer_unsupported",
    review_status: "served",
    source_version: FRAMING.content_fingerprint,
    metadata: { ...FRAMING, sequence: 4, card_kind: "meta_reflex", tier: "reflex" },
    render_refusal: {
      code: "renderer_unsupported",
      reason:
        "A frozen Meta Reflex card is a two-entity swipe card — its options are " +
        "entity sides carrying artwork, not four labels — so the multiple-choice " +
        "card would misrepresent it.",
    },
  }),
];

/** The resolver's answer for the quiz card — the RENDER payload. */
const DAILY_ITEM: ReviewUniverseItem = {
  review_key: QUIZ_KEY,
  source_kind: "daily_card",
  materialization: "frozen_snapshot",
  id: QUIZ_KEY,
  question_key: "item_cost:fixture-1-86",
  question_text: "Fixture question for item_cost:fixture-1-86?",
  format: "multiple_choice",
  category: "item_cost category",
  choices: [
    { label: "item_cost opt 86.0" },
    { label: "item_cost opt 86.1" },
    { label: "item_cost opt 86.2" },
    { label: "item_cost opt 86.3" },
  ],
  correct_answer: "item_cost opt 86.2",
  correct_index: 2,
  explanation: "Because item_cost:fixture-1-86 says so.",
  image_path: null,
  metadata: { cost: 350, item_name: "Long Sword" },
  asset_status: {
    status: "resolved", reason: "",
    references: [{
      channel: "assets.subject.icon", path: "assets/items/1036.png",
      requirement: "required", resolution: "match",
      resolved_path: "assets/items/1036.png", reason: "",
    }],
    unresolved: [], degraded_to_text: false, optional_unresolved: false,
    case_repaired: false,
  },
  presentation: {
    assets: { subject: { icon: "assets/items/1036.png", id: 1036, name: "Long Sword", type: "item" } },
    presentation: { role: "context", spoiler: false, timing: "question" },
  },
  provenance: {
    review_key: QUIZ_KEY,
    source_kind: "daily_card",
    materialization: "frozen_snapshot",
    family: "item_cost",
    source_version: FRAMING.content_fingerprint,
    source_question_key: "item_cost:fixture-1-86",
    source_question_id: 87,
    framing: FRAMING,
  },
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
  await screen.findByTestId(`universe-generate-${QUIZ_KEY}`);
}

const commandText = () => screen.getByTestId("generate-content-command").textContent ?? "";

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  setAdminKey("secret-admin");
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  getReviewFilterOptions.mockResolvedValue(FILTER_OPTIONS);
  getReviewQuestions.mockResolvedValue({
    ok: true, total: 0, page: 1, page_size: 50, pages: 1, questions: [],
  });
  getReviewUniverse.mockResolvedValue({
    ok: true, total: UNIVERSE_ROWS.length, page: 1, page_size: 200, pages: 1,
    rows: UNIVERSE_ROWS,
    provenance: {
      schema_version: "mogzy-quiz-review.v2", exported_at: "", baseline_id: "baseline000",
      content_digest: "d", row_count: UNIVERSE_ROWS.length,
      source_counts: { daily_card: UNIVERSE_ROWS.length },
      collector_errors: [], database: { name: "test", dataset_id: "d1" },
    },
  });
  getReviewUniverseItem.mockResolvedValue({ ok: true, item: DAILY_ITEM });
});
afterEach(() => { cleanup(); clearAdminKey(); vi.clearAllMocks(); });

describe("a Daily row says what it is", () => {
  it("labels the source as Daily frozen cards", async () => {
    await openUniverse();
    expect(screen.getAllByText("Daily frozen cards").length).toBe(UNIVERSE_ROWS.length);
    expect(screen.getAllByText("frozen_snapshot").length).toBe(UNIVERSE_ROWS.length);
  });

  it("shows the date, the challenge version and the card position", async () => {
    await openUniverse();
    expect(screen.getByTestId(`universe-framing-${QUIZ_KEY}`).textContent).toBe(
      "2026-08-20 · v1 · card 12/12",
    );
    expect(screen.getByTestId(`universe-framing-${REFLEX_KEY}`).textContent).toBe(
      "2026-08-20 · v1 · card 4/12",
    );
  });

  it("shows nothing of the sort for a source with no framing", async () => {
    getReviewUniverse.mockResolvedValue({
      ok: true, total: 1, page: 1, page_size: 200, pages: 1,
      rows: [universeRow({
        review_key: "mastery:ssm.base.BARRIER", source_kind: "mastery_question",
        materialization: "code_generated", family: "mastery",
        question_text: "What is the base cooldown of Barrier?",
      })],
      provenance: {
        schema_version: "mogzy-quiz-review.v2", exported_at: "", baseline_id: "b",
        content_digest: "d", row_count: 1, source_counts: {}, collector_errors: [],
        database: { name: "test", dataset_id: "d1" },
      },
    });
    renderReview();
    fireEvent.click(await screen.findByRole("button", { name: "All sources" }));
    await screen.findByTestId("universe-generate-mastery:ssm.base.BARRIER");
    expect(screen.queryByTestId("universe-framing-mastery:ssm.base.BARRIER")).toBeNull();
  });
});

describe("publishability is decided per card", () => {
  it("enables Generate on the frozen quiz card", async () => {
    await openUniverse();
    const button = screen.getByTestId(`universe-generate-${QUIZ_KEY}`) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("data-source-supported")).toBe("true");
  });

  it("disables it on the reflex card of the SAME day and namespace", async () => {
    await openUniverse();
    const button = screen.getByTestId(`universe-generate-${REFLEX_KEY}`) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-refusal-code")).toBe("renderer_unsupported");
    // On screen, not only in a title a screenshot would never show.
    expect(screen.getByTestId(`universe-generate-reason-${REFLEX_KEY}`).textContent)
      .toMatch(/Meta Reflex/i);
  });

  it("never resolves a row the operator did not ask for", async () => {
    await openUniverse();
    expect(getReviewUniverseItem).not.toHaveBeenCalled();
  });
});

describe("the Daily handoff", () => {
  it("resolves the frozen payload, and readiness runs over THAT", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${QUIZ_KEY}`));
    await screen.findByTestId("generate-content-panel");
    expect(getReviewUniverseItem).toHaveBeenCalledWith(QUIZ_KEY);
    const row = screen.getByTestId(`readiness-row-${QUIZ_KEY}`);
    // The frozen MEDIA reaches the picture. Mastery's presentation is absent,
    // so it passed the Step 1D gate without ever exercising it; this is the
    // first generated source that draws.
    expect(row.getAttribute("data-content-readiness")).toBe("ready");
    expect(row.getAttribute("data-source-kind")).toBe("daily_card");
  });

  it("emits a --review-key command naming the Daily key, not an id", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${QUIZ_KEY}`));
    await screen.findByTestId("generate-content-panel");
    expect(commandText()).toBe(
      `npm run quiz:screenshots -- --review-key ${QUIZ_KEY} ` +
        '--states "question,correct" --formats mobile-social',
    );
    expect(commandText()).not.toContain("--question-id");
    expect(commandText()).not.toContain("87");
  });

  it("offers the workspace link with a v2 handoff for the key", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${QUIZ_KEY}`));
    await screen.findByTestId("generate-content-panel");
    const link = document.querySelector<HTMLAnchorElement>('a[href*="/dev/content-studio"]');
    expect(link).toBeTruthy();
    expect(link!.href).toContain("hv=2");
    expect(link!.href).toContain("items=rk:daily%3A2026-08-20%3Av1%3A12");
  });

  it("carries no credential and no gate override on any route", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${QUIZ_KEY}`));
    await screen.findByTestId("generate-content-panel");
    const page = document.body.innerHTML;
    for (const flag of NEVER_EMITTED_FLAGS) expect(page).not.toContain(flag);
    expect(page).not.toContain("secret-admin");
  });

  it("reports a backend refusal instead of rendering an empty panel", async () => {
    getReviewUniverseItem.mockResolvedValue({
      ok: false,
      code: "not_found",
      error: "Daily 2026-08-20 v1 has no card at sequence 12",
      review_key: QUIZ_KEY,
      source_kind: "daily_card",
    });
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${QUIZ_KEY}`));
    expect(await screen.findByText(/has no card at sequence 12/)).toBeTruthy();
  });
});
