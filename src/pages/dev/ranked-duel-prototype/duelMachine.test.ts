import { describe, expect, it } from "vitest";
import {
  DuelAction,
  DuelState,
  duelReducer,
  initialDuelState,
} from "./duelMachine";
import {
  DAMAGE,
  FIRST_ANSWER_CUT_SECONDS,
  LEVEL_THRESHOLDS,
  MAX_LEVEL,
  MOCK_QUESTIONS,
  ROUND_SECONDS,
  XP,
  getDuelClass,
} from "./fixtures";
import { adaptBackendSettlement } from "@/lib/ranked-core/backend/adaptBackendSettlement";
import { FIXTURE_PLAYER_IDS, getScenario } from "@/lib/ranked-core/backend/backendSettlementFixtures";

const run = (state: DuelState, ...actions: DuelAction[]): DuelState =>
  actions.reduce(duelReducer, state);

const start = (): DuelState =>
  duelReducer(initialDuelState, {
    type: "START_MATCH",
    classes: { p1: "tank", p2: "mage" },
  });

const q0 = MOCK_QUESTIONS[0];
const correct = q0.correctIndex;
const wrong = (correct + 1) % q0.choices.length;

const TANK = getDuelClass("tank");
const MAGE = getDuelClass("mage");

/** Drive a started match through one full round to the reveal phase. */
const playRound = (
  state: DuelState,
  p1Answer: number | null,
  p2Answer: number | null,
): DuelState => {
  let s = state;
  const qi = s.questionIndex;
  const c = MOCK_QUESTIONS[qi].correctIndex;
  const map = (a: number | null) =>
    a === null ? null : a === 0 ? c : (c + 1) % MOCK_QUESTIONS[qi].choices.length;
  if (p1Answer !== null) s = run(s, { type: "SUBMIT_ANSWER", player: "p1", answerIndex: map(p1Answer)! });
  if (p2Answer !== null) s = run(s, { type: "SUBMIT_ANSWER", player: "p2", answerIndex: map(p2Answer)! });
  while (s.phase === "question") s = run(s, { type: "TICK" });
  return run(s, { type: "RESOLVE" });
};

/**
 * Advance past reveal, resolving any progression stop by picking each
 * player's FIRST Level 2 option and continuing.
 */
const advance = (state: DuelState): DuelState => {
  let s = run(state, { type: "NEXT_ROUND" });
  if (s.phase === "progression") {
    for (const p of ["p1", "p2"] as const) {
      if (s.progression![p].needsChoice) {
        const cls = getDuelClass(s.players![p].classId);
        s = run(
          s,
          { type: "CHOOSE_LEVEL_TWO", player: p, abilityId: cls.levelTwoChoices[0].id },
          { type: "CONFIRM_LEVEL_TWO", player: p },
        );
      }
    }
    s = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
  }
  return s;
};

describe("setup and match start", () => {
  it("starts in setup and enters question phase with class HP fixtures", () => {
    expect(initialDuelState.phase).toBe("setup");
    const s = start();
    expect(s.phase).toBe("question");
    expect(s.round).toBe(1);
    expect(s.players!.p1.hp).toBe(TANK.startingHp);
    expect(s.players!.p2.hp).toBe(MAGE.startingHp);
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
  });

  it("both players begin at level 1 with 0 xp", () => {
    const s = start();
    expect(s.players!.p1.level).toBe(1);
    expect(s.players!.p2.level).toBe(1);
    expect(s.players!.p1.xp).toBe(0);
    expect(s.players!.p2.xp).toBe(0);
  });

  it("players start with only the starting active ability usable", () => {
    const s = start();
    expect(s.players!.p1.chosenLevelTwoAbilityId).toBeNull();
    // Normal abilities and the future-ultimate slot are rejected at level 1.
    let t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBeNull();
    t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.futureUltimate.id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBeNull();
    t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.startingAbility.id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBe(TANK.startingAbility.id);
  });

  it("classes have starter + two normals + future ultimate, with no passive terminology", () => {
    for (const cls of [TANK, MAGE, getDuelClass("marksman")]) {
      expect(cls.startingAbility.slot).toBe("starter_active");
      expect(cls.startingAbility.unlockLevel).toBe(1);
      expect(cls.levelTwoChoices).toHaveLength(2);
      expect(cls.levelTwoChoices.every((a) => a.slot === "normal")).toBe(true);
      expect(cls.futureUltimate.slot).toBe("future_ultimate");
      expect(cls.futureUltimate.unlockLevel).toBeUndefined();
      expect(JSON.stringify(cls)).not.toMatch(/passive/i);
    }
  });
});

