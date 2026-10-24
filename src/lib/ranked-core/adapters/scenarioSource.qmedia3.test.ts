/**
 * QMEDIA3 — the Varus Q card the owner saw empty.
 *
 * `ability_cooldown_rank:Varus:Q:r2` reached Daily with NO presentation (the
 * family was undeclared in the backend contract), so `selectScenario` chose
 * "empty" and the arena drew its reserved media region as a bare category
 * strip. The fixtures below are the VERBATIM blobs the backend renderer now
 * emits for that row and for an `ability_cooldown_compare` row; this proves
 * the shipped pipeline draws both, with no frontend media change.
 */
import { describe, expect, it } from "vitest";
import { scenarioSourceFromPublicQuestion } from "./scenarioSource";
import type { PublicQuestionSource } from "./adaptToViews";
import { selectScenario } from "@/components/quiz-broadcast/scenario-cards/classify";
import { resolveBandProfile } from "@/lib/question-surface/bandProfile";

const CONTEXT_FLAGS = { role: "context", timing: "question", spoiler: false } as const;

/** Backend 126394 after QMEDIA3 (`presentation_for_question`). */
const VARUS_Q = {
  assets: {
    subject: {
      type: "combat_cooldown", champion: "Varus", ability_name: "Piercing Arrow",
      champion_icon: "assets/champions/Varus/icon.png",
      ability_icon: "assets/champions/Varus/Q_VarusQ.png", item_icons: [],
      ability_slot: "Q", champion_splash: "assets/champions/Varus/splash/0_default.jpg",
      champion_loading: "assets/champions/Varus/loading/0_default.jpg", ability_rank: 2,
    },
  },
  presentation: CONTEXT_FLAGS,
};

/** Backend 138338 after QMEDIA3. */
const ULT_COMPARE = {
  assets: {
    subject: {
      type: "matchup", champion_a: "Aatrox", champion_b: "Ahri", badge: "Matchup",
      champion_a_splash: "assets/champions/Aatrox/splash/0_default.jpg",
      champion_a_icon: "assets/champions/Aatrox/icon.png",
      champion_b_splash: "assets/champions/Ahri/splash/0_default.jpg",
      champion_b_icon: "assets/champions/Ahri/icon.png",
      ability_slot: "R", ability_name: "Ability R", metric_label: "Cooldown", ability_rank: 1,
    },
  },
  presentation: CONTEXT_FLAGS,
};

const source = (presentation: Record<string, unknown> | undefined, options: string[]) => {
  const q: PublicQuestionSource = {
    questionId: "qq-126394#r1",
    prompt: "What is the rank 2 cooldown of Varus Q - Piercing Arrow?",
    options, category: "Champion Ability Cooldowns", presentation,
  };
  return scenarioSourceFromPublicQuestion(q);
};

const SECONDS = ["14 seconds", "18 seconds", "16 seconds", "15 seconds"];

describe("QMEDIA3 ability premise media", () => {
  it("before: a round with no presentation is the empty, compact band", () => {
    const src = source(undefined, SECONDS);
    const card = src ? selectScenario(src, false, null).card : "empty";
    expect(card).toBe("empty");
    expect(resolveBandProfile(src, "hero", null)).toBe("compact");
  });

  it("after: Varus Q draws the champion, the Q icon and the stated rank", () => {
    const src = source(VARUS_Q, SECONDS)!;
    const selection = selectScenario(src, false, null);
    if (selection.card !== "combat_calculation") throw new Error(`card ${selection.card}`);
    expect(selection.combat.champion).toBe("Varus");
    expect(selection.combat.abilityName).toBe("Piercing Arrow");
    expect(selection.combat.abilityIcon).toContain("assets/champions/Varus/Q_VarusQ.png");
    expect(selection.combat.abilitySlot).toBe("Q");
    expect(selection.combat.abilityRank).toBe(2);
    expect(resolveBandProfile(src, "hero", null)).toBe("cinematic");
  });

  it("after: an ultimate comparison draws both champions as a matchup", () => {
    const src = source(ULT_COMPARE, ["Aatrox R", "Ahri R"])!;
    const selection = selectScenario(src, false, null);
    if (selection.card !== "matchup") throw new Error(`card ${selection.card}`);
    expect([selection.matchup.championA, selection.matchup.championB]).toEqual(["Aatrox", "Ahri"]);
    expect(selection.matchup.abilityIcon).toBeUndefined();
  });
});
