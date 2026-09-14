/**
 * ENV1 — the media-free ENVIRONMENT fallback.
 *
 * WHAT THIS PASS IS FOR
 * A structure/objective round carries no `assets.subject` (no canonical turret,
 * dragon, Baron, inhibitor or Nexus art exists in either repo), so it resolves
 * to `compact` and gets `CompactScenarioBand`. RR1 made that plate GROW into
 * the arena's 16rem reserved media region and fill it with its own hextech
 * diamond — which, on these rounds, is a ~256px near-empty black rectangle
 * carrying one generic glyph where the question's subject should be.
 *
 * This file holds the narrow fix and, just as importantly, its BLAST RADIUS.
 * `CompactScenarioBand` has exactly one render caller in the codebase
 * (`InteractiveScenarioSurface`), and it serves every media-free family —
 * wave economy, Pro Play, the registry-gap summoner spells, and more. So the
 * contract asserted here is two-sided: the environment families get the new
 * strip, and everything else is byte-identical to RR1.
 *
 * The interim nature is asserted too: this must disappear on its own once the
 * backend art workstream lands, with no edit to the frontend.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "./InteractiveScenarioSurface";
import { CompactScenarioBand } from "./CompactScenarioBand";
import { resolveCompactDensity } from "@/lib/question-surface/compactDensity";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import { scenarioSourceFromPublicQuestion } from "@/lib/ranked-core/adapters/scenarioSource";
import type { QuizQuestion } from "@/lib/quiz/api";
import type { InteractionPermissions, QuestionView } from "@/lib/ranked-core/viewTypes";

const OPEN: InteractionPermissions = {
  canSelectAnswer: true, canChangeAnswer: true, canSelectAbility: true,
  canReviewSubmission: true, canConfirmSubmission: true, canAdvance: false,
};

const TURRET_VIEW: QuestionView = {
  questionId: "q-turret",
  category: "Objectives",
  prompt: "How many turrets does each team have on Summoner's Rift?",
  options: [
    { id: "0", index: 0, label: "1" },
    { id: "1", index: 1, label: "2" },
    { id: "2", index: 2, label: "3" },
    { id: "3", index: 3, label: "11" },
  ],
};

/** The reported round: an environment structure row with no subject at all. */
const TURRET_SOURCE: QuizQuestion = {
  id: "q-turret",
  question_key: "environment_mechanic:structure_stats:review:count:turrets_total",
  category: "Objectives",
  question_text: TURRET_VIEW.prompt,
  format: "multiple_choice",
  choices: TURRET_VIEW.options.map((o) => o.label),
};

const WAVE_VIEW: QuestionView = {
  ...TURRET_VIEW,
  questionId: "q-wave",
  category: "league_mechanics",
};

/** A media-free row from an UNRELATED family — the blast-radius control. */
const WAVE_ECONOMY_SOURCE: QuizQuestion = {
  id: "q-wave",
  question_key: "wave_economy:cannon_gold:long",
  category: "league_mechanics",
  question_text: "How far behind is the solo laner?",
  format: "multiple_choice",
  choices: ["A", "B", "C", "D"],
};

function mount(scenarioSource: QuizQuestion | null, question: QuestionView = TURRET_VIEW) {
  return render(
    <InteractiveScenarioSurface
      question={question} selectedOptionId={null} permissions={OPEN}
      onSelectOption={vi.fn()} variant="competitive" scenarioSource={scenarioSource}
    />,
  );
}

// ───────────────────────────────────── who opts in