describe("timer behavior", () => {
  it("first submission shortens the shared timer by exactly 5 seconds", () => {
    let s = run(start(), { type: "TICK" }, { type: "TICK" }); // 18s left
    s = run(s, { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    expect(s.timerRemaining).toBe(ROUND_SECONDS - 2 - FIRST_ANSWER_CUT_SECONDS);
    expect(s.timerShortened).toBe(true);
  });

  it("applies the shortening only once per round", () => {
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    const after = s.timerRemaining;
    // Second player's submission ends the round without a further cut.
    s = run(s, { type: "SUBMIT_ANSWER", player: "p2", answerIndex: wrong });
    expect(s.timerRemaining).toBe(after);
  });

  it("never reduces the timer below zero", () => {
    let s = start();
    for (let i = 0; i < ROUND_SECONDS - 2; i++) s = run(s, { type: "TICK" }); // 2s left
    s = run(s, { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    expect(s.timerRemaining).toBe(0);
  });

  it("ends the question phase immediately when both players submit, even with no abilities", () => {
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    expect(s.phase).toBe("question");
    s = run(s, { type: "SUBMIT_ANSWER", player: "p2", answerIndex: wrong });
    expect(s.phase).toBe("awaiting_reveal");
  });

  it("expires the round when the shortened timer reaches zero and marks the unanswered player timed out", () => {
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    while (s.phase === "question") s = run(s, { type: "TICK" });
    expect(s.phase).toBe("awaiting_reveal");
    expect(s.roundPlayers.p2.timedOut).toBe(true);
    expect(s.roundPlayers.p1.timedOut).toBe(false);
  });

  it("ignores TICK outside the question phase (paused during reveal)", () => {
    let s = playRound(start(), 0, 1);
    expect(s.phase).toBe("reveal");
    const t = s.timerRemaining;
    s = run(s, { type: "TICK" }, { type: "TICK" });
    expect(s.timerRemaining).toBe(t);
  });

  it("resets timer state for the next round", () => {
    let s = playRound(start(), 0, 1);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("question");
    expect(s.round).toBe(2);
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
    expect(s.timerShortened).toBe(false);
    expect(s.roundPlayers.p1.answerIndex).toBeNull();
    expect(s.roundPlayers.p1.selectedAbilityId).toBeNull();
    expect(s.roundPlayers.p2.answerIndex).toBeNull();
  });
});

describe("answer/ability interaction", () => {
  it("answering does not close the ability window; ability can change until locked", () => {
    const starter = TANK.startingAbility.id;
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: starter });
    expect(s.roundPlayers.p1.selectedAbilityId).toBe(starter);
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: null });
    expect(s.roundPlayers.p1.selectedAbilityId).toBeNull();
    s = run(
      s,
      { type: "SELECT_ABILITY", player: "p1", abilityId: starter },
      { type: "LOCK_ABILITY", player: "p1" },
    );
    expect(s.roundPlayers.p1.abilityLocked).toBe(true);
    // Locked: further changes ignored.
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: null });
    expect(s.roundPlayers.p1.selectedAbilityId).toBe(starter);
  });

  it("locking with NO ability selected is valid (backend rule)", () => {
    let s = start();
    s = run(s, { type: "LOCK_ABILITY", player: "p1" });
    expect(s.roundPlayers.p1.abilityLocked).toBe(true);
    expect(s.roundPlayers.p1.selectedAbilityId).toBeNull();
  });

  it("answers are one-shot", () => {
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    s = run(s, { type: "SUBMIT_ANSWER", player: "p1", answerIndex: wrong });
    expect(s.roundPlayers.p1.answerIndex).toBe(correct);
  });
});

