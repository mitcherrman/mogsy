/**
 * Mastery Journey — champion ability icons on the cooldown / cost recall and
 * ability-comparison questions. Display only: the served sentence, options and
 * grading are untouched; an ability without stored art gets no icon.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { MasterySliceChallengeView } from "@/lib/ranked-public/contracts";
import type { JourneyChildContext } from "@/lib/journey/adapter";
import { getAbilityIconUrl } from "@/lib/combat-lab/abilityIcons";
import { CHAMPION_ABILITY_ICON_FILES } from "@/data/championAbilityIcons";
import { journeyQuestionFor, promptSubjectsFor } from "./JourneyStageQuestion";
import { JourneyQuestionText } from "./JourneyQuestionText";

const journey = {} as JourneyChildContext;
const base = { challengeIndex: 0, answerType: "single_choice" as const, comparisonSemantics: null, promptSemantics: null };

const recall = (over: Record<string, unknown>, template = "ability_cooldown_at_rank"): MasterySliceChallengeView => ({
  ...base, interactionKind: "atomic_recall", questionFamily: "ability_cooldown", prompt: "",
  answerOptions: ["5", "6", "7", "8"],
  promptSemantics: { template, champion_display: "Ahri", metric: "cooldown", subject_ref: "Q",
    ability_name: "Orb of Deception", context: { ability_rank: 3, champion_level: null, form: null }, ...over },
} as MasterySliceChallengeView);

const compare = (over: Record<string, unknown>): MasterySliceChallengeView => ({
  ...base, interactionKind: "comparison_left_right", questionFamily: "compare_ability_cooldown", prompt: "",
  answerOptions: ["A", "B", "tie"],
  comparisonSemantics: { template: "compare_ability_cooldown", champion_a_display: "Aatrox", champion_b_display: "Akali",
    metric: "cooldown", subject_ref: "W", ability_name_a: "Infernal Chains", ability_name_b: "Twilight Shroud",
    context: { ability_rank: 2, champion_level: null, form: null }, ...over },
} as unknown as MasterySliceChallengeView);

function subjectsOf(c: MasterySliceChallengeView) {
  return promptSubjectsFor(c, journey, journeyQuestionFor(c, journey));
}

describe("Journey ability icons — recall and comparison questions", () => {
  it("cooldown recall: one ability icon on the ability the sentence names", () => {
    const c = recall({});
    const q = journeyQuestionFor(c, journey);
    const subjects = subjectsOf(c);
    expect(subjects).toEqual([{ kind: "ability", text: "Ahri Q (Orb of Deception)", champion: "Ahri", slot: "Q" }]);
    expect(q.sentence).toContain("Ahri Q (Orb of Deception)");
    const { container } = render(<JourneyQuestionText sentence={q.sentence} subjects={subjects} />);
    const img = container.querySelector('[data-icon-kind="ability"] img');
    expect(img?.getAttribute("src")).toBe(getAbilityIconUrl("Ahri", "Q"));
    expect(container.textContent).toBe(q.sentence.replace(/\bRank (\d+) /g, "Rank $1 "));
  });

  it("cost recall and state-aware cooldown recall are covered too", () => {
    expect(subjectsOf(recall({ resource: "mana" }, "ability_cost_at_rank"))).toHaveLength(1);
    expect(subjectsOf(recall({ scenario: [["ability_haste", 20]] }, "ability_cooldown_under_state"))).toHaveLength(1);
    expect(subjectsOf(recall({}, "ability_cooldown_flat"))).toHaveLength(1);
  });

  it("an unnamed slot is matched on the bare label the sentence prints", () => {
    const c = recall({ ability_name: "Q" });
    const [s] = subjectsOf(c);
    expect(s).toMatchObject({ kind: "ability", text: "Ahri Q" });
    expect(journeyQuestionFor(c, journey).sentence).toContain("Ahri Q's cooldown");
  });

  it("ability comparison: both sides get their own icon, in sentence order", () => {
    const c = compare({});
    const subjects = subjectsOf(c);
    expect(subjects.map((s) => s.kind === "ability" && [s.champion, s.slot, s.text])).toEqual([
      ["Aatrox", "W", "Aatrox W (Infernal Chains)"],
      ["Akali", "W", "Akali W (Twilight Shroud)"],
    ]);
    const q = journeyQuestionFor(c, journey);
    const { container } = render(<JourneyQuestionText sentence={q.sentence} subjects={subjects} />);
    expect(container.querySelectorAll('[data-icon-kind="ability"] img')).toHaveLength(2);
    // Answer options are untouched: still the champion names and the tie token.
    expect(q.labels).toEqual(["Aatrox", "Akali", "Tie / Same"]);
  });

  it("a long ability label wraps after its first word; the icon stays with that word", () => {
    const c = recall({ champion_display: "Pantheon", subject_ref: "E", ability_name: "Aegis Assault" });
    const q = journeyQuestionFor(c, journey);
    const { container } = render(<JourneyQuestionText sentence={q.sentence} subjects={subjectsOf(c)} />);
    const subject = container.querySelector("[data-wraps]");
    expect(subject?.querySelector(".journey-q-subject__lead")?.textContent).toBe("Pantheon");
    expect(subject?.querySelector(".journey-q-subject__lead [data-icon-kind='ability']")).not.toBeNull();
    expect(container.textContent).toBe(q.sentence);
  });

  it("champion-stat comparisons and champion-stat recall add no ability icon", () => {
    const stat = compare({ template: "compare_champion_base_stat", subject_ref: "", metric: "base_armor",
      ability_name_a: "", ability_name_b: "" });
    expect(subjectsOf(stat).some((s) => s.kind === "ability")).toBe(false);
    const recallStat = recall({ metric: "base_armor", subject_ref: "", ability_name: "" }, "champion_base_stat");
    expect(subjectsOf(recallStat).some((s) => s.kind === "ability")).toBe(false);
  });

  it("never guesses: a champion with no stored art gets no icon", () => {
    expect(getAbilityIconUrl("Not A Champion", "Q")).toBeNull();
    expect(subjectsOf(recall({ champion_display: "Not A Champion" }))).toEqual([]);
  });

  it("every stored champion resolves Q, W, E and R art for the icons above", () => {
    const missing: string[] = [];
    for (const champion of Object.keys(CHAMPION_ABILITY_ICON_FILES)) {
      for (const slot of ["Q", "W", "E", "R"] as const) {
        if (!getAbilityIconUrl(champion, slot)) missing.push(`${champion} ${slot}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
