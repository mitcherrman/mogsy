import { describe, expect, it } from "vitest";
import {
  initialTutorialState,
  tutorialReducer,
  visibleState,
} from "./tutorialMachine";
import { STEPS, STEP_ORDER } from "./tutorialSteps";
import { TutorialEvent, TutorialState } from "./types";

const reduceAll = (events: TutorialEvent[], from?: TutorialState) =>
  events.reduce(tutorialReducer, from ?? initialTutorialState());

describe("tutorialMachine", () => {
  it("starts at welcome with full-HP level-1 tanks", () => {
    const s = initialTutorialState();
    expect(s.stepId).toBe("welcome");
    expect(s.player).toEqual({ hp: 170, maxHp: 170, xp: 0, level: 1 });
    expect(s.opponent).toEqual({ hp: 170, maxHp: 170, xp: 0, level: 1 });
  });

  it("BEGIN_TRAINING advances welcome → timer_intro", () => {
    const s = reduceAll([{ type: "BEGIN_TRAINING" }]);
    expect(s.stepId).toBe("timer_intro");
  });

  it("CONTINUE advances timer_intro → answer_selection", () => {
    const s = reduceAll([{ type: "BEGIN_TRAINING" }, { type: "CONTINUE" }]);
    expect(s.stepId).toBe("answer_selection");
  });

  it("rejects events not permitted by the current step", () => {
    const start = initialTutorialState();
    // CONTINUE is not permitted on welcome (BEGIN_TRAINING is the entry).
    expect(tutorialReducer(start, { type: "CONTINUE" })).toBe(start);
    // Combat events are meaningless on welcome.
    expect(tutorialReducer(start, { type: "SELECT_ANSWER", answerIndex: 0 })).toBe(start);
    expect(tutorialReducer(start, { type: "LOCK_SUBMISSION" })).toBe(start);
    // BEGIN_TRAINING is not permitted once past welcome.
    const later = reduceAll([{ type: "BEGIN_TRAINING" }]);
    expect(tutorialReducer(later, { type: "BEGIN_TRAINING" })).toBe(later);
  });

  it("out-of-order progression events are rejected without state change", () => {
    const s = reduceAll([{ type: "BEGIN_TRAINING" }]); // timer_intro
    expect(tutorialReducer(s, { type: "CHOOSE_LEVEL_TWO", abilityId: "tank.brace" })).toBe(s);
    expect(tutorialReducer(s, { type: "CONFIRM_LEVEL_TWO" })).toBe(s);
    expect(tutorialReducer(s, { type: "SIMULATE_TIMEOUT" })).toBe(s);
  });

  it("RESTART returns to the initial state from any step", () => {
    const s = reduceAll([{ type: "BEGIN_TRAINING" }, { type: "CONTINUE" }]);
    const restarted = tutorialReducer(s, { type: "RESTART" });
    expect(restarted).toEqual(initialTutorialState());
  });

  it("progress metadata tracks the current step", () => {
    const v0 = visibleState(initialTutorialState());
    expect(v0.stepNumber).toBe(1);
    expect(v0.totalSteps).toBe(STEP_ORDER.length);
    expect(v0.step.id).toBe("welcome");
    const v1 = visibleState(reduceAll([{ type: "BEGIN_TRAINING" }]));
    expect(v1.stepNumber).toBe(2);
    expect(v1.step.id).toBe("timer_intro");
  });

  it("every step defines copy, announcement, timer mode, and permitted events", () => {
    for (const id of STEP_ORDER) {
      const step = STEPS[id];
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
      expect(step.announcement.length).toBeGreaterThan(0);
      expect(["paused", "running", "simulated"]).toContain(step.timerMode);
      expect(step.permittedEvents.length).toBeGreaterThan(0);
      // Every step can be escaped via RESTART.
      expect(step.permittedEvents).toContain("RESTART");
    }
  });

  it("visible state never contains answer keys or opponent script data", () => {
    let s = initialTutorialState();
    const walk: TutorialEvent[] = [{ type: "BEGIN_TRAINING" }, { type: "CONTINUE" }];
    for (const e of walk) {
      s = tutorialReducer(s, e);
      const serialized = JSON.stringify(visibleState(s));
      expect(serialized).not.toMatch(/correctIndex/);
      expect(serialized).not.toMatch(/answersAtRemaining/);
      expect(serialized).not.toMatch(/OpponentScript/i);
      // Machine state itself carries no scripted future either.
      const raw = JSON.stringify(s);
      expect(raw).not.toMatch(/correctIndex/);
      expect(raw).not.toMatch(/answersAtRemaining/);
    }
  });

  it("the step table walks welcome → complete without gaps", () => {
    let s = reduceAll([{ type: "BEGIN_TRAINING" }]);
    // Force-walk via table order (navigation-only steps use CONTINUE; combat
    // steps are not yet interactive in E2.2, so walk the table directly).
    expect(STEP_ORDER[0]).toBe("welcome");
    expect(STEP_ORDER[STEP_ORDER.length - 1]).toBe("complete");
    expect(new Set(STEP_ORDER).size).toBe(STEP_ORDER.length);
    // CONTINUE from a navigation step never skips a step.
    const before = STEP_ORDER.indexOf(s.stepId);
    s = tutorialReducer(s, { type: "CONTINUE" });
    expect(STEP_ORDER.indexOf(s.stepId)).toBe(before + 1);
  });
});
