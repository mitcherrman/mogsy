import { describe, expect, it } from "vitest";
import {
  PLAY1_MANIFEST, nextPosition, participantView, resolveManifest, type PlaytestManifest,
} from "./manifest";
import { applyDirectorState, readDirectorRow, type DirectorState } from "./directorState";

describe("PLAY1 manifest contract", () => {
  it("has the four placeholder scenes in order, one of each kind", () => {
    expect(PLAY1_MANIFEST.scenes.map((s) => [s.id, s.kind])).toEqual([
      ["welcome", "presentation"],
      ["daily_standard", "gameplay"],
      ["standard_feedback", "feedback"],
      ["play1_complete", "completion"],
    ]);
    const welcome = PLAY1_MANIFEST.scenes[0];
    expect(welcome.kind === "presentation" && welcome.builds.length).toBeGreaterThanOrEqual(2);
    const gameplay = PLAY1_MANIFEST.scenes[1];
    expect(gameplay.kind === "gameplay" && gameplay.returnWhen).toEqual({ type: "stage_terminal", stageIndex: 0 });
  });

  it("resolves only a known id + version", () => {
    expect(resolveManifest("play1_placeholder", 1)).toBe(PLAY1_MANIFEST);
    expect(resolveManifest("play1_placeholder", 2)).toBeNull();
  });

  it("walks builds, then scenes, then stops", () => {
    const walk: string[] = [];
    let at: { sceneId: string; buildStep: number } | null = { sceneId: "welcome", buildStep: 0 };
    while (at) {
      walk.push(`${at.sceneId}/${at.buildStep}`);
      at = nextPosition(PLAY1_MANIFEST, at);
    }
    expect(walk).toEqual([
      "welcome/0", "welcome/1", "welcome/2", "welcome/3",
      "daily_standard/0", "standard_feedback/0", "play1_complete/0",
    ]);
  });

  it("derives the participant view from manifest + state alone", () => {
    const v = participantView(PLAY1_MANIFEST, { sceneId: "welcome", buildStep: 2 });
    expect(v.kind === "presentation" && v.revealed.map((b) => b.id)).toEqual(["what", "how"]);
    expect(participantView(PLAY1_MANIFEST, { sceneId: "daily_standard", buildStep: 0 }).kind).toBe("gameplay");
    expect(participantView(PLAY1_MANIFEST, { sceneId: "nope", buildStep: 0 }).kind).toBe("unknown_scene");
  });

  it("lets a future manifest choose a different return point with no other change", () => {
    const later: PlaytestManifest = {
      id: "future", version: 1,
      scenes: [{ kind: "gameplay", id: "whole_daily", title: "", surface: "daily_challenge",
        returnWhen: { type: "daily_terminal" }, heldMessage: "" }],
    };
    const v = participantView(later, { sceneId: "whole_daily", buildStep: 0 });
    expect(v.kind === "gameplay" && v.scene.returnWhen).toEqual({ type: "daily_terminal" });
  });
});

describe("director state ordering", () => {
  const s = (revision: number, sceneId = "welcome", buildStep = 0): DirectorState =>
    ({ cohortId: "c1", sceneId, buildStep, revision, updatedAt: null });

  it("adopts only strictly newer revisions, so duplicates and reordering are harmless", () => {
    let cur: DirectorState | null = null;
    cur = applyDirectorState(cur, s(1, "welcome", 1));
    cur = applyDirectorState(cur, s(3, "daily_standard", 0));
    cur = applyDirectorState(cur, s(2, "welcome", 3)); // late
    cur = applyDirectorState(cur, s(3, "daily_standard", 0)); // duplicate
    expect(cur).toMatchObject({ revision: 3, sceneId: "daily_standard" });
    expect(applyDirectorState(cur, { ...s(9), cohortId: "other" })).toBe(cur);
  });

  it("reads PostgREST rows, including bigint-as-string revisions", () => {
    expect(readDirectorRow({ cohort_id: "c1", scene_id: "welcome", build_step: 2, revision: "7", updated_at: "t" }))
      .toEqual({ cohortId: "c1", sceneId: "welcome", buildStep: 2, revision: 7, updatedAt: "t" });
    expect(readDirectorRow({})).toBeNull();
  });
});
