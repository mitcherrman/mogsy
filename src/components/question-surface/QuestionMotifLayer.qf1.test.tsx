/**
 * QF1.2A — the Champion Studies motif: the layer, its three hosts (the live
 * question surface and both structured Mastery views), and the guarantees
 * that keep it decorative and layout-neutral.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import {
  QUESTION_MOTIF_HOST_CLASS, QuestionMotifLayer, isDrawnMotif, motifHostClass,
} from "./QuestionMotifLayer";
import { QUESTION_MOTIFS } from "@/lib/question-surface/questionMotif";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { quizModule } from "@/lib/ranked-core/modules/quizModule";
import { masterySliceModule } from "@/lib/ranked-core/modules/masterySliceModule";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";

afterEach(cleanup);

const OTHER_MOTIFS = QUESTION_MOTIFS.filter((m) => m !== "champion_studies");
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("QuestionMotifLayer", () => {
  it("draws champion_studies", () => {
    render(<QuestionMotifLayer motif="champion_studies" />);
    const layer = screen.getByTestId("question-motif-layer");
    expect(layer.getAttribute("data-motif")).toBe("champion_studies");
    expect(layer.querySelectorAll(".qm-piece").length).toBeGreaterThan(0);
  });

  it("renders nothing for a null / absent motif", () => {
    for (const motif of [null, undefined]) {
      const { container, unmount } = render(<QuestionMotifLayer motif={motif} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
    expect(motifHostClass(null)).toBe("");
  });

  it("renders nothing for the four motifs that have no artwork yet", () => {
    for (const motif of OTHER_MOTIFS) {
      const { container, unmount } = render(<QuestionMotifLayer motif={motif} />);
      expect(container.innerHTML).toBe("");
      expect(isDrawnMotif(motif)).toBe(false);
      expect(motifHostClass(motif)).toBe("");
      unmount();
    }
  });

  it("is hidden from assistive technology and holds no text", () => {
    render(<QuestionMotifLayer motif="champion_studies" variant="versus" />);
    const layer = screen.getByTestId("question-motif-layer");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.textContent).toBe("");
  });

  it("is non-interactive and out of flow (the stylesheet contract)", () => {
    const layer = rule(".question-motif-layer");
    expect(layer).toContain("position: absolute");
    expect(layer).toContain("inset: 0");
    expect(layer).toContain("pointer-events: none");
    expect(layer).toContain("z-index: -1");
    expect(layer).toContain("margin: 0 !important");
    const host = rule(`.${QUESTION_MOTIF_HOST_CLASS}`);
    expect(host).toContain("position: relative");
    expect(host).toContain("isolation: isolate");
    // No role colour and no fixed colour of its own: ink is currentColor.
    expect(rule(".question-motif-layer .qm-piece")).toContain("background-color: currentColor");
  });

  it("draws one accent per variant, never a second motif id", () => {
    const accents = { study: "qm-keys", dossier: "qm-dossier", versus: "qm-versus" } as const;
    for (const [variant, cls] of Object.entries(accents)) {
      const { container, unmount } = render(
        <QuestionMotifLayer motif="champion_studies" variant={variant as keyof typeof accents} />);
      const layer = within(container).getByTestId("question-motif-layer");
      expect(layer.getAttribute("data-motif")).toBe("champion_studies");
      expect(layer.querySelectorAll(".qm-accent")).toHaveLength(1);
      expect(layer.querySelector(`.${cls}`)).not.toBeNull();
      unmount();
    }
  });

  it("splits frame and accent when asked", () => {
    const { container } = render(<>
      <QuestionMotifLayer motif="champion_studies" parts="frame" />
      <QuestionMotifLayer motif="champion_studies" parts="accent" />
    </>);
    const [frame, accent] = within(container).getAllByTestId("question-motif-layer");
    expect(frame.querySelector(".qm-accent")).toBeNull();
    expect(frame.querySelector(".qm-ruler")).not.toBeNull();
    expect(accent.querySelector(".qm-ruler")).toBeNull();
    expect(accent.querySelector(".qm-accent")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── the live question

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};
const Q: QuestionView = {
  questionId: "qq-1#r8", category: "Champion Ability Costs",
  prompt: "What is the mana cost of Ahri's Orb of Deception (Q) at rank 1?",
  options: ["55", "60", "65", "70"].map((label, index) => ({ id: String(index), index, label })),
};

function liveRound(motif: string | null, roles: string[] = []) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).question = {
    question_id: Q.questionId, prompt: Q.prompt, options: Q.options.map((o) => o.label),
    category: Q.category,
    topic: { category: "abilities", tier: "medium",
      icon_hint: { kind: "category", key: Q.category, icon: null },
      roles, ...(motif ? { motif } : {}) },
  };
  return readPublicRound(body);
}

function renderLive(motif: string | null, roles: string[] = []) {
  return render(<quizModule.Viewport publicRound={liveRound(motif, roles)} selection={null}
    permissions={OPEN} onSelect={vi.fn()} segmentState={null}
    actions={{ submitChallenge: vi.fn(), busy: false, error: null }} skewMs={0} />);
}

describe("live Ranked question (quiz.v1 → InteractiveScenarioSurface)", () => {
  it("topic.motif reaches the card: the frame on the card, the accent in the prompt", () => {
    renderLive("champion_studies");
    const surface = screen.getByTestId("scenario-surface");
    expect(surface.className).toContain(QUESTION_MOTIF_HOST_CLASS);
    const layers = within(surface).getAllByTestId("question-motif-layer");
    expect(layers.map((l) => l.getAttribute("data-motif-parts"))).toEqual(["accent", "frame"]);
    const prompt = surface.querySelector('[data-surface-region="prompt"]')!;
    expect(prompt.className).toContain(QUESTION_MOTIF_HOST_CLASS);
    expect(within(prompt as HTMLElement).getByTestId("question-motif-layer")
      .getAttribute("data-motif-parts")).toBe("accent");
    // The frame is the section's LAST child: no sibling selector sees it.
    expect(surface.lastElementChild?.getAttribute("data-testid")).toBe("question-motif-layer");
  });

  it("no motif on the wire draws nothing and adds no host class", () => {
    renderLive(null);
    const surface = screen.getByTestId("scenario-surface");
    expect(within(surface).queryByTestId("question-motif-layer")).toBeNull();
    expect(surface.className).not.toContain(QUESTION_MOTIF_HOST_CLASS);
  });

  it("keeps every role emblem exactly as RQ1 draws them", () => {
    renderLive("champion_studies", ["jungle", "mid"]);
    // A media-less card puts RQ1's emblems in the compact band; wherever RQ1
    // draws them, they are all still there, in lane order.
    const emblems = within(screen.getByTestId("scenario-surface")).getAllByTestId("role-emblem");
    expect(emblems.map((e) => e.getAttribute("data-role"))).toEqual(["jungle", "mid"]);
    // The motif is never inside the emblem cluster, nor the emblems inside it.
    for (const layer of screen.getAllByTestId("question-motif-layer")) {
      expect(within(layer).queryByTestId("role-emblem")).toBeNull();
    }
  });

  it("the reveal does not remove the motif", () => {
    const { rerender } = render(
      <InteractiveScenarioSurface question={{ ...Q, motif: "champion_studies" }}
        selectedOptionId="1" permissions={NO_INTERACTIONS} onSelectOption={vi.fn()}
        variant="competitive" />);
    expect(screen.getAllByTestId("question-motif-layer")).toHaveLength(2);
    rerender(
      <InteractiveScenarioSurface question={{ ...Q, motif: "champion_studies" }}
        selectedOptionId="1" permissions={NO_INTERACTIONS} onSelectOption={vi.fn()}
        variant="competitive"
        reveal={{ revealed: true, correctOptionId: "0", isCorrect: false, explanation: null }} />);
    expect(screen.getAllByTestId("question-motif-layer")).toHaveLength(2);
  });

  it("adds nothing but the host class and the layers to the card", () => {
    const strip = (html: string) => html
      .replace(/<div aria-hidden="true" data-testid="question-motif-layer"[\s\S]*?<\/div>/g, "")
      .split(` ${QUESTION_MOTIF_HOST_CLASS}`).join("");
    const html = (motif: QuestionView["motif"]) => {
      const { container, unmount } = render(
        <InteractiveScenarioSurface question={{ ...Q, motif }} selectedOptionId={null}
          permissions={OPEN} onSelectOption={vi.fn()} variant="competitive" />);
      const out = container.innerHTML;
      unmount();
      return out;
    };
    expect(strip(html("champion_studies"))).toBe(html(null));
  });
});

// ───────────────────────────────────────────────────────── structured Mastery

function withQueryClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function challenge(kind: "ability" | "stat" | "compare", motif: string | null, roles?: string[]) {
  const extra = { ...(motif ? { motif } : {}), ...(roles ? { roles } : {}) };
  if (kind === "compare") {
    return {
      challenge_index: 0, interaction_kind: "comparison_left_right",
      question_family: "ability_cooldown", prompt: "Brand Q vs Diana Q",
      answer_type: "single_choice", answer_options: ["Brand", "Diana", "tie"],
      prompt_semantics: null,
      comparison_semantics: { template: "compare_ability_cooldown", champion_a_display: "Brand",
        champion_b_display: "Diana", metric: "ability_cooldown", dimension: "duration",
        subject_ref: "Q", context: { ability_rank: 1, champion_level: null, form: null },
        unit: "seconds", ability_name_a: "Sear", ability_name_b: "Crescent Strike",
        rank_independent: false },
      ...extra,
    };
  }
  return {
    challenge_index: 0, interaction_kind: "atomic_recall",
    question_family: kind === "ability" ? "ability_cooldown" : "champion_base_stat",
    prompt: "p", answer_type: "single_choice", answer_options: ["9", "10", "11", "12"],
    prompt_semantics: kind === "ability"
      ? { template: "ability_cooldown_at_rank", champion_display: "Brand",
        metric: "ability_cooldown", subject_ref: "Q", ability_name: "Q",
        context: { ability_rank: 1, champion_level: null, form: null } }
      : { template: "champion_base_stat", champion_display: "Garen", metric: "armor" },
    comparison_semantics: null, ...extra,
  };
}

function renderSlice(wire: Record<string, unknown>) {
  const body = publicRoundV2();
  const base = {
    module_id: "mastery_slice", module_version: 1, challenge_count: 1, segment_number: 3,
    phase: "challenges", ability_deadline: null,
    challenge_started_at: "2026-07-18T12:00:05+00:00",
    challenge_deadline: "2026-07-18T12:00:30+00:00", pressure_applied: false,
  };
  const payload = body.payload as Record<string, unknown>;
  payload.question = null;
  payload.segment = { ...base, challenge_index: 0, resolved: false };
  payload.segment_state = { ...base, active: true,
    own_ability: { selected_ability_id: null, confirmed: false,
      available_ability_ids: [], unavailable_ability_ids: {} },
    opponent_ability_confirmed: false, own_next_challenge_index: 0,
    own_submitted_choices: [null], own_challenges_completed: 0,
    opponent_challenges_completed: 0, opponent_finished: false, own_finished: false,
    challenges: { prompt: "Mastery Slice", challenge_count: 1, challenges: [wire] } };
  const round = readPublicRound(body);
  return render(withQueryClient(<masterySliceModule.Viewport publicRound={round}
    selection={null} permissions={NO_INTERACTIONS} onSelect={vi.fn()}
    segmentState={round.segmentState}
    actions={{ submitChallenge: vi.fn(), busy: false, error: null }} skewMs={0} />));
}

describe("structured Mastery views", () => {
  it("an ability recall draws the study variant on its own card", () => {
    renderSlice(challenge("ability", "champion_studies"));
    const card = screen.getByTestId("mastery-atomic-recall-question");
    expect(card.className).toContain(QUESTION_MOTIF_HOST_CLASS);
    const layer = within(card).getByTestId("question-motif-layer");
    expect(layer.getAttribute("data-motif-variant")).toBe("study");
    expect(layer.getAttribute("data-motif-parts")).toBe("all");
    expect(card.lastElementChild).toBe(layer);
  });

  it("a stat recall draws the dossier variant", () => {
    renderSlice(challenge("stat", "champion_studies"));
    expect(screen.getByTestId("question-motif-layer").getAttribute("data-motif-variant"))
      .toBe("dossier");
  });

  it("a comparison draws the versus variant, and keeps both roles", () => {
    renderSlice(challenge("compare", "champion_studies", ["mid", "top"]));
    const card = screen.getByTestId("mastery-comparison-question");
    expect(within(card).getByTestId("question-motif-layer").getAttribute("data-motif-variant"))
      .toBe("versus");
    expect(within(card).getAllByTestId("role-emblem").map((e) => e.getAttribute("data-role")))
      .toEqual(["top", "mid"]);
  });

  it("a Mastery card with no motif is unchanged", () => {
    renderSlice(challenge("compare", null));
    const card = screen.getByTestId("mastery-comparison-question");
    expect(within(card).queryByTestId("question-motif-layer")).toBeNull();
    expect(card.className).toBe("space-y-4");
  });
});
