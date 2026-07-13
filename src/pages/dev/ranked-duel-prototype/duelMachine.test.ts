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
  MOCK_QUESTIONS,
  ROUND_SECONDS,
  XP,
  getDuelClass,
} from "./fixtures";

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

describe("setup and match start", () => {
  it("starts in setup and enters question phase with class HP fixtures", () => {
    expect(initialDuelState.phase).toBe("setup");
    const s = start();
    expect(s.phase).toBe("question");
    expect(s.round).toBe(1);
    expect(s.players!.p1.hp).toBe(getDuelClass("tank").startingHp);
    expect(s.players!.p2.hp).toBe(getDuelClass("mage").startingHp);
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
  });

  it("both players begin at level 1 with 0 xp", () => {
    const s = start();
    expect(s.players!.p1.level).toBe(1);
    expect(s.players!.p2.level).toBe(1);
    expect(s.players!.p1.xp).toBe(0);
    expect(s.players!.p2.xp).toBe(0);
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
    let s = run(start(), { type: "SUBMIT_ANSWER", player: "p1", answerIndex: correct });
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: "tank-1" });
    expect(s.roundPlayers.p1.selectedAbilityId).toBe("tank-1");
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: null });
    expect(s.roundPlayers.p1.selectedAbilityId).toBeNull();
    s = run(
      s,
      { type: "SELECT_ABILITY", player: "p1", abilityId: "tank-1" },
      { type: "LOCK_ABILITY", player: "p1" },
    );
    expect(s.roundPlayers.p1.abilityLocked).toBe(true);
    // Locked: further changes ignored.
    s = run(s, { type: "SELECT_ABILITY", player: "p1", abilityId: null });
    expect(s.roundPlayers.p1.selectedAbilityId).toBe("tank-1");
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
    expect(s.players!.p2.hp).toBe(getDuelClass("mage").startingHp - DAMAGE.soloCorrect);
    expect(s.players!.p1.hp).toBe(getDuelClass("tank").startingHp);
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
    s = playRound(s, 0, 0);
    expect(s.players!.p1.xp).toBe(LEVEL_THRESHOLDS[1]);
    expect(s.lastResult!.players.p1.leveledUp).toBe(true);
    expect(s.players!.p1.level).toBe(2);
    expect(s.players!.p2.level).toBe(2);
  });
});

describe("match over and restart", () => {
  const playToMatchOver = (): DuelState => {
    let s = start();
    // p1 correct / p2 wrong every round until mage HP (90) hits 0.
    for (;;) {
      s = playRound(s, 0, 1);
      if (s.winner) return run(s, { type: "NEXT_ROUND" });
      s = run(s, { type: "NEXT_ROUND" });
    }
  };

  it("enters match_over when a player reaches zero HP", () => {
    const s = playToMatchOver();
    expect(s.phase).toBe("match_over");
    expect(s.winner).toBe("p1");
    expect(s.players!.p2.hp).toBe(0);
  });

  it("rematch resets HP, XP, levels, timer, and combat history", () => {
    let s = playToMatchOver();
    s = run(s, { type: "RESTART_SAME_CLASSES" });
    expect(s.phase).toBe("question");
    expect(s.round).toBe(1);
    expect(s.players!.p1.hp).toBe(getDuelClass("tank").startingHp);
    expect(s.players!.p2.hp).toBe(getDuelClass("mage").startingHp);
    expect(s.players!.p1.xp).toBe(0);
    expect(s.players!.p1.level).toBe(1);
    expect(s.timerRemaining).toBe(ROUND_SECONDS);
    expect(s.log).toHaveLength(0);
  });

  it("back to setup returns to the initial state", () => {
    const s = run(playToMatchOver(), { type: "BACK_TO_SETUP" });
    expect(s).toEqual(initialDuelState);
  });
});
