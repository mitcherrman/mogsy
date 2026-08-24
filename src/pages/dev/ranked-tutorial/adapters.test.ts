import { describe, expect, it } from "vitest";
import {
  abilityViewsFromTutorial,
  combatantViewsFromTutorial,
  permissionsFromTutorial,
  publicRoundFromTutorial,
  resolvedRoundViewFromResult,
  revealedAnswersByPlayerId,
  selectionFromRound,
  settlementsFromTutorial,
  timerViewFromTutorial,
  tutorialRoundNumber,
  TUTORIAL_GOLEM_ID,
  TUTORIAL_MATCH_ID,
  TUTORIAL_PLAYER_ID,
} from "./adapters";
import { initialTutorialState, tutorialReducer } from "./tutorialMachine";
import { TUTORIAL_ROUNDS, XP } from "./fixtures";
import { TutorialEvent, TutorialState } from "./types";

const reduceAll = (events: TutorialEvent[], from?: TutorialState) =>
  events.reduce(tutorialReducer, from ?? initialTutorialState());

const toRoundA = () => reduceAll([{ type: "CONTINUE" }]);

const lockedRoundA = () =>
  tutorialReducer(toRoundA(), { type: "SUBMIT_ANSWER", answerIndex: 1 });

const revealedRoundA = () => reduceAll([{ type: "CONTINUE" }], lockedRoundA());

describe("combatant views", () => {
  it("projects both combatants with known max HP and thresholds", () => {
    const { player, opponent } = combatantViewsFromTutorial(initialTutorialState());
    expect(player.playerId).toBe(TUTORIAL_PLAYER_ID);
    expect(player.hp).toBe(170);
    expect(player.maxHp).toBe(170);
    expect(player.level).toBe(1);
    expect(player.currentLevelThreshold).toBe(0);
    expect(player.nextLevelThreshold).toBe(30);
    expect(opponent.playerId).toBe(TUTORIAL_GOLEM_ID);
    expect(opponent.side).toBe("opponent");
  });

  it("exposes only neutral opponent status pre-reveal", () => {
    const locked = lockedRoundA();
    const { opponent } = combatantViewsFromTutorial(locked);
    expect(opponent.hasSubmitted).toBe(true);
    expect(opponent.hasAbilitySelected).toBeNull(); // never content, never armed-ness
    const serialized = JSON.stringify(combatantViewsFromTutorial(locked));
    expect(serialized).not.toMatch(/opponentAnswer|Correct|Damage/);
  });
});

