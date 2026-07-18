import { describe, expect, it } from "vitest";
import { adaptPublicRound } from "@/pages/dev/ranked-duel-prototype/transport-adapter/adaptPublicRound";
import { adaptPrivatePlayer } from "@/pages/dev/ranked-duel-prototype/transport-adapter/adaptPrivatePlayer";
import {
  FIXTURE_OWNER_ID,
  getPrivateEnvelopeScenario,
  getPublicEnvelopeScenario,
  PUBLIC_ENVELOPE_SCENARIOS,
} from "@/pages/dev/ranked-duel-prototype/transport-adapter/rankedDuelEnvelopeFixtures";
import {
  abilityViewsFromPrivatePlayer,
  combatantViewsFromPublicRound,
  questionViewFromPublicQuestion,
  RankedViewAdapterError,
} from "./adaptToViews";

const IDS = { p1PlayerId: "alice", p2PlayerId: "bob" };

const publicRound = (key: string) => {
  const scenario = getPublicEnvelopeScenario(key);
  if (!scenario) throw new Error(`missing public scenario ${key}`);
  return adaptPublicRound(scenario.envelope, IDS);
};

const privatePlayer = (key: string) => {
  const scenario = getPrivateEnvelopeScenario(key);
  if (!scenario) throw new Error(`missing private scenario ${key}`);
  return adaptPrivatePlayer(scenario.envelope, FIXTURE_OWNER_ID);
};

describe("combatantViewsFromPublicRound", () => {
  it("associates viewer/opponent by stable player id, not array position", () => {
    const round = publicRound("public-active-question");
    // Viewer is bob (array position 2) — bob must land on the "player" side.
    const views = combatantViewsFromPublicRound(round, { viewerPlayerId: "bob" });
    expect(views.player.playerId).toBe("bob");
    expect(views.player.side).toBe("player");
    expect(views.player.classId).toBe("mage");
    expect(views.opponent.playerId).toBe("alice");
    expect(views.opponent.side).toBe("opponent");
  });

  it("rejects a viewer id that is not in the match", () => {
    const round = publicRound("public-active-question");
    expect(() =>
      combatantViewsFromPublicRound(round, { viewerPlayerId: "mallory" }),
    ).toThrow(RankedViewAdapterError);
  });

  it("passes HP/XP/level through without computing anything", () => {
    const round = publicRound("public-progression-pending");
    const views = combatantViewsFromPublicRound(round, { viewerPlayerId: "alice" });
    expect(views.player.hp).toBe(round.players.p1.hp);
    expect(views.player.xp).toBe(40);
    expect(views.player.level).toBe(2);
  });

  it("leaves maxHp explicitly null when not supplied (never invented)", () => {
    const round = publicRound("public-active-question");
    const views = combatantViewsFromPublicRound(round, { viewerPlayerId: "alice" });
    expect(views.player.maxHp).toBeNull();
    expect(views.opponent.maxHp).toBeNull();
  });

  it("uses supplied maxHp and identities per player id", () => {
    const round = publicRound("public-active-question");
    const views = combatantViewsFromPublicRound(round, {
      viewerPlayerId: "alice",
      identities: { alice: { name: "Alice", tag: "Tank" } },
      maxHpByPlayerId: { alice: 170 },
    });
    expect(views.player.maxHp).toBe(170);
    expect(views.player.name).toBe("Alice");
    expect(views.player.tag).toBe("Tank");
    // Opponent had no supplied identity/max: falls back to id + null.
    expect(views.opponent.name).toBe("bob");
    expect(views.opponent.maxHp).toBeNull();
  });

  it("leaves level thresholds null unless the controller supplies them", () => {
    const round = publicRound("public-active-question");
    const bare = combatantViewsFromPublicRound(round, { viewerPlayerId: "alice" });
    expect(bare.player.nextLevelThreshold).toBeNull();
    expect(bare.player.currentLevelThreshold).toBeNull();
    const supplied = combatantViewsFromPublicRound(round, {
      viewerPlayerId: "alice",
      levelBoundsByPlayerId: { alice: { current: 0, next: 30 } },
    });
    expect(supplied.player.nextLevelThreshold).toBe(30);
    expect(supplied.player.currentLevelThreshold).toBe(0);
  });

  it("never carries opponent answer or ability content, for any scenario", () => {
    for (const scenario of PUBLIC_ENVELOPE_SCENARIOS) {
      const round = adaptPublicRound(scenario.envelope, IDS);
      const views = combatantViewsFromPublicRound(round, { viewerPlayerId: "alice" });
      const serialized = JSON.stringify(views);
      // Neutral flags only: no ability ids, no answer indexes/labels.
      expect(serialized).not.toMatch(/tank\.|mage\.|marksman\./);
      expect(serialized).not.toMatch(/correct/i);
      expect(serialized).not.toMatch(/answer_index|selected_ability|answerIndex|selectedAbility/);
      expect(typeof views.opponent.hasSubmitted).toBe("boolean");
    }
  });
});

