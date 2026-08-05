/**
 * RA7 regression boundary — what the family bands must NOT have touched.
 *
 * The two new bands are additive, but "additive" is only true if the systems
 * they sit next to are provably unchanged. Each case below pins one of those
 * systems from the outside: the answer grid and its option media, the shipped
 * cinematic/compact decision for every payload the family rule declines, the
 * Broadcast classifier the OBS and screenshot renderers run on, and the
 * separate Item Cost Duel module.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "../InteractiveScenarioSurface";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { selectFamilyLayout } from "@/lib/question-surface/familyLayout";
import {
  LEGACY_DAMAGE_SCENARIO,
  MAGIC_DAMAGE_Q,
  MAGIC_DAMAGE_SCENARIO,
  PHYSICAL_DAMAGE_Q,
  PHYSICAL_DAMAGE_SCENARIO,
  PURCHASE_HISTORY_Q,
  PURCHASE_HISTORY_SCENARIO,
  SELL_SWAP_Q,
  SELL_SWAP_SCENARIO,
  STATIC_INVENTORY_Q,
  STATIC_INVENTORY_SCENARIO,
} from "@/lib/question-surface/familyLayoutFixtures";
import {
  ABILITY_OPTION_QUESTION,
  CHAMPION_OPTION_QUESTION,
  ITEM_OPTION_QUESTION,
  NUMERIC_QUESTION,
  RUNE_OPTION_QUESTION,
  SUMMONER_SPELL_OPTION_QUESTION,
  type BackendQuestionPayload,
} from "@/lib/ranked-core/adapters/optionMediaFixtures";
import { questionViewFromPublicQuestion } from "@/lib/ranked-core/adapters/adaptToViews";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import type { QuizQuestion } from "@/lib/quiz/api";
import type {
  InteractionPermissions,
  QuestionView,
} from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

function mount(
  question: QuestionView,
  scenarioSource: QuizQuestion | null,
  extra: Partial<React.ComponentProps<typeof InteractiveScenarioSurface>> = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InteractiveScenarioSurface
        question={question}
        selectedOptionId={null}
        permissions={OPEN}
        onSelectOption={vi.fn()}
        variant="competitive"
        scenarioSource={scenarioSource}
        {...extra}
      />
    </QueryClientProvider>,
  );
}

const fromPayload = (payload: BackendQuestionPayload) => {
  const source = {
    questionId: payload.question_id, prompt: payload.prompt,
    options: payload.options, category: payload.category,
    presentation: payload.presentation ?? null,
    optionMedia: payload.option_media ?? null,
  };
  return {
    question: questionViewFromPublicQuestion(source),
    scenarioSource: scenarioSourceFromPublicQuestion(source),
  };
};

describe("answer-option media is untouched", () => {
  const CASES: [string, BackendQuestionPayload][] = [
    ["item", ITEM_OPTION_QUESTION],
    ["champion", CHAMPION_OPTION_QUESTION],
    ["ability", ABILITY_OPTION_QUESTION],
    ["rune", RUNE_OPTION_QUESTION],
    ["summoner spell", SUMMONER_SPELL_OPTION_QUESTION],
  ];

  it.each(CASES)("%s options still render their icons", (_name, payload) => {
    const { question, scenarioSource } = fromPayload(payload);
    mount(question, scenarioSource);
    const icons = document.querySelectorAll("[data-quiz-answer-options] img");
    expect(icons.length).toBe(payload.options.length);
  });

  it.each(CASES)("%s questions never take a family band", (_name, payload) => {
    const { scenarioSource } = fromPayload(payload);
    expect(selectFamilyLayout(scenarioSource)).toBeNull();
  });

  it("a numeric-option question stays text-only", () => {
    const { question, scenarioSource } = fromPayload(NUMERIC_QUESTION);
    mount(question, scenarioSource);
    expect(document.querySelectorAll("[data-quiz-answer-options] img")).toHaveLength(0);
  });

  it("an ability question's option icons stay slot-neutral", () => {
    const { question, scenarioSource } = fromPayload(ABILITY_OPTION_QUESTION);
    mount(question, scenarioSource);
    for (const img of Array.from(
      document.querySelectorAll<HTMLImageElement>("[data-quiz-answer-options] img"),
    )) {
      expect(img.src).toContain("/api/ranked/media/ability-icon/");
    }
  });

  it("a family band question keeps plain numeric tablets", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    expect(screen.getByTestId("family-band-combat")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-quiz-answer-options] img")).toHaveLength(0);
  });
});

describe("the shipped band decision is unchanged for everything else", () => {
  it("an old payload with no option media and no facts is unaffected", () => {
    mount(MAGIC_DAMAGE_Q, LEGACY_DAMAGE_SCENARIO);
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("cinematic");
  });

  it("a scenario with no source keeps the compact band", () => {
    mount(MAGIC_DAMAGE_Q, null);
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("compact");
  });

  it("a static inventory keeps its cinematic card", () => {
    mount(STATIC_INVENTORY_Q, STATIC_INVENTORY_SCENARIO);
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("cinematic");
  });

  it("the speed variant still suppresses the band entirely", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO, { variant: "speed" });
    expect(screen.queryByTestId("family-band-combat")).toBeNull();
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("none");
  });
});

describe("the Broadcast / screenshot classifier is unchanged", () => {
  /**
   * `selectScenario` drives BroadcastRenderer and the screenshot pipeline. RA7
   * added no card, no scenario type and no classifier tier, so every family
   * payload must still classify exactly as it did — the OBS stage keeps
   * rendering the cinematic card while Ranked renders the band.
   */
  const PAYLOADS = [
    ["magic damage", MAGIC_DAMAGE_SCENARIO, "combat_calculation"],
    ["physical damage", PHYSICAL_DAMAGE_SCENARIO, "combat_calculation"],
    ["sell swap", SELL_SWAP_SCENARIO, "combat_calculation"],
    ["purchase history", PURCHASE_HISTORY_SCENARIO, "combat_calculation"],
  ] as const;

  it.each(PAYLOADS)("%s still classifies as %s", (_name, source, card) => {
    expect(selectScenario(source, false, null).card).toBe(card);
  });

  it("classification does not change when the reveal arrives", () => {
    const before = selectScenario(PHYSICAL_DAMAGE_SCENARIO, false, null);
    const after = selectScenario(PHYSICAL_DAMAGE_SCENARIO, true, "75");
    expect(after.card).toBe(before.card);
    expect(after.key).toBe(before.key);
  });

  it("the premise facts block is invisible to the classifier", () => {
    // Same payload minus the RA7 block: the Broadcast decision is identical.
    const stripped = JSON.parse(JSON.stringify(PHYSICAL_DAMAGE_SCENARIO));
    delete (stripped.metadata as any).assets.premise_facts;
    expect(selectScenario(stripped, false, null))
      .toEqual(selectScenario(PHYSICAL_DAMAGE_SCENARIO, false, null));
  });
});

