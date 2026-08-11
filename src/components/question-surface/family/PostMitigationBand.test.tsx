/**
 * Post-mitigation damage band (RA7) — rendered through the REAL surface.
 *
 * Every case mounts `InteractiveScenarioSurface` with a verbatim backend
 * payload rather than the band alone, so what is asserted is what a live round
 * renders: the band is reached through the same capability decision, the answer
 * grid is a real sibling, and a fallback is a real fallback.
 *
 * The load-bearing assertions are the negative ones. This band is the only
 * place in Ranked where numbers from the question's own arithmetic appear next
 * to the answers, so "no computed value is on screen" is the property that
 * makes it safe, and it is asserted against the actual correct answers of real
 * accepted candidates.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { InteractiveScenarioSurface } from "../InteractiveScenarioSurface";
import {
  LEGACY_DAMAGE_SCENARIO,
  MAGIC_DAMAGE_Q,
  MAGIC_DAMAGE_SCENARIO,
  PASSIVE_DAMAGE_Q,
  PASSIVE_DAMAGE_SCENARIO,
  PHYSICAL_DAMAGE_Q,
  PHYSICAL_DAMAGE_SCENARIO,
} from "@/lib/question-surface/familyLayoutFixtures";
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
  // The cinematic fallback card resolves champion art through react-query, so
  // the provider is present in every case — a fallback must be exercised for
  // real, not asserted around.
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

const band = () => screen.getByTestId("family-band-combat");
const summary = () => screen.getByTestId("family-band-summary").textContent ?? "";

describe("post-mitigation band — physical", () => {
  it("replaces the cinematic subject card with the family band", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    expect(band()).toBeInTheDocument();
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    expect(screen.queryByTestId("scenario-compact")).toBeNull();
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("family");
  });

  it("names attacker and target as words, not only as positions", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    expect(band()).toHaveTextContent("Attacker");
    expect(band()).toHaveTextContent("Caitlyn");
    expect(band()).toHaveTextContent("Target");
    expect(band()).toHaveTextContent("Ahri");
  });

  it("associates the ability with the attacker's side", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const attackerSide = screen.getByText("Attacker").closest("div")!.parentElement!;
    expect(attackerSide).toHaveTextContent("Piltover Peacemaker");
    expect(attackerSide).not.toHaveTextContent("Ahri");
  });

  it("states the damage type and the raw damage", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const tablet = screen.getByTestId("fact-raw-damage");
    expect(tablet).toHaveTextContent("Raw Physical");
    expect(tablet).toHaveTextContent("600");
  });

  it("states the armor transition explicitly, before and after", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const tablet = screen.getByTestId("fact-resist");
    expect(tablet).toHaveTextContent("Armor");
    expect(tablet.textContent).toContain("60");
    expect(tablet.textContent).toContain("100");
    expect(tablet.textContent).toContain("→");
  });

  it("shows the target's defensive purchase beside the target", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const targetSide = screen.getByText("Target").closest("div")!.parentElement!;
    expect(targetSide).toHaveTextContent("Chain Vest");
  });
});

describe("post-mitigation band — magic", () => {
  it("labels the defensive stat as magic resist for a magic hit", () => {
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    expect(screen.getByTestId("fact-resist")).toHaveTextContent("Magic Resist");
    expect(screen.getByTestId("fact-raw-damage")).toHaveTextContent("Raw Magic");
  });

  it("shows a single resistance with no transition when none is stated", () => {
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    const tablet = screen.getByTestId("fact-resist");
    expect(tablet.textContent).toContain("90");
    expect(tablet.textContent).not.toContain("→");
  });

  it("renders without an ability when the premise states a passive", () => {
    mount(PASSIVE_DAMAGE_Q, PASSIVE_DAMAGE_SCENARIO);
    expect(band()).toHaveTextContent("Jhin");
    expect(band()).toHaveTextContent("Ahri");
    expect(band()).toHaveTextContent("21");
  });
});

describe("post-mitigation band — no answer leakage", () => {
  /**
   * `stated` is the premise quantity of each case that happens to coincide with
   * an option. It is not a loophole: mitigation always REDUCES damage, so the
   * raw damage can never be the correct answer, and the prompt states it to the
   * same reader regardless. Four of the 52 checked-in damage candidates have
   * this coincidence, always on a distractor — which is why the assertion below
   * is "never the correct answer" rather than "never an option".
   */
  const CASES = [
    {
      name: "physical after purchase", q: PHYSICAL_DAMAGE_Q,
      s: PHYSICAL_DAMAGE_SCENARIO, correct: "75", stated: [] as string[],
    },
    {
      name: "magic vs mr", q: MAGIC_DAMAGE_Q, s: MAGIC_DAMAGE_SCENARIO,
      correct: "263", stated: ["500"],
    },
    {
      name: "passive", q: PASSIVE_DAMAGE_Q, s: PASSIVE_DAMAGE_SCENARIO,
      correct: "64", stated: [],
    },
  ];

  it.each(CASES)("$name: the correct answer never appears", ({ q, s, correct }) => {
    mount(q, s);
    expect(q.options.map((o) => o.label)).toContain(correct);
    expect(band().textContent ?? "").not.toContain(correct);
  });

  it.each(CASES)(
    "$name: any option the band shows is a quantity the prompt states",
    ({ q, s, stated }) => {
      mount(q, s);
      const text = band().textContent ?? "";
      const shown = q.options.map((o) => o.label).filter((l) => text.includes(l));
      expect(shown).toEqual(stated);
      for (const label of shown) expect(q.prompt).toContain(label);
    },
  );

  it("shows no computed post-mitigation value for the plain-mitigation case", () => {
    // 500 raw vs 90 MR resolves to 263; every distractor is likewise a result.
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    const text = band().textContent ?? "";
    for (const computed of ["263", "410", "180"]) {
      expect(text).not.toContain(computed);
    }
  });

  it("shows neither side of the after-purchase difference nor the difference", () => {
    // damage_before 375, damage_after 300, answer 75, item bonus armor 40.
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const text = band().textContent ?? "";
    for (const hidden of ["375", "300", "75", "40"]) {
      expect(text).not.toContain(hidden);
    }
  });

  it("renders identically whether or not a reveal has arrived", () => {
    const { container: before } = mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const beforeHtml = before.querySelector("[data-testid=family-band-combat]")!.innerHTML;
    const { container: after } = mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO, {
      selectedOptionId: "2",
      reveal: { revealed: true, isCorrect: true, correctOptionId: "2" },
    });
    const afterHtml = after
      .querySelectorAll("[data-testid=family-band-combat]")[0]!.innerHTML;
    expect(afterHtml).toBe(beforeHtml);
  });
});

