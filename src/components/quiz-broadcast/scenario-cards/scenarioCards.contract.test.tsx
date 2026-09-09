/**
 * RR1 pass 1 — the scenario-card rendering CONTRACT.
 *
 * Before this file there was no direct test for ANY scenario card. The
 * classifier was covered (`questionMediaEntities.test.tsx`) and the two family
 * bands were covered, but `CombatCalculationScenarioCard`,
 * `ItemAnalysisScenarioCard`, `ChampionScenarioCard` and the
 * `DefaultScenarioCard` fallbacks rendered untested — which is exactly the code
 * the RR1 convergence work has to edit.
 *
 * WHAT THIS FILE IS FOR
 * `CombatCalculationScenarioCard` is the CONTROL GROUP. Every later RR1 pass
 * changes shared primitives, shared CSS or a sibling card, and the question
 * that always has to be answerable is "did the gold standard move?". The
 * assertions below are the answer.
 *
 * THE PAYLOADS ARE NOT HAND-WRITTEN. Each one is read out of
 * `scripts/quiz-screenshots/visual-qa-fixture.json`, whose vq-14/15/16 rows are
 * VERBATIM `ranked_public.presentation_render.presentation_for_question()`
 * output for a real pooled `quiz_questions` row. So a backend presentation
 * change fails here rather than silently degrading the card, and the fixture
 * the screenshot harness photographs is the same payload this file asserts on.
 *
 * Deliberately NOT asserted: pixel output and computed sizes. jsdom has no
 * layout engine, so a `cqmin`/`--sc-fit` regression is invisible here — that is
 * the screenshot harness's job (see the RR1 plan's visual QA matrix). What is
 * held here is STRUCTURE: which card, which fields reach it, and what must
 * never appear before the reveal.
 */
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { QuizQuestion } from "@/lib/quiz/api";
import { selectScenario } from "./classify";
import { ScenarioCard } from "./ScenarioCard";
import { selectFamilyLayout } from "@/lib/question-surface/familyLayout";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";

// ---------------------------------------------------------------- fixtures

type FixtureRow = {
  id: string;
  question_key: string;
  category: string;
  question_text: string;
  choices: string[];
  presentation?: Record<string, unknown>;
};

const FIXTURES = (
  JSON.parse(
    readFileSync(resolve("scripts/quiz-screenshots/visual-qa-fixture.json"), "utf8"),
  ) as { questions: FixtureRow[] }
).questions;

function fixture(id: string): FixtureRow {
  const row = FIXTURES.find((q) => q.id === id);
  if (!row) throw new Error(`fixture ${id} missing`);
  return row;
}

/**
 * The fixture row as the surface receives it. `presentation` IS the
 * Quiz-compatible `metadata` object — the same one-line mapping
 * `scenarioSourceFromPublicQuestion` performs for a live Ranked round — so this
 * is the production shape, not a test shape.
 */
function asScenarioSource(row: FixtureRow): QuizQuestion {
  return {
    id: row.id,
    category: row.category,
    question_text: row.question_text,
    format: "multiple_choice",
    choices: row.choices,
    metadata: row.presentation as QuizQuestion["metadata"],
  };
}

function renderCard(row: FixtureRow, revealActive = false, correctAnswer: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ScenarioCard
        question={asScenarioSource(row)}
        revealActive={revealActive}
        correctAnswer={correctAnswer}
      />
    </QueryClientProvider>,
  );
}

// ================================================ the gold standard (vq-14)