describe("ENV1 — compact density ownership", () => {
  it("gives the environment categories the context strip", () => {
    for (const category of ["Objectives", "Objective Timers", "Minion Waves", "Game Fundamentals"]) {
      expect(resolveCompactDensity(category)).toBe("context");
    }
  });

  it("normalises case and underscores, so a stored spelling cannot slip past", () => {
    for (const category of ["objectives", "MINION WAVES", "minion_waves", " Objective_Timers "]) {
      expect(resolveCompactDensity(category)).toBe("context");
    }
  });

  it("leaves every other media-free category on the RR1 plate", () => {
    for (const category of [
      "league_mechanics", "Pro Play", "items", "Item Costs",
      "Summoner Spells", "Runes", "Champion Ability Cooldowns",
    ]) {
      expect(resolveCompactDensity(category)).toBe("plate");
    }
  });

  it("defaults to the plate when there is no category at all", () => {
    expect(resolveCompactDensity(null)).toBe("plate");
    expect(resolveCompactDensity(undefined)).toBe("plate");
    expect(resolveCompactDensity("")).toBe("plate");
  });

  it("matches the category EXACTLY, never a substring of one", () => {
    // A frontend entity→art map is what this must not become, and a loose
    // match is how such a thing starts. "Objectives" is a category; "Pro Play
    // Objectives" is not this rule's business.
    expect(resolveCompactDensity("Pro Play Objectives")).toBe("plate");
    expect(resolveCompactDensity("Objectives and Structures")).toBe("plate");
  });
});

// ───────────────────────────────────── what the strip draws

describe("ENV1 — the context strip", () => {
  it("a media-free environment round renders the context strip", () => {
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("context");
  });

  it("reaches the strip on the PRODUCTION path, where there is no source at all", () => {
    // The measured production shape, and the reason this rule reads the
    // category rather than the backend's family key: a structure row carries
    // no `presentation`, so `scenarioSourceFromPublicQuestion` returns null
    // and the surface is handed nothing but the QuestionView. A rule that
    // needed the source would be inert exactly here.
    expect(scenarioSourceFromPublicQuestion({
      questionId: "q-turret",
      prompt: TURRET_VIEW.prompt,
      options: TURRET_VIEW.options.map((o) => o.label),
      category: "Objectives",
    })).toBeNull();

    mount(null);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("context");
    expect(screen.getByTestId("scenario-compact-ground")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-compact-watermark")).toBeNull();
  });

  it("does NOT occupy the full hero-media height", () => {
    // The two halves of the RR1 growth contract, both reversed here: no
    // growth affordance, and a floor at 7rem against the region's 16rem
    // reserve. jsdom does no layout, so the class contract IS the assertion —
    // the pixel proof is the browser measurement in the ENV1 report.
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.className).not.toMatch(/(^|\s)grow(\s|$)/);
    expect(plate.className).toContain("sm:min-h-[7rem]");
    expect(plate.className).not.toContain("sm:min-h-[4.5rem]");
  });

  it("drops the large diamond watermark — the fake-subject glyph", () => {
    // The mark the owner reported standing in for the turret. At this height
    // it would be the band's dominant element, which is a claim about the
    // question's subject that the payload does not support.
    mount(TURRET_SOURCE);
    expect(screen.queryByTestId("scenario-compact-watermark")).toBeNull();
  });

  it("keeps the emblem as secondary decoration, not as subject media", () => {
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    // Label-scale (h-9/w-9), beside the text, asset-free — a bullet, not a hero.
    const emblem = plate.querySelector(".h-9.w-9");
    expect(emblem).not.toBeNull();
    expect(emblem?.querySelector("img")).toBeNull();
  });

  it("preserves the category and context text", () => {
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.textContent).toContain("Objectives");
    expect(plate.textContent).toContain("Knowledge Battle");
  });

  it("seats the academy ground decoratively, and never as the subject", () => {
    mount(TURRET_SOURCE);
    const ground = screen.getByTestId("scenario-compact-ground");
    // Same asset the environment card uses as its atmosphere, so a round with
    // a subject and one without read as the same place.
    expect(ground.getAttribute("src")).toContain("academy-hall");
    // Decorative: no alt text, hidden from the accessibility tree, and it is
    // NOT the subject media — it carries no identity and states nothing.
    expect(ground.getAttribute("alt")).toBe("");
    expect(ground.getAttribute("aria-hidden")).toBe("true");
  });

  it("never invents turret, dragon or Baron art", () => {
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    const srcs = [...plate.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
    // The ground is the only image, and it is an owned academy asset.
    expect(srcs).toHaveLength(1);
    for (const bad of ["turret", "structure", "dragon", "baron", "herald", "nexus", "inhibitor"]) {
      expect(srcs.join(" ").toLowerCase()).not.toContain(bad);
    }
  });
});