describe("post-mitigation band — geometry and fallback", () => {
  it("does not change when an option is selected", () => {
    const { container } = mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const unselected = container
      .querySelector("[data-testid=family-band-combat]")!.innerHTML;
    const { container: selected } = mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO, {
      selectedOptionId: "1",
    });
    expect(
      selected.querySelectorAll("[data-testid=family-band-combat]")[0]!.innerHTML,
    ).toBe(unselected);
  });

  it("reserves no fixed cinematic box, so it cannot introduce a scrollbar", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    expect(screen.queryByTestId("scenario-hero")).toBeNull();
    // Absolute sizing only: no cqmin, no aspect-ratio container.
    expect(band().className).not.toContain("aspect");
    expect(band().getAttribute("style")).toBeNull();
  });

  it("wraps rather than overflowing horizontally", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const rows = band().querySelectorAll(".flex-wrap");
    expect(rows.length).toBeGreaterThan(0);
    expect(band().className).toContain("overflow-hidden");
  });

  it("stacks the two sides below the sm breakpoint so names are not clipped", () => {
    // jsdom cannot evaluate the media query, so the responsive CONTRACT is
    // asserted as classes: full width by default, sharing the line from `sm`.
    // Verified visually at 375px, where both names render untruncated.
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const side = screen.getByText("Attacker").closest("div")!.parentElement!;
    expect(side.className).toContain("w-full");
    expect(side.className).toContain("sm:w-auto");
    expect(side.className).toContain("sm:flex-1");
    // The arrow points down while stacked and across once they share the line.
    expect(screen.getByTestId("combat-arrow").className).toContain("rotate-90");
    expect(screen.getByTestId("combat-arrow").className).toContain("sm:rotate-0");
  });

  it("falls back to the shipped cinematic card for a pre-RA7 payload", () => {
    mount(MAGIC_DAMAGE_Q, LEGACY_DAMAGE_SCENARIO);
    expect(screen.queryByTestId("family-band-combat")).toBeNull();
    expect(screen.getByTestId("scenario-hero")).toBeInTheDocument();
    expect(screen.getByTestId("scenario-surface").dataset.band).toBe("cinematic");
  });

  it("leaves the numeric answer tablets exactly as they were", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const grid = document.querySelector("[data-quiz-answer-options]")!;
    expect(grid.getAttribute("data-columns")).toBe("wide-2");
    for (const option of PHYSICAL_DAMAGE_Q.options) {
      expect(screen.getByText(option.label)).toBeInTheDocument();
    }
    expect(document.querySelectorAll("[data-quiz-answer-options] img")).toHaveLength(0);
  });
});

describe("post-mitigation band — accessibility", () => {
  it("states the whole premise as one screen-reader sentence", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    const text = summary();
    expect(text).toContain("Attacker Caitlyn");
    expect(text).toContain("target Ahri");
    expect(text).toContain("Piltover Peacemaker");
    expect(text).toContain("600 raw physical damage");
    expect(text).toContain("armor 60, rising to 100");
    expect(text).toContain("Chain Vest");
  });

  it("states a single resistance without inventing a transition", () => {
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    expect(summary()).toContain("magic resist 90.");
    expect(summary()).not.toContain("rising to");
  });

  it("names the band so it is reachable as a landmark", () => {
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    expect(screen.getByLabelText("Combat scenario")).toBeInTheDocument();
  });

  it("carries no answer in the accessible summary either", () => {
    mount(MAGIC_DAMAGE_Q, MAGIC_DAMAGE_SCENARIO);
    expect(summary()).not.toContain("263");   // the correct answer
    for (const option of MAGIC_DAMAGE_Q.options) {
      if (option.label === "500") continue;   // the stated raw damage
      expect(summary()).not.toContain(option.label);
    }
  });

  it("does not repeat an entity name in image alt text", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    for (const img of Array.from(band().querySelectorAll("img"))) {
      expect(img.getAttribute("alt")).toBe("");
    }
  });

  it("uses no animation, so reduced-motion users see the same thing", () => {
    mount(PHYSICAL_DAMAGE_Q, PHYSICAL_DAMAGE_SCENARIO);
    expect(band().innerHTML).not.toContain("animate-");
    expect(band().innerHTML).not.toContain("transition");
  });
});