describe("interaction is unchanged", () => {
  it("one click on an option still selects it", () => {
    const onSelect = vi.fn();
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO, { onSelectOption: onSelect });
    fireEvent.click(screen.getByRole("button", { name: /810/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].label).toBe("810");
  });

  it("keeps every option a focusable native button, and the band unfocusable", () => {
    mount(PURCHASE_HISTORY_Q, PURCHASE_HISTORY_SCENARIO);
    const band = screen.getByTestId("family-band-lifecycle");
    // Nothing inside the band can take focus, which is what makes hiding it
    // from the accessibility tree safe.
    expect(band.querySelectorAll("button, a, input, [tabindex]")).toHaveLength(0);

    const options = screen.getAllByRole("button");
    expect(options.length).toBeGreaterThanOrEqual(PURCHASE_HISTORY_Q.options.length);
    for (const option of options) {
      expect(option.tagName).toBe("BUTTON");
      expect(option.getAttribute("tabindex")).toBeNull();
    }
  });

  it("a locked grid stays locked with a family band present", () => {
    const onSelect = vi.fn();
    mount(SELL_SWAP_Q, SELL_SWAP_SCENARIO, {
      onSelectOption: onSelect,
      permissions: { ...OPEN, canSelectAnswer: false, canChangeAnswer: false },
    });
    fireEvent.click(screen.getByText("810"));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByTestId("answer-grid").dataset.answersState).toBe("locked");
  });
});

describe("the academy theme is unchanged", () => {
  it("the bands use the existing gold/navy palette and no new one", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const html = screen.getByTestId("family-band-combat").outerHTML;
    // The same gold family CompactScenarioBand established.
    expect(html).toContain("#d4b35a");
    expect(html).toContain("#e8c97a");
  });

  it("adds no oversized artwork: no splash or loading image is used", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    for (const img of Array.from(
      screen.getByTestId("family-band-combat").querySelectorAll<HTMLImageElement>("img"),
    )) {
      expect(img.getAttribute("src")).not.toContain("/splash/");
      expect(img.getAttribute("src")).not.toContain("/loading/");
    }
  });
});

describe("the Item Cost Duel module is untouched", () => {
  it("does not go through the question surface at all", async () => {
    const module = await import("@/lib/ranked-core/modules/itemCostDuelModule");
    expect(module).toBeTruthy();
    const text = String(
      Object.values(module).map((v) => (typeof v === "function" ? v.toString() : "")).join(""),
    );
    expect(text).not.toContain("selectFamilyLayout");
    expect(text).not.toContain("FamilyScenarioBand");
  });
});
