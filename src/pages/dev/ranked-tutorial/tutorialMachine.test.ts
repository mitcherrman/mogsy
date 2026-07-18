import { describe, expect, it } from "vitest";
import {
  initialTutorialState,
  tutorialReducer,
  unlockedAbilityIds,
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
      ...ticks(7), // 30 → 24, then the trigger tick: Golem submits, cut → 19
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

/** xp_intro → starter_ability_intro with Round D live. */
const toRoundD = () => reduceAll([{ type: "CONTINUE" }], throughRoundC());

const throughRoundD = () =>
  reduceAll(
    [
      { type: "SELECT_ANSWER", answerIndex: 0 },
      { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
      { type: "LOCK_SUBMISSION" },
      { type: "CONFIRM_LOCK" },
      { type: "CONTINUE" }, // reveal D (charge 3→2, effect triggered)
      { type: "CONTINUE" }, // → ability_resolution (Round E at 35s)
    ],
    toRoundD(),
  );

const throughRoundE = () =>
  reduceAll(
    [
      { type: "TICK" }, // Golem answers instantly: 35 → 30
      { type: "SELECT_ANSWER", answerIndex: 0 }, // guided wrong answer
      { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
      { type: "LOCK_SUBMISSION" },
      { type: "CONFIRM_LOCK" },
      { type: "CONTINUE" }, // reveal E (charge 2→1, no effect)
      { type: "CONTINUE" }, // → level_two_choice
    ],
    throughRoundD(),
  );

const throughLevelTwo = (choice: "tank.brace" | "tank.barrier" = "tank.brace") =>
  reduceAll(
    [
      { type: "CHOOSE_LEVEL_TWO", abilityId: choice },
      { type: "CONFIRM_LEVEL_TWO" },
      { type: "CONTINUE" }, // → level_three_unlock (Round F)
    ],
    throughRoundE(),
  );

const drillRound: TutorialEvent[] = [
  { type: "SELECT_ANSWER", answerIndex: 0 },
  { type: "LOCK_SUBMISSION" },
  { type: "CONFIRM_LOCK" },
  { type: "CONTINUE" }, // reveal
];

const throughLevelThree = (choice: "tank.brace" | "tank.barrier" = "tank.brace") =>
  reduceAll(
    [...drillRound, { type: "CONTINUE" }, ...drillRound, { type: "CONTINUE" }],
    throughLevelTwo(choice),
  ); // F reveal → G start → G reveal → victory_round

const throughVictory = (choice: "tank.brace" | "tank.barrier" = "tank.brace") =>
  reduceAll([...drillRound, { type: "CONTINUE" }], throughLevelThree(choice));

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
    expect(s.round?.coachNudge).toBe("answer");
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
    let s = reduceAll(ticks(6), throughRoundA());
    expect(s.timer.remaining).toBe(24);
    expect(s.round?.opponentStatus).toBe("thinking");
    expect(s.timer.pressureCutApplied).toBe(false);
    s = tutorialReducer(s, { type: "TICK" }); // trigger tick: submit → 19
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
      throughRoundD(),
      throughRoundE(),
      throughLevelTwo(),
      throughLevelThree(),
      throughVictory(),
    ];
    for (const s of checkpoints) {
      const r = tutorialReducer(s, { type: "RESTART" });
      expect(r).toEqual(initialTutorialState());
      // Full reset: HP 170, XP 0, Level 1, Fortify 3, Brace 3, Barrier 1,
      // no Level 2 choice, no Fortify bonus, no match-over.
      expect(r.player).toEqual({ hp: 170, maxHp: 170, xp: 0, level: 1 });
      expect(r.charges).toEqual({ "tank.fortify": 3, "tank.brace": 3, "tank.barrier": 1 });
      expect(r.chosenLevelTwoAbilityId).toBeNull();
      expect(r.timer.duration).toBe(30);
      expect(r.matchOver).toBe(false);
    }
  });
});

// --- Abilities (Rounds D & E) ---------------------------------------------------