describe("fixture-driven resolution", () => {
  it("solo correct player deals full mock damage", () => {
    const s = playRound(start(), 0, 1); // p1 correct, p2 incorrect
    const r = s.lastResult!;
    expect(r.players.p1.outcome).toBe("correct");
    expect(r.players.p2.outcome).toBe("incorrect");
    expect(r.players.p1.damageDealt).toBe(DAMAGE.soloCorrect);
    expect(r.players.p2.damageDealt).toBe(DAMAGE.wash);
    expect(s.players!.p2.hp).toBe(MAGE.startingHp - DAMAGE.soloCorrect);
    expect(s.players!.p1.hp).toBe(TANK.startingHp);
  });

  it("both correct: the faster player deals reduced damage", () => {
    // p1 answers immediately (20s remaining), p2 after two ticks.
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    s = run(s, { type: "TICK" }, { type: "TICK" });
    s = run(s, { type: "SUBMIT_ANSWER", player: "p2", answerIndex: correct });
    s = run(s, { type: "RESOLVE" });
    const r = s.lastResult!;
    expect(r.players.p1.wasFaster).toBe(true);
    expect(r.players.p1.damageDealt).toBe(DAMAGE.bothCorrectFaster);
    expect(r.players.p2.damageDealt).toBe(DAMAGE.wash);
  });

  it("both incorrect is a wash", () => {
    const s = playRound(start(), 1, 1);
    expect(s.lastResult!.players.p1.damageDealt).toBe(0);
    expect(s.lastResult!.players.p2.damageDealt).toBe(0);
  });

  it("correct vs timeout: correct player deals full damage, other is timed out", () => {
    const s = playRound(start(), 0, null);
    const r = s.lastResult!;
    expect(r.players.p2.outcome).toBe("timed_out");
    expect(r.players.p1.damageDealt).toBe(DAMAGE.soloCorrect);
  });

  it("both timing out is a wash with timeout XP", () => {
    const s = playRound(start(), null, null);
    const r = s.lastResult!;
    expect(r.players.p1.outcome).toBe("timed_out");
    expect(r.players.p2.outcome).toBe("timed_out");
    expect(r.players.p1.damageDealt).toBe(0);
    expect(r.players.p1.xpAwarded).toBe(XP.timedOut);
  });
});

describe("XP and levels", () => {
  it("both players receive stable per-round XP with small outcome differences", () => {
    const s = playRound(start(), 0, 1);
    expect(s.lastResult!.players.p1.xpAwarded).toBe(XP.correct);
    expect(s.lastResult!.players.p2.xpAwarded).toBe(XP.incorrect);
    // Intentional design guard: XP gaps stay small so XP doesn't snowball.
    expect(XP.correct - XP.incorrect).toBeLessThanOrEqual(5);
    expect(XP.incorrect - XP.timedOut).toBeLessThanOrEqual(5);
  });

  it("level display updates when a fixture threshold is crossed", () => {
    // Two both-correct rounds: 2 × XP.correct = 40 XP = the level-2 threshold.
    let s = playRound(start(), 0, 0);
    expect(s.players!.p1.level).toBe(1);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("question");
    s = playRound(s, 0, 0);
    expect(s.players!.p1.xp).toBe(LEVEL_THRESHOLDS[1]);
    expect(s.lastResult!.players.p1.leveledUp).toBe(true);
    expect(s.players!.p1.level).toBe(2);
    expect(s.players!.p2.level).toBe(2);
  });

  it("level 3 is the prototype maximum — XP keeps accruing without a level 4", () => {
    // Tank mirror so both players survive past 100 XP (6 × 18 dmg < 120 HP).
    let s = duelReducer(initialDuelState, {
      type: "START_MATCH",
      classes: { p1: "tank", p2: "tank" },
    });
    for (let i = 0; i < 6; i++) {
      s = playRound(s, 0, 0);
      expect(s.winner).toBeNull();
      s = advance(s);
    }
    expect(s.players!.p2.level).toBe(MAX_LEVEL);
    expect(s.players!.p2.xp).toBeGreaterThan(LEVEL_THRESHOLDS[MAX_LEVEL - 1]);
    expect(LEVEL_THRESHOLDS[MAX_LEVEL]).toBeUndefined();
  });
});

