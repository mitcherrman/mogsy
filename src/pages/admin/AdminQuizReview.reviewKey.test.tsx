/**
 * CON1 Step 3B — handing a GENERATED review object off from Admin.
 *
 * What is being held:
 *   1. a materialized generated row (Mastery) can start a content run from the
 *      All-sources tab;
 *   2. a DEFINITION never looks publishable — the control is disabled and the
 *      reason is on screen, not only in a tooltip;
 *   3. readiness runs over the RESOLVED render payload, not over the discovery
 *      row, which carries neither `presentation` nor `asset_status`;
 *   4. the emitted command names `--review-key`, and still names no credential
 *      and no gate override;
 *   5. a refusal from the backend resolver is reported rather than swallowed.
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

const MASTERY_KEY = "mastery:ssm.base.BARRIER";

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

/** Real shapes: the Mastery row and its explanation come from
 *  `declared_records()`; the definition row from `FAMILY_CONTRACTS`. */
const UNIVERSE_ROWS: ReviewUniverseRow[] = [
  universeRow({
    review_key: MASTERY_KEY,
    source_kind: "mastery_question",
    materialization: "code_generated",
    family: "mastery",
    question_text: "What is the base cooldown of Barrier, with no summoner spell haste?",
    options: ["180s", "162s", "198s", "144s"],
    correct_answer: "180s",
    explanation: "Barrier has a 180-second base cooldown.",
    topic_category: "summoners",
    source_status: "public_curriculum",
  }),
  universeRow({
    review_key: "family:ability_cooldown_haste",
    source_kind: "family_definition",
    materialization: "definition",
    family: "ability_cooldown_haste",
    question_text: "Ability cooldown with haste",
    source_status: "stored",
  }),
  universeRow({
    review_key: "meta-specimen:attack_type:melee:0",
    source_kind: "meta_reflex_specimen",
    materialization: "deterministic_specimen",
    family: "attack_type:melee",
    question_text: "Which champion is melee?",
    options: ["Bard", "Renekton"],
    correct_answer: "Renekton",
    source_status: "specimen_not_persisted",
  }),
];

/** The resolver's answer — the RENDER payload, which the universe row is not. */
const MASTERY_ITEM: ReviewUniverseItem = {
  review_key: MASTERY_KEY,
  source_kind: "mastery_question",
  materialization: "code_generated",
  id: MASTERY_KEY,
  question_key: MASTERY_KEY,
  question_text: "What is the base cooldown of Barrier, with no summoner spell haste?",
  format: "multiple_choice",
  category: "summoners",
  choices: [{ label: "180s" }, { label: "162s" }, { label: "198s" }, { label: "144s" }],
  correct_answer: "180s",
  correct_index: 0,
  explanation: "Barrier has a 180-second base cooldown.",
  image_path: null,
  metadata: { source: "mastery_curriculum", concept_id: "ssm.base.BARRIER" },
  asset_status: NOT_REQUIRED,
  provenance: {
    review_key: MASTERY_KEY,
    source_kind: "mastery_question",
    materialization: "code_generated",
    family: "mastery",
    source_version: "mset_bbb59f3c",
  },
};

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

/** Open the All-sources tab, where generated rows live. */
async function openUniverse() {
  renderReview();
  fireEvent.click(await screen.findByRole("button", { name: "All sources" }));
  await screen.findByTestId(`universe-generate-${MASTERY_KEY}`);
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
      content_digest: "d", row_count: UNIVERSE_ROWS.length, source_counts: {},
      collector_errors: [], database: { name: "test", dataset_id: "d1" },
    },
  });
  getReviewUniverseItem.mockResolvedValue({ ok: true, item: MASTERY_ITEM });
});
afterEach(() => { cleanup(); clearAdminKey(); vi.clearAllMocks(); });

describe("which generated rows look publishable", () => {
  it("enables Generate on a materialized Mastery row", async () => {
    await openUniverse();
    const button = screen.getByTestId(`universe-generate-${MASTERY_KEY}`) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("data-source-supported")).toBe("true");
  });

  it("disables Generate on a family DEFINITION and says why on screen", async () => {
    await openUniverse();
    const key = "family:ability_cooldown_haste";
    const button = screen.getByTestId(`universe-generate-${key}`) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-refusal-code")).toBe("definition_only");
    // On screen, not only in a title attribute a screenshot would never show.
    expect(screen.getByTestId(`universe-generate-reason-${key}`).textContent).toMatch(
      /Definition only/i,
    );
  });

  it("disables Generate on a Meta Reflex specimen, naming the renderer", async () => {
    await openUniverse();
    const key = "meta-specimen:attack_type:melee:0";
    const button = screen.getByTestId(`universe-generate-${key}`) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("data-refusal-code")).toBe("renderer_unsupported");
  });

  it("never resolves a row the operator did not ask for", async () => {
    await openUniverse();
    expect(getReviewUniverseItem).not.toHaveBeenCalled();
  });
});

describe("the Mastery handoff", () => {
  it("resolves the render payload, and readiness runs over THAT", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    await screen.findByTestId("generate-content-panel");
    expect(getReviewUniverseItem).toHaveBeenCalledWith(MASTERY_KEY);
    const row = screen.getByTestId(`readiness-row-${MASTERY_KEY}`);
    // `not_required` assets + an absent presentation = the designed pass.
    expect(row.getAttribute("data-content-readiness")).toBe("ready");
    expect(row.getAttribute("data-source-kind")).toBe("mastery_question");
  });

  it("emits a --review-key command naming the key, not an id", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    await screen.findByTestId("generate-content-panel");
    expect(commandText()).toBe(
      `npm run quiz:screenshots -- --review-key ${MASTERY_KEY} ` +
        '--states "question,correct" --formats mobile-social',
    );
    expect(commandText()).not.toContain("--question-id");
  });

  it("still carries no credential and no gate override on any route", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    await screen.findByTestId("generate-content-panel");
    const page = document.body.innerHTML;
    for (const flag of NEVER_EMITTED_FLAGS) expect(page).not.toContain(flag);
    expect(page).not.toContain("secret-admin");
  });

  it("offers the workspace link with a v2 handoff for the key", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    await screen.findByTestId("generate-content-panel");
    const link = document.querySelector<HTMLAnchorElement>(
      'a[href*="/dev/content-studio"]',
    );
    expect(link).toBeTruthy();
    expect(link!.href).toContain("hv=2");
    // The kind TAG's colon is literal; the key's own colons are escaped. That
    // asymmetry is what makes "split at the first colon" unambiguous.
    expect(link!.href).toContain("items=rk:mastery%3Assm.base.BARRIER");
  });

  it("reports a backend refusal instead of rendering an empty panel", async () => {
    getReviewUniverseItem.mockResolvedValue({
      ok: false,
      code: "definition_only",
      error: "A family definition describes a generator, not a question.",
      review_key: MASTERY_KEY,
      source_kind: "family_definition",
    });
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    const status = await screen.findByTestId("generate-content-review-key-error");
    expect(status.textContent).toMatch(/describes a generator/);
    expect(screen.queryByTestId("generate-content-panel")).toBeNull();
  });

  it("keeps the operator in the All-sources tab they started from", async () => {
    await openUniverse();
    fireEvent.click(screen.getByTestId(`universe-generate-${MASTERY_KEY}`));
    await screen.findByTestId("generate-content-panel");
    // The list they were working through is still there beside the panel.
    await waitFor(() =>
      expect(screen.getByTestId(`universe-generate-${MASTERY_KEY}`)).toBeTruthy(),
    );
  });
});
