import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { serverEvent } from "../api/serverFixtures";
import type { ArenaEvent } from "../contracts";
import { NodeDetail, type NodeActions } from "./NodeDetail";

function actions(over: Partial<NodeActions> = {}): NodeActions {
  return { onPlay: vi.fn(), onEnterMatch: vi.fn(), onStepResult: vi.fn(), onWalkover: vi.fn(), ...over };
}

function detail(ev: ArenaEvent, a = actions()) {
  render(<NodeDetail event={ev} node={ev.bracket!.nodes[0]} viewerId={ev.viewer_profile_id} actions={a} fixture={false} />);
  return a;
}

describe("NodeDetail on a real event", () => {
  it("a player sees Play and the ready state, never organizer controls or the fixture note", () => {
    const a = detail(serverEvent({ viewer_can_manage: false }, { ready_profile_ids: ["prof-b"] }));
    expect(screen.getByTestId("ta-ready-state").textContent).toBe("Brakk is ready");
    fireEvent.click(screen.getByTestId("ta-play"));
    expect(a.onPlay).toHaveBeenCalledWith("r1n1");
    expect(screen.queryByTestId("ta-walkover-a")).toBeNull();
    expect(screen.queryByTestId("ta-step-node")).toBeNull();
    expect(screen.queryByText(/In production this mounts/)).toBeNull();
  });

  it("the organizer seat alone is not organizer authority", () => {
    detail(serverEvent({ viewer_role: "organizer", viewer_can_manage: false }));
    expect(screen.queryByTestId("ta-walkover-a")).toBeNull();
  });

  it("the owner's organizer view offers walkovers, but not while a game is live", () => {
    detail(serverEvent({ viewer_can_manage: true }));
    expect(screen.getByTestId("ta-walkover-a")).toBeTruthy();
    document.body.innerHTML = "";
    detail(serverEvent({ viewer_can_manage: true }, { status: "live", current_match_id: "arm_1" }));
    expect(screen.queryByTestId("ta-walkover-a")).toBeNull();
  });

  it("a flagged no-show says the organizer resolves it and hides Play", () => {
    detail(serverEvent({}, { attention: "no_show" }));
    expect(screen.getByText(/No-show · organizer resolves/)).toBeTruthy();
    expect(screen.queryByTestId("ta-play")).toBeNull();
  });

  it("a decided node offers the owner an override", () => {
    const a = detail(serverEvent({ viewer_can_manage: true }, { status: "complete", winner_profile_id: "prof-a" }), actions({ onOverride: vi.fn() }));
    fireEvent.click(screen.getByTestId("ta-override"));
    expect(a.onOverride).toHaveBeenCalledWith("r1n1");
  });
});
