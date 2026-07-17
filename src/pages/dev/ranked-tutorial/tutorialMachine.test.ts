import { describe, expect, it } from "vitest";
import {
  initialTutorialState,
  tutorialReducer,
  visibleState,
} from "./tutorialMachine";
import { STEPS, STEP_ORDER } from "./tutorialSteps";
import { TUTORIAL_ROUNDS, XP, LEVEL_THRESHOLDS, levelForXp } from "./fixtures";
import { TutorialEvent, TutorialState } from "./types";

const reduceAll = (events: TutorialEvent[], from?: TutorialState) =>
  events.reduce(tutorialReducer, from ?? initialTutorialState());

// --- Walk helpers -------------------------------------------------------------

const toAnswerSelection = () =>
  reduceAll([{ type: "BEGIN_TRAINING" }, { type: "CONTINUE" }]);

const throughRoundA = () =>
  reduceAll(
    [
      { type: "SELECT_ANSWER", answerIndex: 1 },
      { type: "LOCK_SUBMISSION" },
      { type: "CONFIRM_LOCK" }, // → answer_locked
      { type: "CONTINUE" }, // → simultaneous_reveal (fixture A applied)
      { type: "CONTINUE" }, // → damage_intro
      { type: "CONTINUE" }, // → both_correct_demo (Round B starts)
    ],
    toAnswerSelection(),
  );

const ticks = (n: number): TutorialEvent[] => Array(n).fill({ type: "TICK" });

const throughRoundB = () =>
  reduceAll(
    [
      ...ticks(6), // 30 → 24: Golem submits, pressure cut → 19
      { type: "SELECT_ANSWER", answerIndex: 1 },
      { type: "LOCK_SUBMISSION" },
      { type: "CONFIRM_LOCK" },
      { type: "CONTINUE" }, // reveal (fixture B applied)
      { type: "CONTINUE" }, // → failure_demo (Round C starts)
    ],
    throughRoundA(),
  );

const throughRoundC = () =>
  reduceAll([{ type: "SIMULATE_TIMEOUT" }, { type: "CONTINUE" }], throughRoundB());

// --- Foundation ---------------------------------------------------------------

describe("tutorialMachine foundation", () => {
  it("starts at welcome with full-HP level-1 tanks", () => {
    const s = initialTutorialState();
    expect(s.stepId).toBe("welcome");
    expect(s.player).toEqual({ hp: 170, maxHp: 170, xp: 0, level: 1 });
    expect(s.opponent).toEqual({ hp: 170, maxHp: 170, xp: 0, level: 1 });
    expect(s.round).toBeNull();
  });

  it("BEGIN_TRAINING → timer_intro; CONTINUE → answer_selection with Round A live", () => {
    const s = toAnswerSelection();
    expect(s.stepId).toBe("answer_selection");
    expect(s.round?.roundId).toBe("A");
    expect(s.round?.phase).toBe("selecting");
    expect(s.timer.running).toBe(true);
    expect(s.timer.remaining).toBe(30);
  });

  it("rejects unpermitted and out-of-order events without state change", () => {
    const start = initialTutorialState();
    expect(tutorialReducer(start, { type: "CONTINUE" })).toBe(start);
    expect(tutorialReducer(start, { type: "SELECT_ANSWER", answerIndex: 0 })).toBe(start);
    expect(tutorialReducer(start, { type: "CONFIRM_LOCK" })).toBe(start);
    const sel = toAnswerSelection();
    expect(tutorialReducer(sel, { type: "BEGIN_TRAINING" })).toBe(sel);
    expect(tutorialReducer(sel, { type: "SIMULATE_TIMEOUT" })).toBe(sel);
    expect(tutorialReducer(sel, { type: "CHOOSE_LEVEL_TWO", abilityId: "tank.brace" })).toBe(sel);
    // Confirm without review is rejected.
    const picked = tutorialReducer(sel, { type: "SELECT_ANSWER", answerIndex: 1 });
    expect(tutorialReducer(picked, { type: "CONFIRM_LOCK" })).toBe(picked);
  });

  it("every step defines copy, announcement, timer mode, permitted events, RESTART", () => {
    for (const id of STEP_ORDER) {
      const step = STEPS[id];
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.announcement.length).toBeGreaterThan(0);
      expect(["paused", "running", "simulated"]).toContain(step.timerMode);
      expect(step.permittedEvents).toContain("RESTART");
    }
  });
});

// --- Answer selection & locking -------------------------------------------------