describe("the arena's question surface input", () => {
  it("projects a quiz.v1 segment, so the CANONICAL renderer resolves", () => {
    const pub = publicRoundFromTutorial(toRoundA());
    expect(pub.segment.moduleId).toBe("quiz");
    expect(pub.segment.moduleVersion).toBe(1);
    expect(pub.question?.options).toEqual([
      "Three", "Five", "Seven", "Ten",
    ]);
    expect(pub.question?.prompt).toMatch(/Summoner's Rift/);
  });

  it("carries no correctness pre-reveal, exactly like a real public round", () => {
    const serialized = JSON.stringify(publicRoundFromTutorial(toRoundA()));
    expect(serialized).not.toMatch(/correct/i);
  });

  it("exists before the first round so the arena never fails closed", () => {
    // The timer lesson has no round yet. A null public round would resolve no
    // renderer, and the arena would show its unsupported-module panel.
    const pub = publicRoundFromTutorial(initialTutorialState());
    expect(pub.segment.moduleId).toBe("quiz");
    expect(pub.question).not.toBeNull();
  });

  it("maps the pending answer onto the canonical option id", () => {
    expect(selectionFromRound(toRoundA().round)).toBeNull();
    expect(selectionFromRound(lockedRoundA().round)).toBe("1");
  });
});

describe("permissions", () => {
  it("is the one-click Ranked sequence: live while selecting, dead once locked", () => {
    const selecting = permissionsFromTutorial(toRoundA(), true);
    expect(selecting.canSelectAnswer).toBe(true);
    expect(selecting.canChangeAnswer).toBe(true);
    // There is no review step to reach and no confirmation to give.
    expect(selecting.canReviewSubmission).toBe(false);
    expect(selecting.canConfirmSubmission).toBe(false);
    expect(permissionsFromTutorial(lockedRoundA(), true).canSelectAnswer).toBe(false);
    // Non-interactive contexts expose nothing.
    expect(permissionsFromTutorial(toRoundA(), false).canSelectAnswer).toBe(false);
  });

  it("a coach nudge keeps the grid LIVE and carries its reason", () => {
    const nudged = permissionsFromTutorial(
      tutorialReducer(toRoundA(), { type: "SUBMIT_ANSWER", answerIndex: 0 }), true);
    // Closing the grid would strand a learner who was just told to pick again.
    expect(nudged.canSelectAnswer).toBe(true);
    expect(nudged.disabledReasons?.answer).toMatch(/Training tip/);
  });
});

describe("the settled ledger", () => {
  it("is empty until a round resolves, then carries one settlement per round", () => {
    expect(settlementsFromTutorial(toRoundA())).toEqual([]);
    const settled = settlementsFromTutorial(revealedRoundA());
    expect(settled).toHaveLength(1);
    expect(settled[0].roundNumber).toBe(1);
    expect(settled[0].players.p1.finalDamageDealt).toBe(TUTORIAL_ROUNDS.A.playerDamage);
  });

  it("numbers a round by its position on ITS OWN track", () => {
    // The R1 track skips the four ability lessons, so its victory round is the
    // fourth round played. The old derivation read `H_R1` as round 0.
    expect(tutorialRoundNumber("H", "legacy")).toBe(8);
    expect(tutorialRoundNumber("H_R1", "r1")).toBe(4);
    expect(tutorialRoundNumber("A", "r1")).toBe(1);
  });
});

describe("timer view", () => {
  it("marks explanation steps paused and carries Fortify/pressure notices", () => {
    const welcome = timerViewFromTutorial(initialTutorialState());
    expect(welcome.paused).toBe(true);
    const active = timerViewFromTutorial(toRoundA());
    expect(active.paused).toBe(false);
    expect(active.durationSeconds).toBe(30);
    expect(active.remainingSeconds).toBe(30);
  });
});

describe("fixture → ResolvedRoundView mapping", () => {
  it("passes authored values through verbatim (Round A)", () => {
    const s = revealedRoundA();
    const view = resolvedRoundViewFromResult(s.round!.result!);
    expect(view.matchId).toBe(TUTORIAL_MATCH_ID);
    expect(view.roundNumber).toBe(1);
    const p1 = view.players.p1;
    const p2 = view.players.p2;
    expect(p1.outcome).toBe("correct");
    expect(p2.outcome).toBe("incorrect");
    expect(p1.finalDamageDealt).toBe(TUTORIAL_ROUNDS.A.playerDamage);
    expect(p2.hpBefore).toBe(170);
    expect(p2.hpAfter).toBe(130);
    expect(p1.xpGained).toBe(XP.correct);
    expect(p1.chargeConsumed).toBe(false);
    expect(view.matchOver).toBe(false);
    expect(view.winner).toBeNull();
    // ARENA1 Step 4: the tablets resolve at reveal, from an AUTHORED index —
    // never one inferred from what the learner clicked.
    expect(view.correctOptionIndex).toBe(TUTORIAL_ROUNDS.A.correctAnswer);
  });

  it("carries ability commitment facts and level-up events when authored", () => {
    // Round D revealed result, built via the machine's own walk.
    const s = reduceAll(
      [
        { type: "SUBMIT_ANSWER", answerIndex: 1 },
        { type: "CONTINUE" },
        { type: "CONTINUE" },
        { type: "CONTINUE" }, // Round B
        ...Array(7).fill({ type: "TICK" }),
        { type: "SUBMIT_ANSWER", answerIndex: 1 },
        { type: "CONTINUE" },
        { type: "CONTINUE" }, // Round C
        { type: "SIMULATE_TIMEOUT" },
        { type: "CONTINUE" }, // xp_intro
        { type: "CONTINUE" }, // Round D
        { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
        { type: "SUBMIT_ANSWER", answerIndex: 0 },
        { type: "CONTINUE" }, // reveal D
      ] as TutorialEvent[],
      toRoundA(),
    );
    const view = resolvedRoundViewFromResult(s.round!.result!);
    expect(view.players.p1.abilityId).toBe("tank.fortify");
    expect(view.players.p1.chargeConsumed).toBe(true);
    expect(view.players.p1.remainingChargesAfterRound).toEqual({ "tank.fortify": 2 });
    expect(view.sharedNextRoundDurationSeconds).toBe(35);
  });

  it("victory fixture resolves to match over with a p1 knockout win", () => {
    const H = TUTORIAL_ROUNDS.H;
    // Build a revealed result directly through the fixture path used at H.
    const fakeResult = {
      roundId: "H" as const,
      playerAnswer: H.playerAnswer,
      opponentAnswer: H.opponentAnswer,
      playerCorrect: true,
      opponentCorrect: false,
      playerTimedOut: false,
      opponentTimedOut: false,
      playerDamage: H.playerDamage,
      opponentDamage: 0,
      playerHpBefore: H.playerHpBefore,
      playerHpAfter: H.playerHpAfter,
      opponentHpBefore: H.opponentHpBefore,
      opponentHpAfter: H.opponentHpAfter,
      playerXpAwarded: H.playerXpAwarded,
      opponentXpAwarded: H.opponentXpAwarded,
      playerLeveledUpTo: null,
      revealedAbilityId: null,
      chargeConsumed: false,
      chargesBefore: null,
      chargesAfter: null,
      effectTriggered: false,
      effectSummary: null,
      levelThreeAutoUnlockedAbilityId: null,
      resultCopy: H.resultCopy,
    };
    const view = resolvedRoundViewFromResult(fakeResult);
    expect(view.matchOver).toBe(true);
    expect(view.winner).toBe("p1");
    expect(view.completionReason).toBe("knockout");
    expect(view.players.p2.hpAfter).toBe(0);
    expect(view.players.p2.reachedZeroHp).toBe(true);
  });

  it("reveals both answers by player id only after resolution", () => {
    const locked = lockedRoundA();
    expect(revealedAnswersByPlayerId(locked.round!)).toEqual({});
    const revealed = revealedRoundA();
    expect(revealedAnswersByPlayerId(revealed.round!)).toEqual({
      [TUTORIAL_PLAYER_ID]: "Five",
      [TUTORIAL_GOLEM_ID]: "Three",
    });
  });
});

describe("ability views", () => {
  it("mirrors unlock state, charges, and lock reasons", () => {
    const views = abilityViewsFromTutorial(initialTutorialState());
    const fortify = views.find((v) => v.id === "tank.fortify")!;
    const brace = views.find((v) => v.id === "tank.brace")!;
    expect(fortify.unlocked).toBe(true);
    expect(fortify.remainingCharges).toBe(3);
    expect(brace.unlocked).toBe(false);
    expect(brace.unavailableReason).toMatch(/Level 2 choice/);
  });
});
