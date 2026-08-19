/**
 * R1 tutorial track: the ability lessons are SKIPPED, never deleted.
 *
 * The legacy track has to stay fully testable from the same build — that is
 * the rollback path — so every case here checks the R1 behaviour AND that the
 * legacy behaviour beside it is untouched.
 */

import { describe, expect, it } from "vitest";
import {
  initialTutorialState, tutorialReducer, visibleState,
} from "./tutorialMachine";
import {
  ABILITY_STEP_IDS, R1_STEP_ORDER, STEPS, STEP_ORDER,
} from "./tutorialSteps";
import { TANK_LEVEL_TWO_OPTIONS, TUTORIAL_ROUNDS } from "./fixtures";
import type { TutorialState, TutorialStepId, TutorialTrack } from "./types";

/**
 * Play the tutorial the way a player does: answer whatever the step asks for,
 * then CONTINUE. Only events the CURRENT step permits are ever dispatched, so
 * this cannot force a transition the machine would refuse.
 */
function play(track: TutorialTrack): {
  steps: TutorialStepId[]; final: TutorialState; levelUps: number;
} {
  let state: TutorialState = initialTutorialState(track);
  const steps: TutorialStepId[] = [state.stepId];
  let levelUps = 0;
  const permits = (s: TutorialState, event: string) =>
    STEPS[s.stepId].permittedEvents.includes(event as never);

  const send = (event: Parameters<typeof tutorialReducer>[1]) => {
    const next = tutorialReducer(state, event);
    const moved = next !== state;
    if (moved && next.round?.result?.playerLeveledUpTo) levelUps += 1;
    if (moved && next.stepId !== state.stepId) steps.push(next.stepId);
    state = next;
    return moved;
  };

  for (let i = 0; i < 400 && state.stepId !== "complete"; i += 1) {
    const before = state;
    const round = state.round;
    if (round && round.phase === "selecting" && permits(state, "SELECT_ANSWER")) {
      const fixture = TUTORIAL_ROUNDS[round.roundId];
      send({ type: "SELECT_ANSWER", answerIndex: fixture.playerAnswer });
      // Arm whatever ability the lesson expects — the legacy ability rounds
      // refuse the lock until the armed selection matches what they teach.
      if (permits(state, "SELECT_ABILITY")) {
        send({ type: "SELECT_ABILITY", abilityId: fixture.abilityId ?? null });
      }
      send({ type: "LOCK_SUBMISSION" });
      send({ type: "CONFIRM_LOCK" });
    }
    if (permits(state, "SIMULATE_TIMEOUT")) send({ type: "SIMULATE_TIMEOUT" });
    if (permits(state, "CHOOSE_LEVEL_TWO")) {
      send({ type: "CHOOSE_LEVEL_TWO", abilityId: TANK_LEVEL_TWO_OPTIONS[0].id });
      send({ type: "CONFIRM_LEVEL_TWO" });
    }
    if (permits(state, "SIMULATE_MATCHMAKING")) send({ type: "SIMULATE_MATCHMAKING" });
    if (permits(state, "SIMULATE_DISCONNECT")) send({ type: "SIMULATE_DISCONNECT" });
    send({ type: "CONTINUE" });
    if (state === before) break;   // genuinely stuck
  }
  return { steps, final: state, levelUps };
}

