import { describe, expect, it } from "vitest";

import {
  ACTIVITY_LIFECYCLE_BY_ID,
  ACTIVITY_LIFECYCLE_REGISTRY,
  ACTIVITY_TERMINAL_OUTCOMES,
} from "./activityLifecycle";

describe("canonical activity lifecycle registry", () => {
  it("keeps stable unique snake-case ids and a complete lookup", () => {
    const ids = ACTIVITY_LIFECYCLE_REGISTRY.map((entry) => entry.activityId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[a-z][a-z0-9_]*$/.test(id))).toBe(true);
    expect(Object.keys(ACTIVITY_LIFECYCLE_BY_ID).sort()).toEqual([...ids].sort());
  });

  it("declares only canonical terminal outcomes and at least one per activity", () => {
    const allowed = new Set<string>(ACTIVITY_TERMINAL_OUTCOMES);
    for (const entry of ACTIVITY_LIFECYCLE_REGISTRY) {
      expect(entry.validTerminalOutcomes.length, entry.activityId).toBeGreaterThan(0);
      expect(entry.validTerminalOutcomes.every((outcome) => allowed.has(outcome)), entry.activityId).toBe(true);
    }
  });

  it("covers the current governed product activities without reviving DSA", () => {
    expect(Object.keys(ACTIVITY_LIFECYCLE_BY_ID)).toEqual(expect.arrayContaining([
      "daily_challenge",
      "practice_quiz",
      "ranked_match",
      "champion_mastery",
      "meta_reflex_round",
      "leaguecraft_matchup_study",
      "pro_play_quiz",
      "stat_check_bot_match",
      "stat_check_private_match",
      "onboarding",
    ]));
    expect(Object.keys(ACTIVITY_LIFECYCLE_BY_ID).some((id) => id.includes("dsa"))).toBe(false);
  });

  it("does not mistake the browser Practice diagnostic for completion authority", () => {
    const practice = ACTIVITY_LIFECYCLE_BY_ID.practice_quiz;
    expect(practice.terminal.owner).toBe("server");
    expect(practice.migrationNotes).toContain("Railway practice_quiz_*");
    expect(practice.migrationNotes).toContain("Retire quiz_completed");
  });

  it("governs the live Academy welcome instead of the legacy profile flow", () => {
    const onboarding = ACTIVITY_LIFECYCLE_BY_ID.onboarding;
    expect(onboarding.humanName).toBe("Academy Welcome");
    expect(onboarding.terminal.owner).toBe("browser");
    expect(onboarding.terminal.boundary).toContain("markAcademyWelcomeHandled");
    expect(onboarding.migrationNotes).toContain("Admin-preview-only");
  });

  it("measures canonical Ranked across hosts without letting a child complete its parent", () => {
    const ranked = ACTIVITY_LIFECYCLE_BY_ID.ranked_match;
    expect(ranked.entityId).toBe("ranked_participant = match_id:user_id");
    expect(ranked.entityGrain).toContain("nested under another product host");
    expect(ranked.migrationNotes).toContain("never substitutes for its parent activity's completion");
    expect(ranked.migrationNotes).toContain("parent_activity_type");
    const daily = ACTIVITY_LIFECYCLE_BY_ID.daily_challenge;
    expect(daily.started.boundary).toContain("/api/daily-run/today");
    expect(daily.migrationNotes).toContain("separate grains");
  });

  it("keeps standalone Champion Mastery as legacy, not the current Mastery product", () => {
    const mastery = ACTIVITY_LIFECYCLE_BY_ID.champion_mastery;
    expect(mastery.humanName).toContain("legacy");
    expect(mastery.currentEvents).toEqual(["mastery_opened", "mastery_started", "mastery_completed"]);
    expect(mastery.migrationNotes).toContain("Mastery Journey");
    expect(Object.keys(ACTIVITY_LIFECYCLE_BY_ID)).not.toContain("mastery_journey");
  });

  it("makes every authority and entity declaration non-empty", () => {
    for (const entry of ACTIVITY_LIFECYCLE_REGISTRY) {
      expect(entry.opened.boundary.trim(), `${entry.activityId}.opened`).not.toBe("");
      expect(entry.started.boundary.trim(), `${entry.activityId}.started`).not.toBe("");
      expect(entry.terminal.boundary.trim(), `${entry.activityId}.terminal`).not.toBe("");
      expect(entry.entityGrain.trim(), `${entry.activityId}.entityGrain`).not.toBe("");
      expect(entry.entityId.trim(), `${entry.activityId}.entityId`).not.toBe("");
    }
  });
});