describe("abilityViewsFromPrivatePlayer", () => {
  it("represents unlocked, locked, exhausted, and null-charge states safely", () => {
    const priv = privatePlayer("private-idle");
    const views = abilityViewsFromPrivatePlayer(priv);
    const fortify = views.find((v) => v.id === "tank.fortify");
    const brace = views.find((v) => v.id === "tank.brace");
    expect(fortify).toMatchObject({
      unlocked: true,
      remainingCharges: 2,
      exhausted: false,
      locked: false,
      selected: false,
    });
    expect(fortify?.name).toBe("Fortify");
    expect(brace).toMatchObject({ unlocked: false, remainingCharges: null });
    expect(brace?.unavailableReason).toMatch(/locked/i);
  });

  it("marks the armed ability from the private projection", () => {
    const priv = privatePlayer("private-ability-selected");
    const views = abilityViewsFromPrivatePlayer(priv);
    expect(views.find((v) => v.id === "tank.fortify")?.selected).toBe(true);
  });

  it("an explicit selectedAbilityId of null overrides the projection", () => {
    const priv = privatePlayer("private-ability-selected");
    const views = abilityViewsFromPrivatePlayer(priv, { selectedAbilityId: null });
    expect(views.every((v) => !v.selected)).toBe(true);
  });

  it("locked selection window locks every ability with a reason", () => {
    const priv = privatePlayer("private-locked-with-ability");
    const views = abilityViewsFromPrivatePlayer(priv);
    for (const view of views.filter((v) => v.unlocked)) {
      expect(view.locked).toBe(true);
      expect(view.unavailableReason).toMatch(/locked/i);
    }
  });

  it("zero charges = exhausted with a reason; charges are pass-through", () => {
    const priv = privatePlayer("private-idle");
    const exhaustedPriv = {
      ...priv,
      remainingCharges: { ...priv.remainingCharges, "tank.fortify": 0 },
    };
    const fortify = abilityViewsFromPrivatePlayer(exhaustedPriv).find(
      (v) => v.id === "tank.fortify",
    );
    expect(fortify?.exhausted).toBe(true);
    expect(fortify?.remainingCharges).toBe(0);
    expect(fortify?.unavailableReason).toMatch(/charges/i);
  });

  it("covers all three unlocked abilities at max level with live charges", () => {
    const priv = privatePlayer("private-max-level");
    const views = abilityViewsFromPrivatePlayer(priv);
    expect(views.filter((v) => v.unlocked)).toHaveLength(3);
    expect(views.find((v) => v.id === "tank.barrier")?.remainingCharges).toBe(1);
  });
});

describe("questionViewFromPublicQuestion", () => {
  it("maps options to stable index-based ids and carries no correctness", () => {
    const view = questionViewFromPublicQuestion({
      questionId: "q-1",
      prompt: "Which ability is Tank's starter?",
      options: ["Fortify", "Brace", "Barrier"],
      category: "abilities",
    });
    expect(view.options).toEqual([
      { id: "0", index: 0, label: "Fortify" },
      { id: "1", index: 1, label: "Brace" },
      { id: "2", index: 2, label: "Barrier" },
    ]);
    expect(JSON.stringify(view)).not.toMatch(/correct/i);
  });
});