describe("Fortify demonstration (Round D)", () => {
  it("Fortify starts unlocked with 3 charges; Brace and Barrier locked", () => {
    const s = initialTutorialState();
    expect(unlockedAbilityIds(s)).toEqual(["tank.fortify"]);
    expect(s.charges["tank.fortify"]).toBe(3);
    expect(s.charges["tank.brace"]).toBe(3);
    expect(s.charges["tank.barrier"]).toBe(1);
  });

  it("locked abilities cannot be armed", () => {
    const s = reduceAll(
      [{ type: "SELECT_ABILITY", abilityId: "tank.brace" }],
      toRoundD(),
    );
    expect(s.round?.playerAbilityId).toBeNull();
  });

  it("selecting Fortify does not consume a charge before resolution", () => {
    const s = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 0 },
        { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
        { type: "LOCK_SUBMISSION" },
      ],
      toRoundD(),
    );
    expect(s.charges["tank.fortify"]).toBe(3);
    // Ability changeable before confirmation via edit.
    const edited = tutorialReducer(s, { type: "EDIT_SUBMISSION" });
    expect(
      tutorialReducer(edited, { type: "SELECT_ABILITY", abilityId: null }).round
        ?.playerAbilityId,
    ).toBeNull();
  });

  it("locking without Fortify in Round D triggers the ability coach nudge", () => {
    const s = reduceAll(
      [{ type: "SELECT_ANSWER", answerIndex: 0 }, { type: "LOCK_SUBMISSION" }],
      toRoundD(),
    );
    expect(s.round?.coachNudge).toBe("ability");
    expect(tutorialReducer(s, { type: "CONFIRM_LOCK" })).toBe(s);
  });

  it("resolution consumes exactly one charge and triggers the effect", () => {
    const s = throughRoundD();
    expect(s.charges["tank.fortify"]).toBe(2);
    expect(s.stepId).toBe("ability_resolution");
    // Fixture facts, applied not recomputed.
    const f = TUTORIAL_ROUNDS.D;
    expect(f.chargesBefore).toBe(3);
    expect(f.chargesAfter).toBe(2);
    expect(f.effectTriggered).toBe(true);
    expect(f.nextRoundDurationAfterAbility).toBe(35);
    expect(s.player.xp).toBe(44);
  });

  it("the ability stays hidden before reveal", () => {
    const locked = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 0 },
        { type: "SELECT_ABILITY", abilityId: "tank.fortify" },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
      ],
      toRoundD(),
    );
    expect(locked.round?.result).toBeNull();
    const visible = JSON.stringify(visibleState(locked));
    expect(visible).not.toMatch(/revealedAbilityId/);
    expect(visible).not.toMatch(/effectTriggered/);
  });
});

describe("commitment rule (Round E)", () => {
  it("next round starts at 35 seconds from Fortify's bonus", () => {
    const s = throughRoundD();
    expect(s.timer.remaining).toBe(35);
    expect(s.timer.duration).toBe(35);
  });

  it("the Golem's instant answer cuts 35 to 30 exactly once", () => {
    let s = tutorialReducer(throughRoundD(), { type: "TICK" });
    expect(s.round?.opponentStatus).toBe("submitted");
    expect(s.timer.remaining).toBe(30);
    expect(s.timer.pressureCutApplied).toBe(true);
    s = tutorialReducer(s, { type: "TICK" });
    expect(s.timer.remaining).toBe(29); // no second cut
  });

  it("guided incorrect answer still consumes the armed charge, no effect", () => {
    const s = throughRoundE();
    expect(s.charges["tank.fortify"]).toBe(1); // 2 → 1
    expect(s.player.xp).toBe(53); // incorrect XP 9 applied
    const f = TUTORIAL_ROUNDS.E;
    expect(f.effectTriggered).toBe(false);
    expect(f.chargeConsumed).toBe(true);
    expect(f.nextRoundDurationAfterAbility).toBe(30);
  });

  it("no-ability rounds consume no charges", () => {
    const s = throughLevelThree(); // F and G both run with no ability
    expect(s.charges["tank.fortify"]).toBe(1);
    expect(s.charges["tank.brace"]).toBe(3);
    expect(s.charges["tank.barrier"]).toBe(1);
  });
});

// --- Level 2 choice ---------------------------------------------------------------