describe("level 2 progression stop", () => {
  /** Two both-correct rounds put both players exactly at the L2 threshold. */
  const toDualLevelTwoReveal = (): DuelState => {
    let s = playRound(start(), 0, 0);
    s = run(s, { type: "NEXT_ROUND" });
    s = playRound(s, 0, 0);
    return run(s, { type: "NEXT_ROUND" });
  };

  /** Only p1 levels: p1 correct (20xp/round), p2 wrong (16xp/round). */
  const toSoloLevelTwo = (): DuelState => {
    let s = playRound(start(), 0, 1);
    s = run(s, { type: "NEXT_ROUND" });
    s = playRound(s, 0, 1);
    return run(s, { type: "NEXT_ROUND" });
  };

  it("crossing the threshold creates exactly one pending choice per leveled player", () => {
    const s = toSoloLevelTwo();
    expect(s.phase).toBe("progression");
    expect(s.progression!.p1.needsChoice).toBe(true);
    expect(s.progression!.p1.newLevel).toBe(2);
    expect(s.progression!.p2.needsChoice).toBe(false);
    expect(s.progression!.p2.newLevel).toBeNull();
  });

  it("a level-up is detected once, not re-triggered on later rounds", () => {
    let s = toSoloLevelTwo();
    s = run(
      s,
      { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id },
      { type: "CONFIRM_LEVEL_TWO", player: "p1" },
      { type: "CONTINUE_AFTER_PROGRESSION" },
    );
    expect(s.phase).toBe("question");
    // Next round: p2 legitimately crosses level 2 (32→48 xp) and gets a
    // stop, but p1 (already level 2, choice made) is NOT re-triggered.
    s = playRound(s, 1, 1);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("progression");
    expect(s.progression!.p1.needsChoice).toBe(false);
    expect(s.progression!.p1.newLevel).toBeNull();
    expect(s.progression!.p2.needsChoice).toBe(true);
  });

  it("a player below level 2 cannot choose a level 2 ability", () => {
    const s = toSoloLevelTwo();
    const t = run(s, {
      type: "CHOOSE_LEVEL_TWO",
      player: "p2",
      abilityId: MAGE.levelTwoChoices[0].id,
    });
    expect(t).toBe(s); // rejected: p2 has no pending choice
  });

  it("choosing before level 2 exists at all is rejected", () => {
    const s = start(); // question phase, everyone level 1
    const t = run(s, {
      type: "CHOOSE_LEVEL_TWO",
      player: "p1",
      abilityId: TANK.levelTwoChoices[0].id,
    });
    expect(t).toBe(s);
  });

  it("a player cannot choose another class's ability (or the future-ultimate slot)", () => {
    const s = toSoloLevelTwo();
    let t = run(s, {
      type: "CHOOSE_LEVEL_TWO",
      player: "p1",
      abilityId: MAGE.levelTwoChoices[0].id, // p1 is tank
    });
    expect(t.progression!.p1.selectedAbilityId).toBeNull();
    t = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.futureUltimate.id });
    expect(t.progression!.p1.selectedAbilityId).toBeNull();
  });

  it("either valid level 2 option may be selected, and changed before confirming", () => {
    let s = toSoloLevelTwo();
    s = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    expect(s.progression!.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[0].id);
    s = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[1].id });
    expect(s.progression!.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[1].id);
  });

  it("a selection requires confirmation, and a confirmed choice cannot change", () => {
    let s = toSoloLevelTwo();
    // Confirm without a selection: rejected.
    let t = run(s, { type: "CONFIRM_LEVEL_TWO", player: "p1" });
    expect(t.progression!.p1.confirmed).toBe(false);
    s = run(
      s,
      { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[1].id },
      { type: "CONFIRM_LEVEL_TWO", player: "p1" },
    );
    expect(s.progression!.p1.confirmed).toBe(true);
    t = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    expect(t.progression!.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[1].id);
  });

  it("the next round cannot begin while a required choice is pending", () => {
    let s = toSoloLevelTwo();
    let t = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
    expect(t.phase).toBe("progression"); // blocked
    s = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    t = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
    expect(t.phase).toBe("progression"); // still blocked: selected but unconfirmed
    s = run(s, { type: "CONFIRM_LEVEL_TWO", player: "p1" }, { type: "CONTINUE_AFTER_PROGRESSION" });
    expect(s.phase).toBe("question");
    expect(s.round).toBe(3);
  });

  it("simultaneous level 2 requires both players to finish choosing", () => {
    let s = toDualLevelTwoReveal();
    expect(s.progression!.p1.needsChoice).toBe(true);
    expect(s.progression!.p2.needsChoice).toBe(true);
    s = run(
      s,
      { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id },
      { type: "CONFIRM_LEVEL_TWO", player: "p1" },
    );
    const t = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
    expect(t.phase).toBe("progression"); // p2 still choosing
    // p1's confirmed pick is NOT committed to match state while p2 chooses.
    expect(s.players!.p1.chosenLevelTwoAbilityId).toBeNull();
    s = run(
      s,
      { type: "CHOOSE_LEVEL_TWO", player: "p2", abilityId: MAGE.levelTwoChoices[1].id },
      { type: "CONFIRM_LEVEL_TWO", player: "p2" },
      { type: "CONTINUE_AFTER_PROGRESSION" },
    );
    expect(s.phase).toBe("question");
    expect(s.players!.p1.chosenLevelTwoAbilityId).toBe(TANK.levelTwoChoices[0].id);
    expect(s.players!.p2.chosenLevelTwoAbilityId).toBe(MAGE.levelTwoChoices[1].id);
  });

  it("the chosen ability persists and the unselected option stays unavailable", () => {
    let s = toSoloLevelTwo();
    s = run(
      s,
      { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[0].id },
      { type: "CONFIRM_LEVEL_TWO", player: "p1" },
      { type: "CONTINUE_AFTER_PROGRESSION" },
    );
    // Chosen option usable in the question phase; unchosen rejected.
    let t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[0].id);
    t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[1].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBeNull();
  });
});