// ───────────────────────────────────── blast radius

describe("ENV1 — unrelated CompactScenarioBand consumers are unchanged", () => {
  it("an unrelated media-free family keeps the RR1 plate exactly", () => {
    mount(WAVE_ECONOMY_SOURCE, WAVE_VIEW);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("plate");
    expect(plate.className).toContain("grow");
    expect(plate.className).toContain("min-h-16");
    expect(plate.className).toContain("sm:min-h-[4.5rem]");
    expect(screen.getByTestId("scenario-compact-watermark")).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-compact-ground")).toBeNull();
  });

  it("a non-environment round with no scenario source keeps the RR1 plate", () => {
    mount(null, WAVE_VIEW);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("plate");
    expect(plate.className).toContain("grow");
  });

  it("the component's own default is the plate, so no caller can drift", () => {
    // The prop is optional. Any future caller that forgets it gets RR1.
    render(<CompactScenarioBand category="items" />);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.getAttribute("data-compact-density")).toBe("plate");
    expect(plate.className).toContain("grow");
  });

  it("the plate still receives ONLY the category, so it stays spoiler-safe", () => {
    // The density is resolved OUTSIDE the plate, from the family key. The
    // plate itself gained no access to the premise, the prompt or the answer.
    mount(TURRET_SOURCE);
    const plate = screen.getByTestId("scenario-compact");
    expect(plate.textContent).not.toContain("11");
    expect(plate.textContent).not.toContain("turrets does each team");
  });
});

// ───────────────────────────────────── it retires itself

describe("ENV1 — the fallback is interim by construction", () => {
  it("an environment row WITH a real subject never reaches the fallback", () => {
    // The moment the backend art workstream emits `assets.subject`, the row
    // resolves to `cinematic` and takes EnvironmentScenarioCard through the
    // shared composition. No frontend mapping, no later redesign.
    const withArt: QuizQuestion = {
      ...TURRET_SOURCE,
      metadata: {
        assets: {
          subject: {
            type: "objective",
            id: "turret_outer",
            name: "Outer Turret",
            icon: "assets/structures/turret_outer.png",
          },
        },
        presentation: { role: "context", timing: "question", spoiler: false },
      } as QuizQuestion["metadata"],
    };
    expect(resolveBandProfile(withArt, "band", null)).toBe("cinematic");
    mount(withArt);
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
    expect(screen.queryByTestId("scenario-compact-ground")).toBeNull();
  });

  it("the minion family, which HAS art, is untouched by this fallback", () => {
    const minion: QuizQuestion = {
      id: "q-minion",
      question_key: "environment_mechanic:minion_base_stats:ad_start:caster",
      category: "Minion Waves",
      question_text: "How much attack damage does a caster minion start with?",
      format: "multiple_choice",
      choices: ["11", "180", "19.5", "39"],
      metadata: {
        assets: {
          subject: { type: "minion", id: "caster", name: "Caster Minion", icon: "assets/minions/caster.png" },
        },
        presentation: { role: "context", timing: "question", spoiler: false },
      } as QuizQuestion["metadata"],
    };
    // It shares the context PREFIX, which is exactly why this matters: the
    // density rule must never be consulted for a row that has a picture.
    expect(resolveCompactDensity(minion.category)).toBe("context");
    expect(resolveBandProfile(minion, "band", null)).toBe("cinematic");
    mount(minion);
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
  });
});

// ───────────────────────────────────── answer grid

describe("ENV1 — no answer-grid change", () => {
  it("leaves the answer options untouched at both densities", () => {
    const { unmount } = mount(TURRET_SOURCE);
    const context = document.querySelector("[data-quiz-answer-options]");
    const contextColumns = context?.getAttribute("data-columns");
    const contextClass = context?.className;
    unmount();

    mount(WAVE_ECONOMY_SOURCE, WAVE_VIEW);
    const plate = document.querySelector("[data-quiz-answer-options]");
    expect(plate?.getAttribute("data-columns")).toBe(contextColumns);
    expect(plate?.className).toBe(contextClass);
  });
});
