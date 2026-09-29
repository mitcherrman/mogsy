import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readPublicRound } from "@/lib/ranked-public/contracts";
import type { SegmentStateView } from "@/lib/ranked-public/contracts";
import {
  orderForgeChallengeReveal, orderForgeSegmentMeta, orderForgeState, publicRoundV2,
} from "@/lib/ranked-public/fixtures";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { getModuleRenderer, rendererForSegment } from "./registry";
import { orderForgeModule } from "./orderForgeModule";
import type { ModuleSegmentActions } from "./types";

function parse(rawState: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = orderForgeSegmentMeta();
  (body.payload as Record<string, unknown>).segment_state = rawState;
  return readPublicRound(body);
}

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
}

function view(state: SegmentStateView | null, acts: ModuleSegmentActions) {
  return (
    <orderForgeModule.Viewport publicRound={readPublicRound(publicRoundV2())}
      selection={null} permissions={NO_INTERACTIONS} onSelect={vi.fn()}
      segmentState={state} actions={acts} skewMs={0} />
  );
}

const order = () =>
  screen.getAllByTestId(/^forge-card-e\d$/).map((el) => el.getAttribute("data-testid")!.slice(-2));

describe("order_forge module renderer — identity and registry", () => {
  it("registers order_forge v1, owning its submission", () => {
    expect(getModuleRenderer("order_forge")).toBe(orderForgeModule);
    expect(orderForgeModule.moduleVersion).toBe(1);
    expect(orderForgeModule.ownsSubmission).toBe(true);
    expect(orderForgeModule.projectQuestion(readPublicRound(publicRoundV2()))).toBeNull();
  });

  it("resolves from a parsed segment and stays null for an unknown module", () => {
    const parsed = parse(orderForgeState());
    expect(rendererForSegment(parsed.segment)).toBe(orderForgeModule);
    expect(getModuleRenderer("order_forge_v2_from_the_future")).toBeNull();
  });
});

describe("order_forge module renderer — play", () => {
  it("renders the server's shuffled cards, with no value or rank on screen", () => {
    const parsed = parse(orderForgeState());
    const { container } = render(view(parsed.segmentState, actions()));
    expect(order()).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(screen.getByText("Order these items by gold cost")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d+ g\b/);
  });

  it("submits the arranged ids as `{order}` at challenge 0 through the shell action", () => {
    const acts = actions();
    const parsed = parse(orderForgeState());
    render(view(parsed.segmentState, acts));
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(acts.submitChallenge).toHaveBeenCalledTimes(1);
    expect(acts.submitChallenge).toHaveBeenCalledWith(0, { order: ["e1", "e0", "e2", "e3", "e4"] });
  });

  it("locks the UI while pending and cannot double-submit", () => {
    const acts = actions({ submitChallenge: vi.fn(() => new Promise<boolean>(() => {})) });
    const parsed = parse(orderForgeState());
    render(view(parsed.segmentState, acts));
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(screen.queryByTestId("forge-lock")).toBeNull();
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "locked");
    expect(acts.submitChallenge).toHaveBeenCalledTimes(1);
  });

  it("releases pending and reopens the input when the server refuses the lock", async () => {
    const acts = actions({ submitChallenge: vi.fn(() => Promise.resolve(false)) });
    const parsed = parse(orderForgeState());
    render(view(parsed.segmentState, acts));
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    await act(async () => { fireEvent.click(screen.getByTestId("forge-lock")); });
    expect(screen.getByTestId("forge-lock")).toBeInTheDocument();
    // The player's arrangement survived the refusal.
    expect(order()).toEqual(["e1", "e0", "e2", "e3", "e4"]);
  });

  it("keeps the local order across a re-render with a NEW snapshot object", () => {
    const acts = actions();
    const { rerender } = render(view(parse(orderForgeState()).segmentState, acts));
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    fireEvent.click(screen.getByTestId("forge-down-e0"));
    expect(order()).toEqual(["e1", "e2", "e0", "e3", "e4"]);
    // The arena polls every second: same segment, fresh object identity.
    rerender(view(parse(orderForgeState({ pressure_applied: false })).segmentState, acts));
    expect(order()).toEqual(["e1", "e2", "e0", "e3", "e4"]);
  });

  it("shows the server's locked order after a refresh, without controls", () => {
    const parsed = parse(orderForgeState({}, true));
    render(view(parsed.segmentState, actions()));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "locked");
    const rows = screen.getAllByTestId(/^forge-locked-e\d$/);
    expect(rows.map((r) => r.getAttribute("data-testid")!.slice(-2)))
      .toEqual(["e3", "e0", "e4", "e1", "e2"]);
    expect(screen.getByTestId("order-forge-opponent-progress"))
      .toHaveTextContent(/waiting for the opponent/i);
  });

  it("renders the in-viewport reveal from ownChallengeReveals only after locking", () => {
    const parsed = parse(orderForgeState({
      own_challenge_reveals: [orderForgeChallengeReveal()],
    }, true));
    render(view(parsed.segmentState, actions()));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-phase", "revealed");
    expect(screen.getByRole("heading", { name: "My order" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Correct order" })).toBeInTheDocument();
    expect(screen.getByTestId("forge-correct-e2-value")).toHaveTextContent("350 g");
    expect(screen.getByTestId("forge-verdict")).toHaveTextContent("Not quite");
  });

  it("does not show the opponent's order or any opponent reveal", () => {
    const parsed = parse(orderForgeState({ opponent_finished: true }, true));
    const { container } = render(view(parsed.segmentState, actions()));
    expect(container.textContent).not.toMatch(/opponent's order|their order/i);
    expect(screen.getByTestId("order-forge-opponent-progress"))
      .toHaveTextContent("Both players have locked in.");
  });

  it("surfaces an action error", () => {
    const parsed = parse(orderForgeState());
    render(view(parsed.segmentState, actions({ error: "Could not lock in" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not lock in");
  });

  it("is safe with no segment state yet", () => {
    render(view(null, actions()));
    expect(screen.getByTestId("order-forge-loading")).toBeInTheDocument();
  });

  it("never submits before the challenge opens", () => {
    const acts = actions();
    const future = new Date(Date.now() + 60_000).toISOString();
    const parsed = parse(orderForgeState({ challenge_started_at: future }));
    render(view(parsed.segmentState, acts));
    expect(screen.getByTestId("order-forge-phase")).toHaveAttribute("data-not-open", "true");
    fireEvent.click(screen.getByTestId("forge-lock"));
    expect(acts.submitChallenge).not.toHaveBeenCalled();
  });
});

describe("order_forge module renderer — summary", () => {
  it("summarises before and after the lock", () => {
    expect(orderForgeModule.summaryLabel(parse(orderForgeState()), null)).toBe("Order the cards");
    expect(orderForgeModule.summaryLabel(parse(orderForgeState({}, true)), null)).toBe("Order locked in");
  });
});