describe("level 3 final normal ability unlock", () => {
  /**
   * Both-correct rounds give both players 20 XP each round; level 3 (100 XP)
   * lands on round 5. Tank vs Mage survives: faster (p1) deals 18/round to
   * p2 (90 - 4×18 = 18 HP after round 4... round 5 would kill). Use tank vs
   * tank instead so both survive to level 3 (120 HP - 5×18 > 0).
   */
  const startTanks = (): DuelState =>
    duelReducer(initialDuelState, {
      type: "START_MATCH",
      classes: { p1: "tank", p2: "tank" },
    });

  const toLevelThree = (): DuelState => {
    let s = startTanks();
    for (let round = 1; round <= 5; round++) {
      s = playRound(s, 0, 0);
      expect(s.winner).toBeNull();
      s = round < 5 ? advance(s) : run(s, { type: "NEXT_ROUND" });
    }
    return s; // progression stop for dual level 3
  };

  it("reaching level 3 unlocks the final normal ability automatically, with no choice", () => {
    const s = toLevelThree();
    expect(s.phase).toBe("progression");
    expect(s.progression!.p1.finalAbilityUnlocked).toBe(true);
    expect(s.progression!.p1.needsChoice).toBe(false);
    expect(s.progression!.p1.newLevel).toBe(3);
  });

  it("simultaneous final unlocks are presented in the same stop and ack together", () => {
    let s = toLevelThree();
    expect(s.progression!.p1.finalAbilityUnlocked).toBe(true);
    expect(s.progression!.p2.finalAbilityUnlocked).toBe(true);
    // No choices owed → a single Continue acknowledges both.
    s = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
    expect(s.phase).toBe("question");
  });

  it("neither the final unlock nor the future ultimate can be manually chosen", () => {
    const s = toLevelThree();
    // advance() picked levelTwoChoices[0], so [1] is the auto-unlocking final.
    let t = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.levelTwoChoices[1].id });
    expect(t).toBe(s); // no pending choice at level 3 — rejected
    t = run(s, { type: "CHOOSE_LEVEL_TWO", player: "p1", abilityId: TANK.futureUltimate.id });
    expect(t).toBe(s);
  });

  it("both normal abilities are usable at max level; the future ultimate never is", () => {
    // Before level 3, the unchosen normal is still rejected.
    let s = toLevelThree();
    s = run(s, { type: "CONTINUE_AFTER_PROGRESSION" });
    // advance() confirmed levelTwoChoices[0]; [1] unlocked automatically.
    let t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[1].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[1].id);
    t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[0].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBe(TANK.levelTwoChoices[0].id);
    t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.futureUltimate.id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBeNull();
  });

  it("the unchosen normal stays unusable below level 3", () => {
    // One both-correct round + L2 stop leaves players at level 2.
    let s = playRound(startTanks(), 0, 0);
    s = advance(s); // round 1: no level yet, straight to question
    s = playRound(s, 0, 0);
    s = advance(s); // level 2 stop: picks levelTwoChoices[0]
    const t = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: TANK.levelTwoChoices[1].id });
    expect(t.roundPlayers.p1.selectedAbilityId).toBeNull();
  });
});

