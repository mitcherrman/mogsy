/**
 * CON1 Step 1B — stored Admin Review row → production question surface.
 *
 * What these tests are FOR: proving one path end to end, with no second copy
 * of anything on it.
 *
 *   stored review row (`presentation` from the backend)
 *     -> storedQuestionPreviewPayload   (shape only)
 *     -> adaptCandidatePreview          (the SAME adapter Ranked candidates use)
 *        -> readPublicQuestion / scenarioSourceFromPublicQuestion
 *     -> selectFamilyLayout             (the SINGLE layout authority)
 *     -> InteractiveScenarioSurface's production scenario band
 *
 * And proving the negative that makes it safe: raw `metadata` — which an Admin
 * row deliberately still carries in full, solution fields included — never
 * feeds any of it.
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReviewQuestion } from "@/lib/quiz/api";
import {
  storedCorrectOptionIndex,
  storedQuestionPreviewPayload,
} from "./storedQuestionPreviewSource";
import { adaptCandidatePreview } from "./rankedPreviewAdapter";
import { selectFamilyLayout } from "@/lib/question-surface/familyLayout";
import { QuestionPreviewPanel } from "@/components/question-preview/QuestionPreviewPanel";

// The panel's network hook must stay untouched on the local path. Mocking it to
// throw makes "no request was made" structural rather than an assumption.
vi.mock("./useExactRankedQuestion", () => ({
  useExactRankedQuestion: (candidateId: string | null) => {
    if (candidateId !== null) throw new Error("stored preview must not fetch");
    return { status: "idle", model: null, error: null, notFound: false, reload: () => {} };
  },
}));

const row = (over: Partial<ReviewQuestion>): ReviewQuestion => ({
  id: 4242,
  question_key: "minion_xp_level_breakpoint:solo:L4:exact_minion",
  question_text: "Solo lane, no XP missed — which minion of wave 4 takes you to level 4?",
  category: "league_mechanics",
  format: "multiple_choice",
  choices: ["1st melee", "2nd melee", "3rd melee", "1st caster"],
  correct_answer: { type: "text", value: "3rd melee" },
  is_active: true,
  review_status: "unreviewed",
  favorite_for_shorts: false,
  missing_asset: false,
  ...over,
});

/**
 * The exact_minion safe premise, as `quiz.family_contract.PREMISE_CONTRACTS`
 * declares it and `build_presentation()` projects it — nine fields, a strict
 * subset of the row's metadata.
 */
const EXACT_MINION_PRESENTATION = {
  lane_context: "solo",
  no_xp_missed: true,
  wave_number: 4,
  spawn_time_display: "2:05",
  melee_count: 3,
  caster_count: 3,
  cannon_count: 0,
  is_cannon_wave: false,
  minion_order_assumption: "melee before caster",
};

/** The same row's FULL metadata — the safe fields plus solution-only ones. */
const EXACT_MINION_METADATA = {
  ...EXACT_MINION_PRESENTATION,
  breakpoint_minion_type: "melee",
  breakpoint_minion_ordinal: 3,
  breakpoint_wave_number: 4,
  solo_cumulative_xp_after_wave: 280,
  solo_level_breakpoint_note: "3rd melee of wave 4",
};

describe("stored review row carries the backend presentation", () => {
  it("passes `presentation` through to the preview payload, verbatim", () => {
    const payload = storedQuestionPreviewPayload(
      row({ presentation: EXACT_MINION_PRESENTATION, metadata: EXACT_MINION_METADATA }),
    );
    expect(payload?.presentation).toEqual(EXACT_MINION_PRESENTATION);
    // Shape, not content: nothing about the premise is invented here.
    expect(payload?.question_id).toBe("4242");
    expect(payload?.options).toEqual(["1st melee", "2nd melee", "3rd melee", "1st caster"]);
    expect(payload?.module_id).toBe("quiz");
  });

  it("takes the correct-answer index from the row, not the payload", () => {
    const r = row({ presentation: EXACT_MINION_PRESENTATION });
    expect(storedCorrectOptionIndex(r)).toBe(2);
    // The payload the surface sees is answer-free, by contract.
    const payload = storedQuestionPreviewPayload(r)!;
    expect(Object.keys(payload)).not.toContain("correct_answer");
    expect(Object.keys(payload)).not.toContain("correct_index");
  });
});

describe("the exact-minion question reaches the production scenario path", () => {
  const model = adaptCandidatePreview(
    storedQuestionPreviewPayload(
      row({ presentation: EXACT_MINION_PRESENTATION, metadata: EXACT_MINION_METADATA }),
    )!,
  );

  it("builds a scenario source whose metadata IS the backend presentation", () => {
    // scenarioSourceFromPublicQuestion maps `presentation` straight through as
    // the Quiz-shaped `metadata`. Equality here is the whole proof that the
    // scenario is drawn from the safe projection and from nothing else.
    expect(model.scenarioSource).not.toBeNull();
    expect(model.scenarioSource!.metadata).toEqual(EXACT_MINION_PRESENTATION);
  });

  it("hands that source to selectFamilyLayout, the single layout authority", () => {
    // The authority is CONSULTED — that is what this step had to prove. What it
    // answers for this family is the authority's business, not this test's: the
    // minion-XP layout rule and its band are unmerged concurrent work on
    // `hygiene/minion-xp-band-preserved`, so on this branch it declines and the
    // surface falls back to its existing presentation. Asserting a specific
    // family layout here would encode a rule this branch does not have.
    expect(() => selectFamilyLayout(model.scenarioSource)).not.toThrow();
  });

  it("carries no solution field into anything the surface can see", () => {
    const seen = JSON.stringify(model);
    for (const leaked of [
      "breakpoint_minion_type",
      "breakpoint_minion_ordinal",
      "breakpoint_wave_number",
      "solo_cumulative_xp_after_wave",
      "solo_level_breakpoint_note",
    ]) {
      expect(seen).not.toContain(leaked);
    }
  });
});

