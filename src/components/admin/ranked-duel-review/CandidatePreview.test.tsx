import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CandidatePreview } from "./CandidatePreview";
import { setAdminKey, clearAdminKey } from "@/lib/knowledge-admin/key";
import {
  CHAMPION_OPTION_QUESTION,
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import {
  MAGIC_DAMAGE_SCENARIO,
  SELL_SWAP_SCENARIO,
} from "@/lib/question-surface/familyLayoutFixtures";
import type { CandidateDetail } from "@/lib/ranked-duel-review/types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const errBody = (status: number, error_code: string, message = "err") =>
  json({ detail: { error_code, message } }, status);

const DETAIL = (over: Partial<CandidateDetail> = {}): CandidateDetail => ({
  candidate_id: "cand-1",
  source_hash: "sha256:aaa",
  candidate_version: 1,
  family: "item_recipe",
  difficulty_target: "medium",
  difficulty_features: null,
  question_text: ITEM_OPTION_QUESTION.prompt,
  options: [...ITEM_OPTION_QUESTION.options],
  correct_answer: "Kindlegem",
  correct_answer_index: 0,
  scenario: null,
  formula_id: "f1",
  inputs: {},
  calculation_steps: null,
  distractor_derivations: null,
  data_version: "1",
  plausibility_validation: null,
  generation_safety: null,
  derived_status: "unreviewed",
  review: {
    decision: "unreviewed",
    reviewer: null,
    reviewed_at: null,
    notes: "",
    revised_candidate: null,
    source_hash: null,
    history: [],
  },
  validation_warnings: [],
  ...over,
});

/** Public-view payload the backend returns; never carries a correct answer. */
const PUBLIC_VIEW = (over: Record<string, unknown> = {}) => ({
  ...ITEM_OPTION_QUESTION,
  module_id: "quiz",
  derived_status: "unreviewed",
  ...over,
});

let calls: string[];
let response: Response | (() => Response | Promise<Response>);

const install = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return typeof response === "function" ? await response() : response.clone();
    }) as unknown as typeof fetch,
  );
};

beforeEach(() => {
  setAdminKey("secret-admin");
  calls = [];
  response = json(PUBLIC_VIEW());
  install();
});
afterEach(() => {
  cleanup();
  clearAdminKey();
  vi.unstubAllGlobals();
});

const renderPreview = (detail: Partial<CandidateDetail> = {}) =>
  render(<CandidatePreview detail={DETAIL(detail)} />);

const surface = () => screen.getByTestId("scenario-surface");
const answers = () => screen.getByTestId("answer-grid");
const ready = () => waitFor(() => expect(surface()).toBeInTheDocument());

// ---------------------------------------------------------------- loading

describe("CandidatePreview loading and failure", () => {
  it("shows a spinner while the projection loads", () => {
    response = () => new Promise(() => {}) as unknown as Response;
    renderPreview();
    expect(screen.getByLabelText("Loading preview")).toBeInTheDocument();
  });

  it("renders the surface once the projection arrives", async () => {
    renderPreview();
    await ready();
    expect(screen.getByText(ITEM_OPTION_QUESTION.prompt)).toBeInTheDocument();
  });

  it("shows a retryable error when the read fails", async () => {
    response = errBody(500, "internal_error", "backend exploded");
    renderPreview();
    await waitFor(() =>
      expect(screen.getByTestId("rd-preview-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rd-preview-retry")).toBeInTheDocument();

    response = json(PUBLIC_VIEW());
    fireEvent.click(screen.getByTestId("rd-preview-retry"));
    await ready();
  });

  it("explains a 404 without offering a pointless retry", async () => {
    response = errBody(404, "candidate_not_found");
    renderPreview();
    await waitFor(() =>
      expect(screen.getByTestId("rd-preview-error")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rd-preview-error").textContent).toMatch(
      /no longer exists/i,
    );
    expect(screen.queryByTestId("rd-preview-retry")).toBeNull();
  });

  it("surfaces a malformed projection as a typed error, not a blank surface", async () => {
    response = json({ question_id: "c", prompt: "p", options: "nope" });
    renderPreview();
    await waitFor(() =>
      expect(screen.getByTestId("rd-preview-error")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("scenario-surface")).toBeNull();
  });
});

// ------------------------------------------------------------- the states

describe("CandidatePreview interaction states", () => {
  it("starts unselected with answers open", async () => {
    renderPreview();
    await ready();
    expect(screen.getByTestId("preview-state-unselected").dataset.active).toBe(
      "true",
    );
    expect(answers()).toHaveAttribute("data-answers-state", "open");
  });

  it("moves to selected when an answer is clicked", async () => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByText("Ruby Crystal"));
    await waitFor(() =>
      expect(screen.getByTestId("preview-state-selected").dataset.active).toBe(
        "true",
      ),
    );
    expect(answers()).toHaveAttribute("data-answers-state", "open");
  });

  it("locks answers in the locked state without revealing anything", async () => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByTestId("preview-state-locked"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "locked"),
    );
  });

  it("reveals the admin-known correct option in the reveal state", async () => {
    renderPreview({ correct_answer_index: 2 });
    await ready();
    fireEvent.click(screen.getByTestId("preview-state-reveal"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "revealed"),
    );
  });

  it("disables reveal when the candidate has no unambiguous correct option", async () => {
    renderPreview({ correct_answer_index: null });
    await ready();
    expect(screen.getByTestId("preview-state-reveal")).toBeDisabled();
  });

  it("needs no correct answer in the payload to reveal", async () => {
    // The payload the backend sent has none; the index came from the detail.
    renderPreview({ correct_answer_index: 1 });
    await ready();
    const payload = JSON.stringify(PUBLIC_VIEW());
    expect(payload).not.toContain("correct");
    fireEvent.click(screen.getByTestId("preview-state-reveal"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "revealed"),
    );
  });

  it("returns to a fully open surface from reveal", async () => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByTestId("preview-state-reveal"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "revealed"),
    );
    fireEvent.click(screen.getByTestId("preview-state-unselected"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "open"),
    );
  });
});