describe("backend settlement integration", () => {
  const adapt = (key: string) =>
    adaptBackendSettlement(getScenario(key)!.settlement, FIXTURE_PLAYER_IDS);

  it("applies authoritative HP/XP/levels from the settlement without recalculation", () => {
    const s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("solo-correct") });
    expect(s.phase).toBe("reveal");
    expect(s.players!.p2.hp).toBe(60);
    expect(s.players!.p1.hp).toBe(90); // fixture value, NOT the class fixture HP
    expect(s.players!.p1.xp).toBe(20); // total_xp_after pass-through
    expect(s.lastResult!.players.p1.damageDealt).toBe(30); // final_damage_dealt
    expect(s.lastResult!.players.p2.settlement!.finalDamageReceived).toBe(30);
  });

  it("next round uses the single shared settlement timer, then falls back to the default", () => {
    let s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("timer-decreased") });
    expect(s.lastResult!.sharedNextRoundDurationSeconds).toBe(18);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("question");
    expect(s.timerRemaining).toBe(18);
    expect(s.roundDurationSeconds).toBe(18);
    // The following round (mock-resolved, both wrong so nobody levels)
    // reverts to the baseline duration.
    s = playRound(s, 1, 1);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
    expect(s.roundDurationSeconds).toBe(ROUND_SECONDS);
  });

  it("timer increase settles into a longer shared next round", () => {
    let s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("timer-increased") });
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.timerRemaining).toBe(25);
  });

  it("introduces no per-player timer fields anywhere in state", () => {
    const s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("timer-increased") });
    const flat = JSON.stringify(s).toLowerCase();
    expect(flat).not.toContain("player1nexttimer");
    expect(flat).not.toContain("player2nexttimer");
    expect(Object.keys(s.players!.p1).filter((k) => k.toLowerCase().includes("timer"))).toEqual([]);
    expect(Object.keys(s.roundPlayers.p1).filter((k) => k.toLowerCase().includes("timer"))).toEqual([]);
  });

  it("takes match-over and winner from the settlement only", () => {
    let s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("match-over") });
    expect(s.winner).toBe("p1");
    expect(s.matchOver).toBe(true);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("match_over");
  });

  it("supports a simultaneous-knockout draw: match over with NO winner", () => {
    let s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("double-knockout") });
    expect(s.matchOver).toBe(true);
    expect(s.winner).toBeNull(); // never inferred from HP
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("match_over");
  });

  it("passes an exact fixture through adapter into the reducer with the historical snapshot intact", () => {
    const adapted = adapt("charge-consumed");
    const s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapted });
    const detail = s.lastResult!.players.p1.settlement!;
    // Immutable post-round remaining charges from the backend record.
    expect(detail.remainingChargesAfterRound).toEqual({ "tank.fortify": 2, "tank.brace": 2 });
    expect(detail.chargeConsumed).toBe(true);
    expect(detail.consumedAbilityId).toBe("tank.brace");
  });

  it("a settlement level-up drives the existing progression stop", () => {
    let s = run(start(), { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("level-up") });
    expect(s.lastResult!.players.p1.leveledUp).toBe(true);
    s = run(s, { type: "NEXT_ROUND" });
    expect(s.phase).toBe("progression");
    expect(s.progression!.p1.needsChoice).toBe(true);
    expect(s.progression!.p2.needsChoice).toBe(false);
  });

  it("is rejected outside the question/awaiting phases", () => {
    const s = playRound(start(), 0, 1); // reveal phase
    const t = run(s, { type: "APPLY_BACKEND_SETTLEMENT", settlement: adapt("solo-correct") });
    expect(t).toBe(s);
  });
});