describe("the R1 track skips the ability lessons", () => {
  it("drops exactly the four ability steps, keeping every other one in order", () => {
    expect(R1_STEP_ORDER).toEqual(
      STEP_ORDER.filter((id) => !ABILITY_STEP_IDS.includes(id)));
    expect(ABILITY_STEP_IDS).toEqual([
      "starter_ability_intro", "ability_resolution",
      "level_two_choice", "level_three_unlock",
    ]);
  });

  it("keeps the authored definitions in the build for rollback and diagnostics", () => {
    for (const id of ABILITY_STEP_IDS) {
      expect(STEPS[id]).toBeTruthy();
      expect(STEPS[id].body.length).toBeGreaterThan(0);
    }
  });

  it("still teaches the whole non-ability sequence, coherently", () => {
    // Every lesson R1 must keep is still in the order, in teaching order.
    for (const id of ["timer_intro", "answer_selection", "answer_locked",
      "simultaneous_reveal", "damage_intro", "both_correct_demo",
      "failure_demo", "xp_intro", "victory_round", "match_over",
      "queue_explanation", "reconnect_explanation", "ads_pro_explanation",
      "complete"] as TutorialStepId[]) {
      expect(R1_STEP_ORDER).toContain(id);
    }
  });

  it("numbers steps against its OWN order", () => {
    const r1 = visibleState(initialTutorialState("r1"));
    const legacy = visibleState(initialTutorialState("legacy"));
    expect(r1.totalSteps).toBe(R1_STEP_ORDER.length);
    expect(legacy.totalSteps).toBe(STEP_ORDER.length);
    expect(r1.totalSteps).toBeLessThan(legacy.totalSteps);
  });
});

describe("advancing never lands on a skipped step", () => {
  it("plays the R1 track end to end without entering an ability lesson", () => {
    const { steps, final } = play("r1");
    for (const id of ABILITY_STEP_IDS) expect(steps).not.toContain(id);
    expect(steps[0]).toBe("timer_intro");
    // The sequence is COHERENT: it reaches the end, having won the match.
    expect(final.stepId).toBe("complete");
    expect(final.matchOver).toBe(true);
    expect(final.opponent.hp).toBe(0);
  });

  it("the legacy track still plays through every ability lesson", () => {
    const { steps, final } = play("legacy");
    for (const id of ABILITY_STEP_IDS) expect(steps).toContain(id);
    expect(final.stepId).toBe("complete");
    expect(final.opponent.hp).toBe(0);
  });

  it("a RESTART keeps the track — the lesson can never switch mid-run", () => {
    const state = tutorialReducer(initialTutorialState("r1"), { type: "RESTART" });
    expect(state.track).toBe("r1");
    expect(tutorialReducer(initialTutorialState("legacy"), { type: "RESTART" }).track)
      .toBe("legacy");
  });
});

describe("R1 copy tells the truth about a no-progression match", () => {
  const bodyOf = (track: TutorialTrack, stepId: TutorialStepId) =>
    visibleState({ ...initialTutorialState(track), stepId }).step;

  it("XP no longer promises to unlock abilities", () => {
    const r1 = bodyOf("r1", "xp_intro");
    expect(r1.body).not.toMatch(/unlocks abilities/i);
    expect(r1.title).not.toMatch(/level 2/i);
    // The legacy lesson is unchanged and still teaches it.
    expect(bodyOf("legacy", "xp_intro").body).toMatch(/unlocks abilities/i);
  });

  it("the answer lesson stops deferring an ability lesson that never comes", () => {
    expect(bodyOf("r1", "answer_selection").body).not.toMatch(/that lesson comes later/i);
    expect(bodyOf("legacy", "answer_selection").body).toMatch(/that lesson comes later/i);
  });

  it("the victory summary no longer claims a Level 3", () => {
    expect(bodyOf("r1", "match_over").body).not.toMatch(/level 3/i);
    expect(bodyOf("legacy", "match_over").body).toMatch(/level 3/i);
    // The rating/history/progression guarantee survives on BOTH tracks.
    for (const track of ["r1", "legacy"] as TutorialTrack[]) {
      expect(bodyOf(track, "match_over").body)
        .toMatch(/did not affect your Ranked rating/i);
    }
  });
});

describe("R1 keeps the training match at Level 1 throughout", () => {
  it("never reports a level-up, and the golem still reaches 0 HP", () => {
    const { final, levelUps } = play("r1");
    expect(levelUps).toBe(0);
    expect(final.player.level).toBe(1);
    expect(final.opponent.level).toBe(1);
    expect(final.opponent.hp).toBe(0);
  });

  it("the legacy track still levels the player up", () => {
    const { final, levelUps } = play("legacy");
    expect(levelUps).toBeGreaterThan(0);
    expect(final.player.level).toBeGreaterThan(1);
  });
});
