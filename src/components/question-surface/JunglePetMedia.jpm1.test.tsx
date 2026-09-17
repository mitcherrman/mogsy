/**
 * JPM1 — Jungle Systems pet media and family atmosphere.
 *
 * The backend resolves the companion AND its form (from the JSA1 unlock stage)
 * and emits `assets.subject = {type: "jungle_pet", id, name, form, icon}`.
 * These tests hold the frontend half: that payload reaches the shared
 * environment composition on the jungle ground; media-free Jungle Systems rows
 * get the jungle plate without any subject; every other compact category is
 * untouched. Payloads below are the verbatim backend blob shape.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import { resolveCompactDensity } from "@/lib/question-surface/compactDensity";
import { JUNGLE_GRASS_BACKGROUND } from "@/lib/question-surface/jungleAtmosphere";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

const PETS = ["scorchclaw", "mosstomper", "gustwalker"] as const;
const FORMS = ["base", "evolved"] as const;

function petPresentation(pet: string, form: string) {
  return {
    assets: {
      subject: {
        type: "jungle_pet",
        id: pet,
        name: pet[0].toUpperCase() + pet.slice(1),
        form,
        icon: `assets/ranked/jungle_pets/${pet}_${form}.png`,
      },
    },
    presentation: { role: "context", timing: "question", spoiler: false },
  };
}

const BURN_VIEW: QuestionView = {
  questionId: "q-burn",
  category: "Jungle Systems",
  prompt:
    "Scorchclaw's Slash burns the champion you hit at full stacks. How much of the target's maximum health does that burn deal as true damage?",
  options: ["3%", "4%", "5%", "6%"].map((label, index) => ({ id: String(index), index, label })),
};

function source(view: QuestionView, presentation?: Record<string, unknown>) {
  return scenarioSourceFromPublicQuestion({
    questionId: view.questionId,
    prompt: view.prompt,
    options: view.options.map((o) => o.label),
    category: view.category,
    presentation,
  });
}

function mount(view: QuestionView, presentation?: Record<string, unknown>) {
  return render(
    <InteractiveScenarioSurface
      question={view} selectedOptionId={null} permissions={OPEN}
      onSelectOption={vi.fn()} variant="competitive" scenarioSource={source(view, presentation)}
    />,
  );
}

describe("JPM1 — jungle pet subject", () => {
  it.each(PETS.flatMap((pet) => FORMS.map((form) => [pet, form] as const)))(
    "%s %s selects the environment card with its own art",
    (pet, form) => {
      const src = source(BURN_VIEW, petPresentation(pet, form))!;
      expect(resolveBandProfile(src, "hero", null)).toBe("cinematic");
      const selection = selectScenario(src, false, null);
      expect(selection.card).toBe("environment");
      if (selection.card !== "environment") return;
      expect(selection.environment.kind).toBe("jungle_pet");
      expect(selection.environment.form).toBe(form);
      expect(selection.environment.icon).toMatch(
        new RegExp(`/assets/ranked/jungle_pets/${pet}_${form}\\.png$`),
      );
    },
  );

  it("renders the evolved Scorchclaw burn question on the jungle ground", () => {
    const { container } = mount(BURN_VIEW, petPresentation("scorchclaw", "evolved"));
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
    const srcs = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(srcs.some((s) => s?.endsWith("scorchclaw_evolved.png"))).toBe(true);
    expect(srcs).toContain(JUNGLE_GRASS_BACKGROUND);
    expect(srcs.some((s) => s?.includes("academy-hall"))).toBe(false);
    expect(container.textContent).toContain("Scorchclaw");
    expect(container.textContent).toContain("Evolved Companion");
  });

  it("captions a base-form companion without claiming evolution", () => {
    const { container } = mount(BURN_VIEW, petPresentation("mosstomper", "base"));
    expect(container.textContent).toContain("Mosstomper");
    expect(container.textContent).not.toContain("Evolved Companion");
  });

  it("an unknown subject type never acquires the card by a plausible name", () => {
    const presentation = petPresentation("scorchclaw", "evolved");
    (presentation.assets.subject as Record<string, unknown>).type = "jungle_companion";
    expect(selectScenario(source(BURN_VIEW, presentation)!, false, null).card).not.toBe("environment");
  });
});

describe("JPM1 — media-free Jungle Systems rows", () => {
  const SMITE_VIEW: QuestionView = {
    ...BURN_VIEW,
    questionId: "q-smite",
    prompt: "How long does a Smite charge take to recharge?",
  };

  it("resolves the jungle density for the Jungle Systems category only", () => {
    expect(resolveCompactDensity("Jungle Systems")).toBe("jungle");
    expect(resolveCompactDensity("jungle_systems")).toBe("jungle");
    expect(resolveCompactDensity("Jungle Systems Advanced")).toBe("plate");
    expect(resolveCompactDensity("Objectives")).toBe("context");
    expect(resolveCompactDensity("league_mechanics")).toBe("plate");
  });

  it("draws the jungle ground on a growing plate with no subject and no watermark", () => {
    const { container } = mount(SMITE_VIEW);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("jungle");
    expect(plate.className).toMatch(/(^|\s)grow(\s|$)/);
    const ground = screen.getByTestId("scenario-compact-jungle-ground");
    expect(ground.getAttribute("src")).toBe(JUNGLE_GRASS_BACKGROUND);
    expect(ground.getAttribute("alt")).toBe("");
    expect(ground.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByTestId("scenario-compact-watermark")).toBeNull();
    expect(container.innerHTML).not.toMatch(/scorchclaw|mosstomper|gustwalker/i);
    expect(plate.textContent).toContain("Jungle Systems");
  });

  it("leaves unrelated compact categories byte-identical", () => {
    mount({ ...SMITE_VIEW, category: "league_mechanics" });
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("plate");
    expect(screen.getByTestId("scenario-compact-watermark")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-compact-jungle-ground")).toBeNull();
  });
});