describe("match over and reset", () => {
  const playToMatchOver = (): DuelState => {
    let s = start();
    // p1 correct / p2 wrong every round until mage HP (90) hits 0.
    for (;;) {
      s = playRound(s, 0, 1);
      if (s.winner) return run(s, { type: "NEXT_ROUND" });
      s = advance(s);
    }
  };

  it("enters match_over when a player reaches zero HP (before any progression stop)", () => {
    const s = playToMatchOver();
    expect(s.phase).toBe("match_over");
    expect(s.winner).toBe("p1");
    expect(s.players!.p2.hp).toBe(0);
  });

  it("rematch resets HP, XP, levels, timer, combat history, and all progression state", () => {
    let s = playToMatchOver();
    expect(s.players!.p1.chosenLevelTwoAbilityId).not.toBeNull(); // p1 leveled en route
    s = run(s, { type: "RESTART_SAME_CLASSES" });
    expect(s.phase).toBe("question");
    expect(s.round).toBe(1);
    expect(s.players!.p1.hp).toBe(TANK.startingHp);
    expect(s.players!.p2.hp).toBe(MAGE.startingHp);
    expect(s.players!.p1.xp).toBe(0);
    expect(s.players!.p1.level).toBe(1);
    expect(s.players!.p1.chosenLevelTwoAbilityId).toBeNull();
    expect(s.players!.p2.chosenLevelTwoAbilityId).toBeNull();
    expect(s.progression).toBeNull();
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
    expect(s.log).toHaveLength(0);
  });

  it("back to setup returns to the initial state (all progression cleared)", () => {
    const s = run(playToMatchOver(), { type: "BACK_TO_SETUP" });
    expect(s).toEqual(initialDuelState);
  });
});