// ---------------------------------------------------------------- viewport

describe("CandidatePreview viewport control", () => {
  it("defaults to the full-width stage", async () => {
    renderPreview();
    await ready();
    const stage = screen.getByTestId("preview-stage");
    expect(stage.dataset.viewport).toBe("full");
    expect(stage.style.maxWidth).toBe("");
  });

  it.each([
    ["mobile", "375px"],
    ["narrow", "1024px"],
  ])("constrains the stage to the %s width", async (id, expected) => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByTestId(`preview-viewport-${id}`));
    await waitFor(() =>
      expect(screen.getByTestId("preview-stage").style.maxWidth).toBe(expected),
    );
    expect(screen.getByTestId("preview-stage").dataset.viewport).toBe(id);
  });

  it("keeps the same surface mounted across width changes", async () => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByText("Ruby Crystal"));
    fireEvent.click(screen.getByTestId("preview-viewport-mobile"));
    await waitFor(() =>
      expect(screen.getByTestId("preview-stage").dataset.viewport).toBe("mobile"),
    );
    // The selection survived: the width control changes layout, not state.
    expect(screen.getByTestId("preview-state-selected").dataset.active).toBe(
      "true",
    );
  });
});

// ------------------------------------------------------------------ media

describe("CandidatePreview media and layout", () => {
  it("renders answer-option media from the projection", async () => {
    renderPreview();
    await ready();
    const icons = screen
      .getByTestId("answer-grid")
      .querySelectorAll('img[src*="assets/items/"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it("renders the cinematic premise band for a rich subject scenario", async () => {
    // The shipped recipe card: a real item subject, which classifies to the
    // tall Broadcast card rather than a family relation/transaction band.
    renderPreview();
    await ready();
    expect(surface().dataset.band).toBe("cinematic");
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
  });

  it("renders the family band for a combat-relation premise", async () => {
    response = json({
      ...NUMERIC_QUESTION,
      presentation: MAGIC_DAMAGE_SCENARIO.metadata,
      module_id: "quiz",
    });
    renderPreview();
    await ready();
    expect(surface().dataset.band).toBe("family");
    expect(screen.getByTestId("family-band-combat")).toBeInTheDocument();
  });

  it("renders the family band for an item-transaction premise", async () => {
    response = json({
      ...NUMERIC_QUESTION,
      presentation: SELL_SWAP_SCENARIO.metadata,
      module_id: "quiz",
    });
    renderPreview();
    await ready();
    expect(surface().dataset.band).toBe("family");
    expect(screen.getByTestId("family-band-lifecycle")).toBeInTheDocument();
  });

  it("falls back to the compact band for a payload with no premise media", async () => {
    // No `presentation` key at all — the compact fallback's real trigger.
    response = json({ ...CHAMPION_OPTION_QUESTION, module_id: "quiz" });
    renderPreview();
    await ready();
    expect(surface().dataset.band).toBe("compact");
    expect(screen.getByTestId("scenario-compact")).toBeInTheDocument();
  });

  it("uses the production competitive variant, not an admin-only look", async () => {
    renderPreview();
    await ready();
    expect(surface().dataset.variant).toBe("competitive");
  });
});

// ------------------------------------------------------- unsupported module

describe("CandidatePreview unsupported modules", () => {
  it("shows a restrained notice instead of faking live segment state", async () => {
    response = json(PUBLIC_VIEW({ module_id: "item_cost_duel" }));
    renderPreview();
    await waitFor(() =>
      expect(screen.getByTestId("rd-preview-unsupported")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("rd-preview-unsupported").textContent).toMatch(
      /live segment state/i,
    );
    expect(screen.queryByTestId("scenario-surface")).toBeNull();
    expect(screen.queryByTestId("preview-state-control")).toBeNull();
  });
});

// --------------------------------------------------------- side-effect proof

describe("CandidatePreview side-effect boundary", () => {
  it("reads exactly one admin endpoint and no match endpoint", async () => {
    renderPreview();
    await ready();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(
      "/api/admin/ranked-duel/questions/candidates/cand-1/public-view",
    );
    expect(calls.some((u) => u.includes("/api/ranked/matches"))).toBe(false);
  });

  it("makes no further request when the operator interacts", async () => {
    renderPreview();
    await ready();
    fireEvent.click(screen.getByText("Ruby Crystal"));
    fireEvent.click(screen.getByTestId("preview-state-locked"));
    fireEvent.click(screen.getByTestId("preview-state-reveal"));
    fireEvent.click(screen.getByTestId("preview-viewport-mobile"));
    await waitFor(() =>
      expect(answers()).toHaveAttribute("data-answers-state", "revealed"),
    );
    expect(calls).toHaveLength(1);
  });

  it("issues only GET requests", async () => {
    renderPreview();
    await ready();
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    }
  });

  it("shows the operator-only, local-only framing", async () => {
    renderPreview();
    await ready();
    expect(screen.getByTestId("rd-preview-notice").textContent).toMatch(
      /local only/i,
    );
  });
});
