import { describe, expect, it } from "vitest";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import {
  duplicateOptionLabels,
  projectStaffCombatants,
  projectStaffPermissions,
  projectStaffQuestion,
  projectStaffTimer,
} from "./staffDuelProjection";
import { PublicRoundView } from "./rankedDuelTypes";

const publicRound = (overrides: Partial<PublicRoundView> = {}): PublicRoundView => ({
  matchId: "m1",
  roundNumber: 3,
  matchStatus: "active",
  completedRounds: 2,
  players: [
    {
      playerId: "alice",
      classId: "tank",
      hp: 140,
      totalXp: 24,
      level: 1,
      hasSubmitted: true,
      abilitySelectionPhase: "open",
      hasAbilitySelected: true,
    },
    {
      playerId: "bob",
      classId: "mage",
      hp: 90,
      totalXp: 24,
      level: 1,
      hasSubmitted: false,
      abilitySelectionPhase: "open",
      hasAbilitySelected: false,
    },
  ],
  activeRound: {
    roundNumber: 3,
    activeDeadline: "2026-07-14T12:00:20+00:00",
    durationSeconds: 30,
    pressureApplied: false,
  },
  sharedNextRoundDurationSeconds: 30,
  matchOver: false,
  winnerId: null,
  completionReason: null,
  question: {
    questionId: "q1",
    prompt: "Which item?",
    options: ["Sunfire Aegis", "Riftmaker", "Heartsteel", "Terminus"],
    category: "items",
  },
  progressionPendingPlayers: [],
  ...overrides,
});

describe("projectStaffCombatants", () => {
  it("associates by stable player id with viewer perspective", () => {
    const views = projectStaffCombatants(publicRound(), "bob", {});
    expect(views.player.playerId).toBe("bob");
    expect(views.player.side).toBe("player");
    expect(views.player.tag).toBe("mage · you");
    expect(views.opponent.playerId).toBe("alice");
    expect(views.opponent.tag).toBe("tank");
  });

  it("neutral round status only — never opponent ability content", () => {
    const views = projectStaffCombatants(publicRound(), "bob", {});
    expect(views.opponent.hasSubmitted).toBe(true);
    expect(views.opponent.hasAbilitySelected).toBe(true);
    expect(JSON.stringify(views)).not.toMatch(/tank\.|mage\.|answer/i);
  });

  it("maxHp is the observed high-water mark when available, else null", () => {
    const bare = projectStaffCombatants(publicRound(), "alice", {});
    expect(bare.player.maxHp).toBeNull(); // explicit unknown, never invented
    const observed = projectStaffCombatants(publicRound(), "alice", { alice: 170 });
    expect(observed.player.maxHp).toBe(170);
    // Observed mark can never lag below the currently displayed HP.
    const stale = projectStaffCombatants(publicRound(), "alice", { alice: 100 });
    expect(stale.player.maxHp).toBe(140);
  });
});

describe("projectStaffTimer", () => {
  const deadline = "2026-07-14T12:00:20+00:00";
  const at = (iso: string) => Date.parse(iso);

  it("no active round or deadline yields no timer", () => {
    expect(projectStaffTimer(null, at("2026-07-14T12:00:00Z"))).toBeNull();
  });

  it("counts down from the backend deadline (authoritative, skew 0)", () => {
    const timer = projectStaffTimer(
      publicRound().activeRound,
      at("2026-07-14T12:00:05Z"),
    )!;
    expect(timer.remainingSeconds).toBe(15);
    expect(timer.durationSeconds).toBe(30);
    expect(timer.paused).toBe(false);
    expect(timer.urgent).toBe(false);
  });

  it("a shortened deadline from first-answer pressure shortens the countdown", () => {
    const pressured = publicRound({
      activeRound: {
        roundNumber: 3,
        activeDeadline: "2026-07-14T12:00:15+00:00",
        durationSeconds: 30,
        pressureApplied: true,
      },
    }).activeRound;
    const timer = projectStaffTimer(pressured, at("2026-07-14T12:00:05Z"))!;
    expect(timer.remainingSeconds).toBe(10);
    expect(timer.modifierNotices).toEqual(["-5s first-answer pressure applied"]);
  });

  it("urgent at <=5s, zero clamped at expiry", () => {
    const active = publicRound().activeRound;
    expect(projectStaffTimer(active, at("2026-07-14T12:00:16Z"))!.urgent).toBe(true);
    const expired = projectStaffTimer(active, at("2026-07-14T12:00:30Z"))!;
    expect(expired.remainingSeconds).toBe(0);
    expect(expired.urgent).toBe(false);
  });
});

describe("projectStaffPermissions", () => {
  it("closed input allows nothing (not current round, or already submitted)", () => {
    expect(projectStaffPermissions({ phase: "selecting", inputOpen: false, submitting: false }))
      .toEqual(NO_INTERACTIONS);
  });

  it("selecting allows picking; reviewing allows confirm/edit; locked allows nothing", () => {
    const selecting = projectStaffPermissions({ phase: "selecting", inputOpen: true, submitting: false });
    expect(selecting.canSelectAnswer).toBe(true);
    expect(selecting.canConfirmSubmission).toBe(false);
    const reviewing = projectStaffPermissions({ phase: "reviewing", inputOpen: true, submitting: false });
    expect(reviewing.canConfirmSubmission).toBe(true);
    expect(reviewing.canChangeAnswer).toBe(true);
    const locked = projectStaffPermissions({ phase: "locked", inputOpen: true, submitting: false });
    expect(locked).toEqual(NO_INTERACTIONS);
  });

  it("an in-flight command suspends every interaction (duplicate-confirm guard)", () => {
    const p = projectStaffPermissions({ phase: "reviewing", inputOpen: true, submitting: true });
    expect(p.canConfirmSubmission).toBe(false);
    expect(p.canChangeAnswer).toBe(false);
  });
});

describe("projectStaffQuestion / option identity", () => {
  it("maps every option label to its backend index via a stable id", () => {
    const view = projectStaffQuestion(publicRound().question!);
    expect(view.options.map((o) => [o.id, o.index, o.label])).toEqual([
      ["0", 0, "Sunfire Aegis"],
      ["1", 1, "Riftmaker"],
      ["2", 2, "Heartsteel"],
      ["3", 3, "Terminus"],
    ]);
    // The submission intent uses option.index — the backend's index — never
    // the label. Selecting id "2" must always yield backend answer 2.
    const selected = view.options.find((o) => o.id === "2")!;
    expect(selected.index).toBe(2);
    expect(JSON.stringify(view)).not.toMatch(/correct/i);
  });

  it("flags duplicate labels instead of allowing silent mis-mapping", () => {
    const view = projectStaffQuestion({
      questionId: "q2",
      prompt: "dup",
      options: ["Same", "Same", "Other"],
      category: null,
    });
    expect(duplicateOptionLabels(view)).toEqual(["Same"]);
    expect(duplicateOptionLabels(projectStaffQuestion(publicRound().question!))).toEqual([]);
  });
});