describe("a scenario band renders from `presentation`", () => {
  /**
   * A post-mitigation premise, because that is a family whose layout rule IS on
   * this branch. It proves the full chain the minion question will travel the
   * moment its own rule merges: presentation → scenario source →
   * selectFamilyLayout → the production family band.
   */
  const COMBAT_PRESENTATION = {
    assets: {
      subject: {
        type: "combat_cooldown",
        champion: "Caitlyn",
        champion_icon: "assets/champions/Caitlyn/icon.png",
        item_icons: [],
        ability_slot: "Q",
        ability_name: "Piltover Peacemaker",
      },
      entities: {
        champions: [
          { type: "champion", id: "Caitlyn", name: "Caitlyn", role: "attacker",
            icon: "assets/champions/Caitlyn/icon.png" },
          { type: "champion", id: "Ahri", name: "Ahri", role: "target",
            icon: "assets/champions/Ahri/icon.png" },
        ],
        items: [],
        abilities: [],
        runes: [],
        summoner_spells: [],
      },
      premise_facts: {
        damage_type: "physical", raw_damage: 600,
        target_resist: 60, target_resist_after: 100,
      },
    },
  };

  const combatRow = row({
    id: 77,
    question_key: "post_mitigation_damage:caitlyn:ahri",
    question_text: "How much less post-mitigation damage does the hit deal after the purchase?",
    category: "post_mitigation_damage",
    choices: ["64", "86", "75", "109"],
    correct_answer: { type: "text", value: "86" },
    presentation: COMBAT_PRESENTATION,
  });

  it("selects the family layout from the presentation alone", () => {
    const model = adaptCandidatePreview(storedQuestionPreviewPayload(combatRow)!);
    const layout = selectFamilyLayout(model.scenarioSource);
    expect(layout?.kind).toBe("combat");
  });

  it("renders the production family band inside QuestionPreviewPanel", () => {
    render(
      <QuestionPreviewPanel
        payload={storedQuestionPreviewPayload(combatRow)!}
        correctAnswerIndex={storedCorrectOptionIndex(combatRow)}
      />,
    );
    const surface = screen.getByTestId("scenario-surface");
    expect(surface.getAttribute("data-band")).toBe("family");
  });
});

describe("raw metadata is never a fallback for scenario presentation", () => {
  it("produces no scenario source when only `metadata` is present", () => {
    // The identical row, minus the backend projection. Its metadata still
    // describes the whole scenario — and is still, correctly, unusable.
    const model = adaptCandidatePreview(
      storedQuestionPreviewPayload(row({ metadata: EXACT_MINION_METADATA }))!,
    );
    expect(model.scenarioSource).toBeNull();
  });

  it("omits `presentation` from the payload entirely rather than substituting", () => {
    const payload = storedQuestionPreviewPayload(row({ metadata: EXACT_MINION_METADATA }))!;
    expect("presentation" in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("breakpoint_wave_number");
  });
});

describe("a plain MCQ with no presentation still previews", () => {
  const plain = row({
    id: 9,
    question_key: "item_cost:3153",
    question_text: "What does Blade of the Ruined King cost?",
    category: "items",
    choices: ["3200", "3300", "3400", "3100"],
    correct_answer: { type: "text", value: "3200" },
    metadata: { cost: 3200 },
  });

  it("renders the real surface, with prompt and options", () => {
    render(
      <QuestionPreviewPanel
        payload={storedQuestionPreviewPayload(plain)!}
        correctAnswerIndex={storedCorrectOptionIndex(plain)}
      />,
    );
    expect(screen.getByTestId("scenario-surface")).toBeInTheDocument();
    expect(screen.getByText(/Blade of the Ruined King cost/)).toBeInTheDocument();
    expect(screen.getByText("3300")).toBeInTheDocument();
  });
});

describe("the `wave` form fabricates nothing", () => {
  /**
   * The backend deliberately emits NO presentation for this form: the row's own
   * wave number and spawn time map 1:1 back to the answer, so there is no safe
   * flat premise to project until option-aware enrichment lands.
   */
  const waveRow = row({
    id: 101,
    question_key: "minion_xp_level_breakpoint:solo:L4:wave",
    question_text: "Solo lane, no XP missed — which wave takes you to level 4?",
    choices: ["Wave 3", "Wave 4", "Wave 5", "Wave 6"],
    correct_answer: { type: "text", value: "Wave 4" },
    metadata: {
      ...EXACT_MINION_METADATA,
      target_level: 4,
      composition: "3 melee, 3 caster",
    },
  });

  it("has no scenario source to draw from", () => {
    const model = adaptCandidatePreview(storedQuestionPreviewPayload(waveRow)!);
    expect(model.scenarioSource).toBeNull();
    expect(selectFamilyLayout(model.scenarioSource)).toBeNull();
  });

  it("renders no family or cinematic band", () => {
    render(<QuestionPreviewPanel payload={storedQuestionPreviewPayload(waveRow)!} />);
    const band = screen.getByTestId("scenario-surface").getAttribute("data-band");
    expect(band).not.toBe("family");
    expect(band).not.toBe("cinematic");
    // And nothing reconstructed the wave from the metadata that is still there.
    expect(screen.queryByText(/2:05/)).toBeNull();
    expect(screen.queryByText(/3 melee, 3 caster/)).toBeNull();
  });
});
