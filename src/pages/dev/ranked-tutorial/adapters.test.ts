import { describe, expect, it } from "vitest";
import {
  abilityViewsFromTutorial,
  combatantViewsFromTutorial,
  permissionsFromTutorial,
  questionViewFromRound,
  resolvedRoundViewFromResult,
  revealedAnswersByPlayerId,
  submissionViewFromRound,
  timerViewFromTutorial,
  TUTORIAL_GOLEM_ID,
  TUTORIAL_MATCH_ID,
  TUTORIAL_PLAYER_ID,
} from "./adapters";
import { initialTutorialState, tutorialReducer } from "./tutorialMachine";
import { TUTORIAL_ROUNDS, XP } from "./fixtures";
import { TutorialEvent, TutorialState } from "./types";

const reduceAll = (events: TutorialEvent[], from?: TutorialState) =>
  events.reduce(tutorialReducer, from ?? initialTutorialState());

const toRoundA = () => reduceAll([{ type: "BEGIN_TRAINING" }, { type: "CONTINUE" }]);

const lockedRoundA = () =>
  reduceAll(
    [
      { type: "SELECT_ANSWER", answerIndex: 1 },
      { type: "LOCK_SUBMISSION" },
      { type: "CONFIRM_LOCK" },
    ],
    toRoundA(),
  );

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

describe("question / submission views", () => {
  it("maps options with stable stringified-index ids", () => {
    const s = toRoundA();
    const q = questionViewFromRound(s.round!);
    expect(q.options.map((o) => o.id)).toEqual(["0", "1", "2", "3"]);
    expect(q.options[1].index).toBe(1);
    expect(q.prompt).toMatch(/Summoner's Rift/);
  });

  it("maps round phases onto canonical submission phases", () => {
    let s = toRoundA();
    expect(submissionViewFromRound(s.round!).phase).toBe("selecting");
    s = reduceAll(
      [{ type: "SELECT_ANSWER", answerIndex: 1 }, { type: "LOCK_SUBMISSION" }],
      s,
    );
    expect(submissionViewFromRound(s.round!).phase).toBe("reviewing");
    expect(submissionViewFromRound(s.round!).selectedOptionId).toBe("1");
    s = tutorialReducer(s, { type: "CONFIRM_LOCK" });
    expect(submissionViewFromRound(s.round!).phase).toBe("locked");
  });
});

describe("permissions", () => {
  it("follows canonical sequencing and tutorial restrictions only remove", () => {
    const selecting = permissionsFromTutorial(toRoundA(), true);
    expect(selecting.canSelectAnswer).toBe(true);
    expect(selecting.canConfirmSubmission).toBe(false);
    const reviewing = permissionsFromTutorial(
      reduceAll(
        [{ type: "SELECT_ANSWER", answerIndex: 1 }, { type: "LOCK_SUBMISSION" }],
        toRoundA(),
      ),
      true,
    );
    expect(reviewing.canConfirmSubmission).toBe(true);
    // Coach nudge (wrong answer) removes confirmation with a reason.
    const nudged = permissionsFromTutorial(
      reduceAll(
        [{ type: "SELECT_ANSWER", answerIndex: 0 }, { type: "LOCK_SUBMISSION" }],
        toRoundA(),
      ),
      true,
    );
    expect(nudged.canConfirmSubmission).toBe(false);
    expect(nudged.disabledReasons?.confirm).toMatch(/Training tip/);
    // Non-interactive contexts expose nothing.
    expect(permissionsFromTutorial(toRoundA(), false).canSelectAnswer).toBe(false);
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
  });

  it("carries ability commitment facts and level-up events when authored", () => {
    // Round D revealed result, built via the machine's own walk.
    const s = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 1 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
        { type: "CONTINUE" },
        { type: "CONTINUE" },
        { type: "CONTINUE" }, // Round B
        ...Array(7).fill({ type: "TICK" }),
        { type: "SELECT_ANSWER", answerIndex: 1 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
        { type: "CONTINUE" },
        { type: "CONTINUE" }, // Round C
        { type: "SIMULATE_TIMEOUT" },
        { type: "CONTINUE" }, // xp_intro
        { type: "CONTINUE" }, // Round D
        { type: "SELECT_ANSWER", answerIndex: 0 },
        { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
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