describe("Level 2 permanent choice", () => {
  it("cannot advance without choosing and confirming", () => {
    const s = throughRoundE();
    expect(s.stepId).toBe("level_two_choice");
    expect(tutorialReducer(s, { type: "CONTINUE" })).toBe(s);
    expect(tutorialReducer(s, { type: "CONFIRM_LEVEL_TWO" })).toBe(s); // nothing pending
  });

  it("both options selectable and changeable before confirmation", () => {
    let s = tutorialReducer(throughRoundE(), {
      type: "CHOOSE_LEVEL_TWO",
      abilityId: "tank.brace",
    });
    expect(s.pendingLevelTwoChoiceId).toBe("tank.brace");
    s = tutorialReducer(s, { type: "CHOOSE_LEVEL_TWO", abilityId: "tank.barrier" });
    expect(s.pendingLevelTwoChoiceId).toBe("tank.barrier");
  });

  it("confirmation is permanent: change and duplicates rejected", () => {
    const s = reduceAll(
      [
        { type: "CHOOSE_LEVEL_TWO", abilityId: "tank.brace" },
        { type: "CONFIRM_LEVEL_TWO" },
      ],
      throughRoundE(),
    );
    expect(s.chosenLevelTwoAbilityId).toBe("tank.brace");
    expect(tutorialReducer(s, { type: "CHOOSE_LEVEL_TWO", abilityId: "tank.barrier" })).toBe(s);
    expect(tutorialReducer(s, { type: "CONFIRM_LEVEL_TWO" })).toBe(s);
  });

  it("chosen ability unlocks; alternative stays locked until Level 3", () => {
    const s = throughLevelTwo("tank.brace");
    expect(unlockedAbilityIds(s)).toEqual(["tank.fortify", "tank.brace"]);
    expect(unlockedAbilityIds(s)).not.toContain("tank.barrier");
  });
});

// --- Level 3 ------------------------------------------------------------------------

describe("Level 3 automatic unlock", () => {
  it("65 XP after Round F is below the 66 threshold — still Level 2", () => {
    const s = reduceAll([...drillRound], throughLevelTwo());
    expect(s.player.xp).toBe(65);
    expect(s.player.level).toBe(2);
    expect(s.round?.result?.playerLeveledUpTo).toBeNull();
  });

  it("Round G crosses 66 → derived Level 3, no second choice dialog", () => {
    const s = throughLevelThree("tank.brace");
    expect(s.player.xp).toBe(77);
    expect(s.player.level).toBe(3);
    expect(s.player.level).toBe(levelForXp(s.player.xp));
    expect(s.stepId).toBe("victory_round");
    // Original choice retained; no pending choice reopened.
    expect(s.chosenLevelTwoAbilityId).toBe("tank.brace");
    expect(s.pendingLevelTwoChoiceId).toBeNull();
  });

  it("Brace branch auto-unlocks Barrier; Barrier branch auto-unlocks Brace", () => {
    const brace = throughLevelThree("tank.brace");
    expect(unlockedAbilityIds(brace)).toEqual([
      "tank.fortify",
      "tank.brace",
      "tank.barrier",
    ]);
    const barrier = throughLevelThree("tank.barrier");
    expect(unlockedAbilityIds(barrier)).toEqual([
      "tank.fortify",
      "tank.barrier",
      "tank.brace",
    ]);
    // No ultimate anywhere.
    expect(JSON.stringify(unlockedAbilityIds(barrier))).not.toMatch(/ult/i);
  });

  it("the G reveal carries the auto-unlock announcement", () => {
    const s = reduceAll(
      [...drillRound, { type: "CONTINUE" }, ...drillRound],
      throughLevelTwo("tank.brace"),
    );
    expect(s.round?.result?.levelThreeAutoUnlockedAbilityId).toBe("tank.barrier");
    expect(s.lastAnnouncement).toMatch(/final normal ability unlocked automatically/);
  });
});

// --- Victory & match over -----------------------------------------------------------

describe("victory round and match over", () => {
  it("requires explicit lock; opponent hidden before reveal", () => {
    const s = throughLevelThree();
    expect(s.stepId).toBe("victory_round");
    expect(tutorialReducer(s, { type: "CONTINUE" })).toBe(s); // no skipping
    const locked = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 0 },
        { type: "LOCK_SUBMISSION" },
        { type: "CONFIRM_LOCK" },
      ],
      s,
    );
    expect(locked.round?.result).toBeNull();
    expect(locked.matchOver).toBe(false); // only after resolution
  });

  it("resolved fixture brings the Golem to exactly 0 HP and sets match over", () => {
    const s = reduceAll([...drillRound], throughLevelThree());
    expect(s.opponent.hp).toBe(0);
    expect(s.matchOver).toBe(true);
    expect(s.lastAnnouncement).toMatch(/zero HP. Victory!/);
    // Never negative.
    expect(s.opponent.hp).toBeGreaterThanOrEqual(0);
  });

  it("the player may arm an available ability in the victory round", () => {
    const s = reduceAll(
      [
        { type: "SELECT_ANSWER", answerIndex: 0 },
        { type: "SELECT_ABILITY", abilityId: "tank.brace" },
        { type: "LOCK_SUBMISSION" }, // allowAnyAbility: no nudge
        { type: "CONFIRM_LOCK" },
        { type: "CONTINUE" },
      ],
      throughLevelThree("tank.brace"),
    );
    expect(s.round?.coachNudge).toBeNull();
    expect(s.charges["tank.brace"]).toBe(2); // commitment rule applied once
    expect(s.opponent.hp).toBe(0);
  });

  it("CONTINUE after the victory reveal enters match_over", () => {
    const s = throughVictory();
    expect(s.stepId).toBe("match_over");
    expect(s.matchOver).toBe(true);
    expect(s.player.hp).toBe(150);
    expect(s.player.xp).toBe(89);
    expect(s.player.level).toBe(3);
  });
});