describe("answer selection and lock", () => {
  it("answers can be selected and replaced before lock", () => {
    let s = toAnswerSelection();
    s = tutorialReducer(s, { type: "SELECT_ANSWER", answerIndex: 0 });
    expect(s.round?.playerAnswerIndex).toBe(0);
    s = tutorialReducer(s, { type: "SELECT_ANSWER", answerIndex: 1 });
    expect(s.round?.playerAnswerIndex).toBe(1);
  });

  it("no-ability selection is explicit and defaults to null", () => {
    let s = toAnswerSelection();
    expect(s.round?.playerAbilityId).toBeNull();
    s = tutorialReducer(s, { type: "SELECT_ABILITY", abilityId: null });
    expect(s.round?.playerAbilityId).toBeNull();
  });

  it("LOCK_SUBMISSION requires an answer and enters review", () => {
    let s = toAnswerSelection();
    expect(tutorialReducer(s, { type: "LOCK_SUBMISSION" })).toBe(s);
    s = reduceAll([{ type: "SELECT_ANSWER", answerIndex: 1 }, { type: "LOCK_SUBMISSION" }], s);
    expect(s.round?.phase).toBe("reviewing");
  });

  it("review of a non-authored answer sets a coach nudge and blocks confirm", () => {
    let s = reduceAll(
      [{ type: "SELECT_ANSWER", answerIndex: 0 }, { type: "LOCK_SUBMISSION" }],
      toAnswerSelection(),
    );
    expect(s.round?.coachNudge).toBe(true);
    expect(tutorialReducer(s, { type: "CONFIRM_LOCK" })).toBe(s);
    // EDIT_SUBMISSION returns to selection for another pick.
    s = tutorialReducer(s, { type: "EDIT_SUBMISSION" });
    expect(s.round?.phase).toBe("selecting");
  });

  it("after CONFIRM_LOCK nothing about the submission can change", () => {
    const s = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 1 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
      ],
      toAnswerSelection(),
    );
    expect(s.stepId).toBe("answer_locked");
    expect(s.round?.phase).toBe("locked");
    // Answer, ability, duplicate submissions all rejected.
    expect(tutorialReducer(s, { type: "SELECT_ANSWER", answerIndex: 2 })).toBe(s);
    expect(tutorialReducer(s, { type: "SELECT_ABILITY", abilityId: null })).toBe(s);
    expect(tutorialReducer(s, { type: "LOCK_SUBMISSION" })).toBe(s);
    expect(tutorialReducer(s, { type: "CONFIRM_LOCK" })).toBe(s);
  });
});

// --- Hidden information -----------------------------------------------------------

describe("hidden-information boundary", () => {
  it("opponent answer and all outcome data are absent before reveal", () => {
    const locked = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 1 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
      ],
      toAnswerSelection(),
    );
    expect(locked.round?.opponentStatus).toBe("submitted"); // neutral status only
    expect(locked.round?.result).toBeNull();
    for (const snapshot of [JSON.stringify(locked), JSON.stringify(visibleState(locked))]) {
      expect(snapshot).not.toMatch(/opponentAnswer/);
      expect(snapshot).not.toMatch(/playerCorrect/);
      expect(snapshot).not.toMatch(/Damage/);
      expect(snapshot).not.toMatch(/HpAfter/);
      expect(snapshot).not.toMatch(/XpAwarded/);
    }
  });

  it("both answers become visible in the same reveal transition", () => {
    const locked = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 1 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
      ],
      toAnswerSelection(),
    );
    const revealed = tutorialReducer(locked, { type: "CONTINUE" });
    expect(revealed.stepId).toBe("simultaneous_reveal");
    expect(revealed.round?.phase).toBe("revealed");
    expect(revealed.round?.result?.playerAnswer).toBe(1);
    expect(revealed.round?.result?.opponentAnswer).toBe(0);
  });
});

// --- Round A -----------------------------------------------------------------------

describe("Round A — player correct, opponent wrong", () => {
  it("applies the authored fixture instead of recomputing", () => {
    const s = throughRoundA();
    const f = TUTORIAL_ROUNDS.A;
    // Combatants match the fixture's after-values exactly.
    expect(s.player.hp).toBe(f.playerHpAfter);
    expect(s.player.xp).toBe(f.playerXpAfter);
    expect(s.opponent.hp).toBe(f.opponentHpAfter);
    expect(s.opponent.xp).toBe(f.opponentXpAfter);
  });

  it("awards authoritative XP (12 correct / 9 incorrect) and solo damage", () => {
    const f = TUTORIAL_ROUNDS.A;
    expect(f.playerXpAwarded).toBe(XP.correct);
    expect(f.opponentXpAwarded).toBe(XP.incorrect);
    expect(f.opponentDamage).toBe(0);
    expect(f.opponentHpAfter).toBe(f.opponentHpBefore - f.playerDamage);
    expect(f.playerHpAfter).toBe(f.playerHpBefore);
  });
});

// --- Round B -----------------------------------------------------------------------

