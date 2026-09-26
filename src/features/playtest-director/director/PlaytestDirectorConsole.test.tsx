import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listCohorts: vi.fn(),
  createCohort: vi.fn(),
  setCohortStatus: vi.fn(),
  advanceDirector: vi.fn(),
  fetchRoster: vi.fn(),
  subscribeRosterChanges: vi.fn(() => () => {}),
  row: { cohortId: "c1", sceneId: "welcome", buildStep: 3, revision: 3, updatedAt: null },
}));
vi.mock("../api", () => ({
  ...api,
  supabaseDirectorStateSource: {
    fetch: vi.fn(async () => ({ ...api.row })),
    subscribe: vi.fn(() => () => {}),
  },
}));

import { PlaytestDirectorConsole } from "./PlaytestDirectorConsole";

const COHORT = {
  id: "c1", invite_slug: "a".repeat(64), name: "Friday cohort", manifest_id: "play1_placeholder",
  manifest_version: 1, status: "open", created_at: "2026-09-27T00:00:00Z",
};

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PlaytestDirectorConsole", () => {
  it("shows cohort, state, roster progress and feedback; releases gameplay by revision", async () => {
    api.listCohorts.mockResolvedValue([COHORT]);
    api.fetchRoster.mockResolvedValue([{
      enrollment_id: "e1", user_id: "u1", display_name: "Tester A", status: "feedback_submitted",
      progress_scene_id: "standard_feedback", daily_run_id: "dr_1", daily_plan_date: "2026-09-27",
      daily_run_status: "active", daily_stage_index: 1, daily_stage_status: "pending",
      progress_updated_at: null, joined_at: "t",
      feedback: [{ prompt_key: "standard_stage_feel", scene_id: "standard_feedback", response: { choice: "just_right" }, created_at: "t" }],
    }]);
    api.advanceDirector.mockResolvedValue({
      applied: true, state: { ...api.row, sceneId: "daily_standard", buildStep: 0, revision: 4 },
    });
    render(<PlaytestDirectorConsole />);
    await flush();
    await flush();
    expect(screen.getByTestId("playtest-invite-url")).toHaveTextContent(`/playtest/${COHORT.invite_slug}`);
    expect(screen.getByTestId("playtest-director-revision")).toHaveTextContent("3");
    const row = screen.getByTestId("playtest-roster-row");
    expect(within(row).getByText("feedback_submitted")).toBeTruthy();
    expect(row).toHaveTextContent("standard_stage_feel: just_right");

    const advance = screen.getByTestId("playtest-advance");
    expect(advance).toHaveTextContent("Release gameplay: daily_standard");
    await act(async () => { advance.click(); });
    await flush();
    expect(api.advanceDirector).toHaveBeenCalledWith("c1", 3, { sceneId: "daily_standard", buildStep: 0 });
    expect(screen.getByTestId("playtest-director-scene")).toHaveTextContent("daily_standard (gameplay)");
    expect(screen.getByTestId("playtest-director-revision")).toHaveTextContent("4");
  });

  it("reports a stale click and adopts the current state instead of advancing twice", async () => {
    api.listCohorts.mockResolvedValue([COHORT]);
    api.fetchRoster.mockResolvedValue([]);
    api.advanceDirector.mockResolvedValue({
      applied: false, state: { ...api.row, sceneId: "daily_standard", buildStep: 0, revision: 4 },
    });
    render(<PlaytestDirectorConsole />);
    await flush();
    await flush();
    await act(async () => { screen.getByTestId("playtest-advance").click(); });
    await flush();
    expect(screen.getByTestId("playtest-advance-notice")).toHaveTextContent(/stale/i);
    expect(screen.getByTestId("playtest-director-revision")).toHaveTextContent("4");
    expect(api.advanceDirector).toHaveBeenCalledTimes(1);
  });
});
