/**
 * QF1.2 — the Champion/Combat watermark (`champ-combat.png`, drawn for both
 * `champion_studies` and `combat_workings`): the layer, its three hosts (the
 * live question surface and both structured Mastery views), and the
 * guarantees that keep it decorative and layout-neutral.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
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

const CHAMP_COMBAT = ["champion_studies", "combat_workings"] as const;
const DRAWN = [...CHAMP_COMBAT, "rift_field_guide", "items_economy"] as const;
/** Runes & Summoner Arts: no art yet. */
const OTHER_MOTIFS = QUESTION_MOTIFS.filter(
  (m) => !(DRAWN as readonly string[]).includes(m));
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`);
  expect(at, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf("}", at));
};

describe("QuestionMotifLayer", () => {
  it("draws the champ-combat illustration for Champion/Combat motifs", () => {
    for (const motif of CHAMP_COMBAT) {
      const { unmount } = render(<QuestionMotifLayer motif={motif} />);
      const layer = screen.getByTestId("question-motif-layer");
      expect(layer.getAttribute("data-motif")).toBe(motif);
      expect(layer.getAttribute("data-motif-art")).toBe("champ-combat");
      expect(isDrawnMotif(motif)).toBe(true);
      unmount();
    }
    expect(rule('.question-motif-layer[data-motif-art="champ-combat"]'))
      .toContain('url("/assets/ranked/question-accents/champ-combat.png")');
    // The asset the rule points at is the one in the repo.
    expect(readFileSync(resolve(process.cwd(),
      "public/assets/ranked/question-accents/champ-combat.png")).length).toBeGreaterThan(0);
  });

  it("renders nothing for a null / absent motif", () => {
    for (const motif of [null, undefined]) {
      const { container, unmount } = render(<QuestionMotifLayer motif={motif} />);
      expect(container.innerHTML).toBe("");
      unmount();
    }
    expect(motifHostClass(null)).toBe("");
  });

  it("renders nothing for Spells (no art yet)", () => {
    expect(OTHER_MOTIFS).toEqual(["runes_summoner_arts"]);
    for (const motif of OTHER_MOTIFS) {
      const { container, unmount } = render(<QuestionMotifLayer motif={motif} />);
      expect(container.innerHTML).toBe("");
      expect(isDrawnMotif(motif)).toBe(false);
      expect(motifHostClass(motif)).toBe("");
      unmount();
    }
  });

  it("is decorative: aria-hidden, empty, no children", () => {
    render(<QuestionMotifLayer motif="champion_studies" />);
    const layer = screen.getByTestId("question-motif-layer");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.textContent).toBe("");
    expect(layer.childElementCount).toBe(0);
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
  });

  it("on the question surface the art is a full-sheet bleed clipped only by the parchment", () => {
    const sheet = rule(
      '.question-surface-stack > .question-motif-layer[data-motif-art="champ-combat"]::before');
    expect(sheet).toContain("position: absolute");
    expect(sheet).toContain("inset: calc(-1 * var(--qm-bleed-y)) calc(-1 * var(--qm-bleed-x))");
    expect(sheet).toContain('url("/assets/ranked/question-accents/champ-combat.png")');
    expect(sheet).toContain("opacity: 0.3");
    // The panel clips the bleed WITHOUT becoming a scroll container.
    expect(rule(".ranked-panel:has(.question-surface-stack.question-motif-host)"))
      .toContain("overflow: clip");
  });

  it("draws the Rift/Jungle study (large minion + turret, edge-hung foliage)", () => {
    const { container } = render(<QuestionMotifLayer motif="rift_field_guide" />);
    const layer = within(container).getByTestId("question-motif-layer");
    expect(layer.getAttribute("data-motif-art")).toBe("rift");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.childElementCount).toBe(0);
    const at = (sel: string) => {
      const k = css.lastIndexOf(`${sel} {`);
      expect(k, `missing ${sel}`).toBeGreaterThanOrEqual(0);
      return css.slice(k, css.indexOf("}", k));
    };
    // Figures: one full-sheet bleed, faded to 0.25.
    const figures = at('.question-motif-layer[data-motif-art="rift"]::before');
    expect(figures).toContain('url("/assets/ranked/question-accents/minion.png")');
    expect(figures).toContain('url("/assets/ranked/question-accents/tower.png")');
    expect(figures).toContain("opacity: 0.25");
    expect(css).toContain("inset: calc(-1 * var(--qm-bleed-y)) calc(-1 * var(--qm-bleed-x))");
    // Foliage: hung from the parchment's top edge by the HOST section, beneath
    // content, non-interactive — and nothing on the layer's ::after any more.
    const foliage = at('.question-surface-stack.question-motif-host:has(> '
      + '.question-motif-layer[data-motif-art="rift"])::before');
    expect(foliage).toContain('url("/assets/ranked/question-accents/rift-vines-top.svg")');
    expect(foliage).toContain("z-index: -1");
    expect(foliage).toContain("pointer-events: none");
    expect(foliage).toContain("top: -1.45rem");
    expect(css).not.toContain('.question-motif-layer[data-motif-art="rift"]::after');
    expect(css).not.toContain("rift-leaves.svg");
    for (const f of ["minion.png", "tower.png", "rift-vines-top.svg"]) {
      expect(existsSync(resolve(process.cwd(), "public/assets/ranked/question-accents", f))).toBe(true);
    }
  });

  it("draws the Items study (Long Sword + Amp Tome at 0.22, gold accents at 0.22)", () => {
    const { container } = render(<QuestionMotifLayer motif="items_economy" />);
    const layer = within(container).getByTestId("question-motif-layer");
    expect(layer.getAttribute("data-motif-art")).toBe("items");
    expect(layer.getAttribute("aria-hidden")).toBe("true");
    expect(layer.childElementCount).toBe(0);
    const at = (sel: string) => {
      const k = css.lastIndexOf(`${sel} {`);
      expect(k, `missing ${sel}`).toBeGreaterThanOrEqual(0);
      return css.slice(k, css.indexOf("}", k));
    };
    const items = at('.question-motif-layer[data-motif-art="items"]::before');
    expect(items).toContain('url("/assets/ranked/question-accents/longsword.png")');
    expect(items).toContain('url("/assets/ranked/question-accents/amptome.png")');
    expect(items).not.toContain("deathcap");
    expect(items).toContain("opacity: 0.22");
    expect(items).toContain("inset: calc(-1 * var(--qm-bleed-y)) calc(-1 * var(--qm-bleed-x))");
    const gold = at('.question-surface-stack.question-motif-host:has(> '
      + '.question-motif-layer[data-motif-art="items"])::before');
    expect(gold.match(/gold\.png/g)).toHaveLength(4);
    expect(gold).toContain("opacity: 0.22");
    expect(gold).toContain("z-index: -1");
    expect(gold).toContain("pointer-events: none");
    // Two coins on each outer side.
    expect(gold.match(/left \d/g)).toHaveLength(2);
    expect(gold.match(/right \d/g)).toHaveLength(2);
    for (const f of ["longsword.png", "amptome.png", "gold.png"]) {
      expect(existsSync(resolve(process.cwd(), "public/assets/ranked/question-accents", f))).toBe(true);
    }
  });

  it("Champion/Combat is unchanged by the Rift art", () => {
    const sheet = rule(
      '.question-surface-stack > .question-motif-layer[data-motif-art="champ-combat"]::before');
    expect(sheet).toContain("opacity: 0.3");
    expect(sheet).toContain("filter: grayscale(1) brightness(1.2) contrast(1.5)");
    expect(sheet).toContain("background-position:\n    calc(var(--qm-bleed-x) - 266px - 1.35rem) calc(var(--qm-bleed-y) - 277px)");
  });

  it("the rejected Champion Studies pieces are gone", () => {
    for (const piece of ["qm-ruler", "qm-corner", "qm-keys", "qm-dossier", "qm-versus",
      "question-motifs/champion-studies"]) {
      expect(css).not.toContain(piece);
    }
    expect(existsSync(resolve(process.cwd(), "public/assets/question-motifs"))).toBe(false);
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
  it("topic.motif reaches the card: one layer, the section's last child", () => {
    renderLive("champion_studies");
    const surface = screen.getByTestId("scenario-surface");
    expect(surface.className).toContain(QUESTION_MOTIF_HOST_CLASS);
    const layers = within(surface).getAllByTestId("question-motif-layer");
    expect(layers).toHaveLength(1);
    expect(surface.lastElementChild).toBe(layers[0]);
    // The prompt region itself is untouched (no class, no child layer).
    const prompt = surface.querySelector('[data-surface-region="prompt"]')!;
    expect(prompt.className).toBe("space-y-1");
    expect(within(prompt as HTMLElement).queryByTestId("question-motif-layer")).toBeNull();
  });

  it("a combat_workings question draws the same artwork", () => {
    renderLive("combat_workings");
    expect(screen.getByTestId("question-motif-layer").getAttribute("data-motif-art"))
      .toBe("champ-combat");
  });

  it("a Spells question draws nothing", () => {
    renderLive("runes_summoner_arts");
    expect(screen.queryByTestId("question-motif-layer")).toBeNull();
    expect(screen.getByTestId("scenario-surface").className)
      .not.toContain(QUESTION_MOTIF_HOST_CLASS);
  });

  it("a Rift/Jungle question draws the rift study; reveal keeps it", () => {
    const { rerender } = render(
      <InteractiveScenarioSurface question={{ ...Q, motif: "rift_field_guide", roles: ["jungle"] }}
        selectedOptionId="1" permissions={NO_INTERACTIONS} onSelectOption={vi.fn()}
        variant="competitive" />);
    expect(screen.getByTestId("question-motif-layer").getAttribute("data-motif-art")).toBe("rift");
    rerender(
      <InteractiveScenarioSurface question={{ ...Q, motif: "rift_field_guide", roles: ["jungle"] }}
        selectedOptionId="1" permissions={NO_INTERACTIONS} onSelectOption={vi.fn()}
        variant="competitive"
        reveal={{ revealed: true, correctOptionId: "0", isCorrect: false, explanation: null }} />);
    expect(screen.getByTestId("question-motif-layer").getAttribute("data-motif-art")).toBe("rift");
    expect(within(screen.getByTestId("scenario-surface")).getAllByTestId("role-emblem")
      .map((e) => e.getAttribute("data-role"))).toEqual(["jungle"]);
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
    expect(screen.getAllByTestId("question-motif-layer")).toHaveLength(1);
    rerender(
      <InteractiveScenarioSurface question={{ ...Q, motif: "champion_studies" }}
        selectedOptionId="1" permissions={NO_INTERACTIONS} onSelectOption={vi.fn()}
        variant="competitive"
        reveal={{ revealed: true, correctOptionId: "0", isCorrect: false, explanation: null }} />);
    expect(screen.getAllByTestId("question-motif-layer")).toHaveLength(1);
  });

  it("adds nothing but the host class and the layers to the card", () => {
    const strip = (html: string) => html
      .replace(/<div aria-hidden="true" data-testid="question-motif-layer"[^>]*><\/div>/g, "")
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
  it("a recall card draws the watermark on its own card, last child", () => {
    for (const kind of ["ability", "stat"] as const) {
      const { unmount } = renderSlice(challenge(kind, "champion_studies"));
      const card = screen.getByTestId("mastery-atomic-recall-question");
      expect(card.className).toContain(QUESTION_MOTIF_HOST_CLASS);
      const layer = within(card).getByTestId("question-motif-layer");
      expect(layer.getAttribute("data-motif-art")).toBe("champ-combat");
      expect(card.lastElementChild).toBe(layer);
      unmount();
    }
  });

  it("a comparison draws it too, and keeps both roles", () => {
    renderSlice(challenge("compare", "champion_studies", ["mid", "top"]));
    const card = screen.getByTestId("mastery-comparison-question");
    expect(within(card).getByTestId("question-motif-layer").getAttribute("data-motif-art"))
      .toBe("champ-combat");
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