describe("Round B — both correct with pressure cut", () => {
  it("Golem submits at 24s and the timer is cut by exactly 5, once", () => {
    let s = reduceAll(ticks(5), throughRoundA());
    expect(s.timer.remaining).toBe(25);
    expect(s.round?.opponentStatus).toBe("thinking");
    expect(s.timer.pressureCutApplied).toBe(false);
    s = tutorialReducer(s, { type: "TICK" }); // 24 → golem submits → 19
    expect(s.round?.opponentStatus).toBe("submitted");
    expect(s.timer.pressureCutApplied).toBe(true);
    expect(s.timer.remaining).toBe(19);
    // Subsequent ticks never cut again.
    s = tutorialReducer(s, { type: "TICK" });
    expect(s.timer.remaining).toBe(18);
    expect(s.timer.pressureCutApplied).toBe(true);
  });

  it("both correct → both deal damage; authoritative XP for both", () => {
    const s = throughRoundB();
    const f = TUTORIAL_ROUNDS.B;
    expect(f.playerXpAwarded).toBe(XP.correct);
    expect(f.opponentXpAwarded).toBe(XP.correct);
    expect(f.playerDamage).toBeGreaterThan(0);
    expect(f.opponentDamage).toBeGreaterThan(0);
    expect(s.stepId).toBe("failure_demo");
    // HP applied from fixture on both sides.
    expect(s.player.hp).toBe(f.playerHpAfter);
    expect(s.opponent.hp).toBe(f.opponentHpAfter);
    expect(f.resultCopy).toContain("Both players were correct, so both dealt damage.");
  });

  it("cannot advance out of Round B before it resolves", () => {
    const inRoundB = throughRoundA();
    expect(tutorialReducer(inRoundB, { type: "CONTINUE" })).toBe(inRoundB);
  });
});

// --- Round C -----------------------------------------------------------------------

describe("Round C — both timeout (documented pattern)", () => {
  it("SIMULATE_TIMEOUT fast-forwards to zero and applies the wash fixture", () => {
    const s = tutorialReducer(throughRoundB(), { type: "SIMULATE_TIMEOUT" });
    const f = TUTORIAL_ROUNDS.C;
    expect(s.timer.remaining).toBe(0);
    expect(s.round?.phase).toBe("revealed");
    expect(s.round?.result?.playerTimedOut).toBe(true);
    expect(s.round?.result?.opponentTimedOut).toBe(true);
    // No normal correct-answer damage.
    expect(s.player.hp).toBe(f.playerHpBefore);
    expect(s.opponent.hp).toBe(f.opponentHpBefore);
    // Timeout XP still awarded.
    expect(f.playerXpAwarded).toBe(XP.timedOut);
    expect(s.player.xp).toBe(f.playerXpAfter);
  });

  it("cannot advance before the timeout demo runs", () => {
    const s = throughRoundB();
    expect(tutorialReducer(s, { type: "CONTINUE" })).toBe(s);
  });
});

// --- HP / XP / Level 2 -----------------------------------------------------------

describe("HP, XP, and Level 2 arrival", () => {
  it("HP and XP progress across all three rounds per fixtures", () => {
    const s = throughRoundC();
    expect(s.stepId).toBe("xp_intro");
    expect(s.player.hp).toBe(150);
    expect(s.opponent.hp).toBe(110);
    expect(s.player.xp).toBe(32);
    expect(s.opponent.xp).toBe(29);
  });

  it("Level 2 is derived from the verified threshold, not hard-coded", () => {
    const s = throughRoundC();
    expect(LEVEL_THRESHOLDS[1]).toBe(30);
    expect(s.player.xp).toBeGreaterThanOrEqual(LEVEL_THRESHOLDS[1]);
    expect(s.player.level).toBe(levelForXp(s.player.xp));
    expect(s.player.level).toBe(2);
    // Opponent at 29 XP stays Level 1 — the threshold does the work.
    expect(s.opponent.level).toBe(1);
  });

  it("the level-up is announced at the Round C reveal", () => {
    const s = tutorialReducer(throughRoundB(), { type: "SIMULATE_TIMEOUT" });
    expect(s.round?.result?.playerLeveledUpTo).toBe(2);
    expect(s.lastAnnouncement).toMatch(/Level 2/);
  });

  it("every fixture's declared levels agree with the threshold derivation", () => {
    for (const f of Object.values(TUTORIAL_ROUNDS)) {
      expect(f.playerLevelAfter).toBe(levelForXp(f.playerXpAfter));
      expect(f.playerXpAfter).toBe(f.playerXpBefore + f.playerXpAwarded);
      expect(f.opponentXpAfter).toBe(f.opponentXpBefore + f.opponentXpAwarded);
    }
  });
});

// --- Timer misc / restart ------------------------------------------------------------

describe("timer and restart", () => {
  it("timer never punishes slow readers: rests at zero without failing", () => {
    const s = reduceAll(ticks(40), toAnswerSelection());
    expect(s.timer.remaining).toBe(0);
    expect(s.timer.running).toBe(false);
    expect(s.round?.phase).toBe("selecting"); // still free to answer
  });

  it("announces one warning near the final seconds", () => {
    const s = reduceAll(ticks(26), toAnswerSelection()); // 30 → 4
    expect(s.lastAnnouncement).toMatch(/seconds left/);
  });

  it("RESTART returns to the initial state from every implemented round state", () => {
    const checkpoints = [
      toAnswerSelection(),
      reduceAll(
        [{ type: "SELECT_ANSWER", answerIndex: 1 }, { type: "LOCK_SUBMISSION" }],
        toAnswerSelection(),
      ),
      throughRoundA(),
      throughRoundB(),
      tutorialReducer(throughRoundB(), { type: "SIMULATE_TIMEOUT" }),
      throughRoundC(),
    ];
    for (const s of checkpoints) {
      expect(tutorialReducer(s, { type: "RESTART" })).toEqual(initialTutorialState());
    }
  });
});