// --- E2.5: education simulations and completion -----------------------------------

const toQueue = () => reduceAll([{ type: "CONTINUE" }], throughVictory());

const throughEducation = () =>
  reduceAll(
    [
      { type: "SIMULATE_MATCHMAKING" },
      { type: "CONTINUE" }, // → reconnect_explanation
      { type: "SIMULATE_DISCONNECT" },
      { type: "CONTINUE" }, // → ads_pro_explanation
      { type: "CONTINUE" }, // → complete
    ],
    toQueue(),
  );

describe("queue and recovery simulations (machine)", () => {
  it("queue simulation runs only in queue_explanation", () => {
    const early = toAnswerSelection();
    expect(tutorialReducer(early, { type: "SIMULATE_MATCHMAKING" })).toBe(early);
    const q = toQueue();
    expect(q.stepId).toBe("queue_explanation");
    const done = tutorialReducer(q, { type: "SIMULATE_MATCHMAKING" });
    expect(done.queueSimulationDone).toBe(true);
    // Duplicate rejected; identical state object returned.
    expect(tutorialReducer(done, { type: "SIMULATE_MATCHMAKING" })).toBe(done);
  });

  it("recovery simulation runs only in reconnect_explanation and preserves state", () => {
    const q = toQueue();
    expect(tutorialReducer(q, { type: "SIMULATE_DISCONNECT" })).toBe(q);
    const r = reduceAll(
      [{ type: "SIMULATE_MATCHMAKING" }, { type: "CONTINUE" }],
      q,
    );
    expect(r.stepId).toBe("reconnect_explanation");
    const done = tutorialReducer(r, { type: "SIMULATE_DISCONNECT" });
    expect(done.recoverySimulationDone).toBe(true);
    // Simulation never leaks into combat state.
    expect(done.player).toEqual(r.player);
    expect(done.opponent).toEqual(r.opponent);
    expect(done.charges).toEqual(r.charges);
    expect(done.round).toBe(r.round);
    // Duplicate restore rejected.
    expect(tutorialReducer(done, { type: "SIMULATE_DISCONNECT" })).toBe(done);
  });

  it("simulations announce completion", () => {
    expect(
      tutorialReducer(toQueue(), { type: "SIMULATE_MATCHMAKING" }).lastAnnouncement,
    ).toMatch(/Queue simulation complete/);
  });
});

describe("completion (machine)", () => {
  it("completion only follows the full prior sequence", () => {
    const s = throughEducation();
    expect(s.stepId).toBe("complete");
    expect(s.player.xp).toBe(89);
    expect(s.matchOver).toBe(true);
    // Only RESTART is permitted at complete.
    expect(tutorialReducer(s, { type: "CONTINUE" })).toBe(s);
    expect(tutorialReducer(s, { type: "SIMULATE_MATCHMAKING" })).toBe(s);
  });

  it("Practice Again (RESTART) from complete restores the exact initial state", () => {
    const s = tutorialReducer(throughEducation(), { type: "RESTART" });
    expect(s).toEqual(initialTutorialState());
    expect(s.queueSimulationDone).toBe(false);
    expect(s.recoverySimulationDone).toBe(false);
  });

  it("both Level 2 branches reach completion", () => {
    for (const choice of ["tank.brace", "tank.barrier"] as const) {
      const end = reduceAll(
        [
          { type: "CONTINUE" },
          { type: "SIMULATE_MATCHMAKING" },
          { type: "CONTINUE" },
          { type: "SIMULATE_DISCONNECT" },
          { type: "CONTINUE" },
          { type: "CONTINUE" },
        ],
        throughVictory(choice),
      );
      expect(end.stepId).toBe("complete");
    }
  });
});