describe("CombatCalculationScenarioCard — the gold standard (vq-14)", () => {
  const row = () => fixture("vq-14");

  it("is the card the classifier selects", () => {
    expect(selectScenario(asScenarioSource(row()), false, null).card).toBe("combat_calculation");
  });

  it("takes the cinematic band and is never diverted to a family band", () => {
    const source = asScenarioSource(row());
    // The precedence that decides this: resolveBandProfile checks
    // selectFamilyLayout FIRST. A payload that grew `assets.entities` would
    // render a compact family band instead, with no other assertion failing.
    expect(selectFamilyLayout(source)).toBeNull();
    expect(resolveBandProfile(source, "band", null)).toBe("cinematic");
  });

  it("draws the champion splash as full-bleed art with the head-safe crop", () => {
    renderCard(row());
    // The single structural thing that separates this card from a dark box:
    // ItemAnalysisScenarioCard passes backgroundUrl={null} and gets a slate
    // gradient instead.
    const splash = screen.getByRole("img", { name: "Aatrox" });
    expect(splash.getAttribute("src")).toContain("splash/0_default.jpg");
    // Tuned on ten splashes; 50% centred the crop on the champion's waist in
    // the 4:1 Ranked band.
    expect(splash).toHaveStyle({ objectPosition: "60% 12%" });
  });

  it("renders the four-slot information stack", () => {
    renderCard(row());
    expect(screen.getByText("Combat Calculation")).toBeInTheDocument(); // ScenarioBadge
    expect(screen.getByText("Aatrox")).toBeInTheDocument(); // ScenarioTitle
    expect(screen.getByText("Umbral Dash")).toBeInTheDocument(); // ScenarioSubject
    expect(screen.getByText("E")).toBeInTheDocument(); // slot badge
    expect(screen.getByText("Loadout · Items")).toBeInTheDocument(); // ScenarioSection
    expect(screen.getByText("Eclipse")).toBeInTheDocument();
  });

  it("shows the stated game state as condition chips", () => {
    renderCard(row());
    // Level and Rank are the only two chips any production family emits, and
    // they are what makes the premise readable before the prompt is parsed.
    expect(screen.getByText("Level")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders the ability icon beside the ability name", () => {
    renderCard(row());
    expect(screen.getByRole("img", { name: "Umbral Dash" }).getAttribute("src"))
      .toContain("E_AatroxE.png");
  });

  it("discloses no answer before the reveal", () => {
    const { container } = renderCard(row());
    // "6.1 seconds" is the correct choice. The card states the premise only.
    expect(container.textContent).not.toContain("6.1");
    for (const wrong of ["4.3", "7 seconds"]) {
      expect(container.textContent).not.toContain(wrong);
    }
  });

  it("keeps its band profile identical across the reveal", () => {
    const source = asScenarioSource(row());
    // Reveal-invariance is load-bearing: a band that resized on settlement
    // would move the answer tablets the player is tracking.
    expect(resolveBandProfile(source, "band", null)).toBe(
      resolveBandProfile(source, "band", selectFamilyLayout(source)),
    );
    expect(selectScenario(source, true, "6.1 seconds").card).toBe("combat_calculation");
  });
});

// ============================================ Item Analysis, thin (vq-15)

describe("ItemAnalysisScenarioCard — the real thin Ranked payload (vq-15)", () => {
  const row = () => fixture("vq-15");

  it("is the card the classifier selects", () => {
    expect(selectScenario(asScenarioSource(row()), false, null).card).toBe("item_analysis");
    expect(resolveBandProfile(asScenarioSource(row()), "band", null)).toBe("cinematic");
  });

  it("renders the item identity it does have", () => {
    renderCard(row());
    expect(screen.getByText("Abyssal Mask")).toBeInTheDocument();
  });

  it("renders NO recipe tree and NO dossier sections on this payload", () => {
    // The RR1 baseline. Production sends {type,id,name,icon} only, so
    // known_components / cost / stats / parent_item_name are all absent and
    // every section the card can draw is empty. Pinned so the next pass can
    // prove it changed something.
    renderCard(row());
    expect(screen.queryByText("Item Information")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    expect(screen.queryByText("Builds Into")).not.toBeInTheDocument();
  });

  it("discloses no answer before the reveal", () => {
    const { container } = renderCard(row());
    expect(container.textContent).not.toContain("2450");
  });
});

// ==================================== champion card + compact default paths

describe("ChampionScenarioCard and the default fallbacks", () => {
  it("selects the champion card for a bare champion subject", () => {
    const q: QuizQuestion = {
      id: "champ",
      category: "Champion Ability Cooldowns",
      question_text: "What is the cooldown of Aatrox E at rank 5?",
      format: "multiple_choice",
      choices: ["1", "2", "3", "4"],
      metadata: { champion_name: "Aatrox" } as QuizQuestion["metadata"],
    };
    // The vq-05 shape: no `assets` block, so the legacy classifier runs and
    // resolves a champion — which is why vq-05 is NOT a gold-standard fixture
    // however cinematic its band profile is.
    expect(selectScenario(q, false, null).card).toBe("champion_profile");
  });

  it("a denied premise (vq-16) claims no cinematic media at all", () => {
    const row = fixture("vq-16");
    expect(row.presentation).toBeUndefined();
    // No source at all is the honest state for a family whose contract
    // declares premise_denied_reason. The surface must take the compact band.
    expect(resolveBandProfile(null, "band", null)).toBe("compact");
    expect(selectFamilyLayout(null)).toBeNull();
  });

  it("a source that classifies to nothing also takes the compact band", () => {
    const empty: QuizQuestion = {
      id: "empty",
      category: "Objective Timers",
      question_text: "What time does Baron Nashor spawn?",
      format: "multiple_choice",
      choices: ["20:00", "14:00", "15:00", "25:00"],
      metadata: {} as QuizQuestion["metadata"],
    };
    expect(selectScenario(empty, false, null).card).toBe("empty");
    expect(resolveBandProfile(empty, "band", null)).toBe("compact");
  });

  it("renders the neutral placeholder for a spoiler-hidden subject", () => {
    // The pre-reveal state of an identification question: the subject IS the
    // answer, so the card must show a placeholder rather than the art.
    const spoiler: QuizQuestion = {
      id: "spoiler",
      category: "items",
      question_text: "Which item is this?",
      format: "multiple_choice",
      choices: ["Abyssal Mask", "Sunfire Aegis", "Thornmail", "Randuin's Omen"],
      metadata: {
        assets: { subject: { type: "item", name: "Abyssal Mask", icon: "assets/items/8020.png" } },
      } as QuizQuestion["metadata"],
    };
    const selection = selectScenario(spoiler, false, "Abyssal Mask");
    expect(selection.card).toBe("placeholder");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ScenarioCard question={spoiler} revealActive={false} correctAnswer="Abyssal Mask" />
      </QueryClientProvider>,
    );
    expect(container.textContent).not.toContain("Abyssal Mask");
  });
});

// ==================================================== the matchup card

describe("MatchupScenarioCard — two champions at balanced weight", () => {
  const MATCHUP: QuizQuestion = {
    id: "m1",
    category: "mastery",
    question_text: "Whose W has the longer cooldown at rank 1?",
    format: "multiple_choice",
    choices: ["Ahri", "Syndra"],
    metadata: {
      assets: {
        subject: {
          type: "matchup",
          champion_a: "Ahri",
          champion_b: "Syndra",
          // Explicit splashes: jsdom cannot fetch the champion manifest, so the
          // name-only path would fall back to the frame's placeholder. A real
          // payload may carry either shape; the fallback is covered below.
          champion_a_splash: "assets/champions/Ahri/splash/0_default.jpg",
          champion_b_splash: "assets/champions/Syndra/splash/0_default.jpg",
          ability_slot: "W",
          ability_name: "Ability W",
          metric_label: "Cooldown",
          ability_rank: 1,
          badge: "Matchup",
        },
      },
      presentation: { role: "context", timing: "question", spoiler: false },
    } as QuizQuestion["metadata"],
  };

  function renderMatchup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <ScenarioCard question={MATCHUP} revealActive={false} correctAnswer={null} />
      </QueryClientProvider>,
    );
  }

  it("is the card the classifier selects, on the cinematic band", () => {
    expect(selectScenario(MATCHUP, false, null).card).toBe("matchup");
    expect(selectFamilyLayout(MATCHUP)).toBeNull();
    expect(resolveBandProfile(MATCHUP, "band", null)).toBe("cinematic");
  });

  it("draws BOTH champions, neither as a decoration of the other", () => {
    renderMatchup();
    // Balanced weight is the whole point of the family: two halves of one
    // background layer, same treatment, same size class.
    const a = screen.getByRole("img", { name: "Ahri" });
    const b = screen.getByRole("img", { name: "Syndra" });
    expect(a.className).toContain("w-1/2");
    expect(b.className).toContain("w-1/2");
    expect(a.className).toBe(b.className);
    // Both names are stated, not just the winner-shaped one.
    expect(screen.getByText("Ahri")).toBeInTheDocument();
    expect(screen.getByText("Syndra")).toBeInTheDocument();
  });

  it("states what is being compared, and the axes it is compared at", () => {
    renderMatchup();
    expect(screen.getByText("Matchup")).toBeInTheDocument();
    expect(screen.getByText("Compare")).toBeInTheDocument();
    expect(screen.getByText("Cooldown")).toBeInTheDocument();
    expect(screen.getByText("Rank")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("never discloses a measured value", () => {
    // The answer to a comparison is which side is higher. The card carries the
    // metric's NAME and no number that could rank the two.
    const { container } = renderMatchup();
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?\s*(s|sec|seconds)\b/);
  });

  it("keeps both halves balanced even when neither splash resolves", () => {
    // The manifest is unavailable here, so both sides take the frame's
    // placeholder. The invariant that matters is that they stay a 50/50 split
    // — a matchup that degrades to one visible champion misstates the premise.
    const noArt: QuizQuestion = {
      ...MATCHUP,
      metadata: {
        assets: {
          subject: { type: "matchup", champion_a: "Ahri", champion_b: "Syndra" },
        },
      } as QuizQuestion["metadata"],
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <ScenarioCard question={noArt} revealActive={false} correctAnswer={null} />
      </QueryClientProvider>,
    );
    const halves = container.querySelectorAll(".w-1\\/2");
    expect(halves).toHaveLength(2);
    expect(screen.getByText("Ahri")).toBeInTheDocument();
    expect(screen.getByText("Syndra")).toBeInTheDocument();
  });

  it("falls through when a side is missing rather than drawing half a matchup", () => {
    const oneSided: QuizQuestion = {
      ...MATCHUP,
      metadata: {
        assets: { subject: { type: "matchup", champion_a: "Ahri" } },
      } as QuizQuestion["metadata"],
    };
    expect(selectScenario(oneSided, false, null).card).not.toBe("matchup");
  });
});
