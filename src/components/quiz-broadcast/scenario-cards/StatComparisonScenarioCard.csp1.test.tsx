import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { QuizQuestion } from "@/lib/quiz/api";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";
import { getStatComparisonSubject, selectScenario } from "./classify";
import { ScenarioCard } from "./ScenarioCard";
import rangeArt from "@/assets/champion-card-duel/stats/range.png";
import { STAT_COMPARISON_FALLBACK_ART, statComparisonIconUrl } from "./statComparisonArt";

/** The five stats current canon serves, as the backend renders them (CSP1). */
const SERVED = [
  { metric: "base_armor", metric_label: "Base Armor", name: "Armor", item: 1029 },
  { metric: "base_health", metric_label: "Base Health", name: "Health", item: 1028 },
  { metric: "base_magic_resist", metric_label: "Base MR", name: "Magic Resist", item: 1033 },
  { metric: "movement_speed", metric_label: "Move Speed", name: "Move Speed", item: 1001 },
  { metric: "base_attack_damage", metric_label: "Base AD", name: "Attack Damage", item: 1036 },
  { metric: "attack_range", metric_label: "Attack Range", name: "Attack Range", item: null },
] as const;

const OPTIONS = ["Leona", "Kayn", "Bard", "Sett"];

function question(subject: Record<string, unknown>): QuizQuestion {
  return {
    id: "champion_highest_base_stat:v1:highest:armor#r1",
    category: "Champion Base Stats",
    question_text: "At level 1, which champion has the highest Armor?",
    choices: OPTIONS,
    metadata: {
      assets: { subject },
      presentation: { role: "context", timing: "question", spoiler: false },
    },
  } as unknown as QuizQuestion;
}

const stat = (s: (typeof SERVED)[number]) => ({
  type: "stat", metric: s.metric, metric_label: s.metric_label,
  badge: "Stat Comparison", level: 1,
});

describe("CSP1 stat comparison premise", () => {
  it.each(SERVED)("reads $metric as a neutral stat card at level 1", (s) => {
    const parsed = getStatComparisonSubject(question(stat(s)));
    expect(parsed).toMatchObject({ metric: s.metric, statName: s.name, level: 1 });
    if (s.item === null) expect(parsed?.icon).toBe(rangeArt);
    else expect(parsed?.icon).toMatch(new RegExp(`/assets/items/${s.item}\\.png$`));
  });

  it("selects the stat card pre-reveal and keeps it through the reveal", () => {
    const q = question(stat(SERVED[0]));
    for (const correct of [null, ...OPTIONS]) {
      const sel = selectScenario(q, correct !== null, correct);
      expect(sel.card).toBe("stat_comparison");
    }
    expect(resolveBandProfile(q, "band", null)).toBe("cinematic");
  });

  it("never depends on, or names, a champion", () => {
    const sel = JSON.stringify(selectScenario(question(stat(SERVED[0])), false, null));
    for (const o of OPTIONS) expect(sel).not.toContain(o);
  });

  it.each([
    { level: 0 }, { level: 19 }, { level: 1.5 }, { level: "1" }, { metric_label: "" }, { metric: "" },
  ])("fails closed on a malformed subject %o", (bad) => {
    const q = question({ ...stat(SERVED[0]), ...bad });
    expect(getStatComparisonSubject(q)).toBeNull();
    expect(selectScenario(q, false, null).card).not.toBe("stat_comparison");
  });

  it("renders the stat, the level and mnemonic art", () => {
    const { container, getByText } = render(
      <ScenarioCard question={question(stat(SERVED[0]))} revealActive={false} correctAnswer={null} />,
    );
    expect(getByText("Armor")).toBeTruthy();
    expect(getByText("Level 1")).toBeTruthy();
    expect(container.querySelector("img[data-subject-hero-icon]")?.getAttribute("src"))
      .toBe(statComparisonIconUrl("base_armor"));
    expect(container.textContent).not.toContain("?");
  });

  it("draws Attack Range with the existing range stat art", () => {
    const { container } = render(
      <ScenarioCard question={question(stat(SERVED[5]))} revealActive={false} correctAnswer={null} />,
    );
    expect(container.querySelector("img[data-subject-hero-icon]")?.getAttribute("src")).toBe(rangeArt);
    expect(container.querySelector("svg[data-stat-comparison-glyph]")).toBeNull();
  });

  it("falls back to the existing neutral scale art when the image fails", () => {
    const { container } = render(
      <ScenarioCard question={question(stat(SERVED[0]))} revealActive={false} correctAnswer={null} />,
    );
    fireEvent.error(container.querySelector("img[data-subject-hero-icon]")!);
    expect(container.querySelector("img[data-stat-comparison-fallback]")?.getAttribute("src"))
      .toBe(STAT_COMPARISON_FALLBACK_ART);
    expect(container.textContent).not.toContain("?");
  });
});
