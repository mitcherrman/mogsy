/**
 * PT1.8 — TRENDS as the workspace's third pane.
 *
 * MALT wrote that the mode list is DATA and that a pane is an entry plus a
 * body. This is the test that it actually was: the tab strip, the roving
 * keyboard selection, the deep-link scheme and the panel wiring all had to
 * absorb a third mode with no change of their own, and a pane that is not
 * open must not be rendered at all — which is what keeps its account-bound
 * reads off an ordinary lobby load.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LeaguecraftWorkspace, {
  parseWorkspaceHash,
  workspaceHash,
  WORKSPACE_MODES,
  type WorkspaceMode,
} from "./LeaguecraftWorkspace";

afterEach(cleanup);

function renderWorkspace(mode: WorkspaceMode, onModeChange = vi.fn()) {
  return {
    onModeChange,
    ...render(
      <LeaguecraftWorkspace
        mode={mode}
        onModeChange={onModeChange}
        history={<div data-testid="pane-history" />}
        review={<div data-testid="pane-review" />}
        trends={<div data-testid="pane-trends" />}
      />,
    ),
  };
}

describe("PT1.8 — the third pane", () => {
  it("is a mode, in the mode list, with a tab", () => {
    expect(WORKSPACE_MODES).toEqual(["history", "review", "trends"]);
    renderWorkspace("history");
    expect(screen.getByTestId("workspace-tab-trends")).toBeTruthy();
  });

  it("is addressable as /quiz#trends, through the scheme that already existed", () => {
    expect(parseWorkspaceHash("#trends")).toBe("trends");
    expect(parseWorkspaceHash("#TRENDS")).toBe("trends");
    expect(workspaceHash("trends")).toBe("#trends");
    expect(parseWorkspaceHash("#nonsense")).toBeNull();
  });

  it("renders ONLY the open pane, so a closed pane reads nothing", () => {
    renderWorkspace("history");
    expect(screen.getByTestId("pane-history")).toBeTruthy();
    expect(screen.queryByTestId("pane-trends")).toBeNull();
    expect(screen.queryByTestId("pane-review")).toBeNull();

    cleanup();
    renderWorkspace("trends");
    expect(screen.getByTestId("pane-trends")).toBeTruthy();
    expect(screen.queryByTestId("pane-history")).toBeNull();
    expect(screen.queryByTestId("pane-review")).toBeNull();
  });

  it("marks the open tab and its panel for a screen reader", () => {
    renderWorkspace("trends");
    const tab = screen.getByTestId("workspace-tab-trends");
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(tab.getAttribute("aria-controls")).toBe("workspace-panel-trends");
    expect(screen.getByTestId("workspace-tab-history").getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("workspace-panel-trends")).toBeTruthy();
  });

  it("keeps the roving keyboard selection a ring across all three", () => {
    const { onModeChange } = renderWorkspace("review");
    fireEvent.keyDown(screen.getByTestId("workspace-tab-review"), { key: "ArrowRight" });
    expect(onModeChange).toHaveBeenCalledWith("trends");

    cleanup();
    const second = renderWorkspace("trends");
    fireEvent.keyDown(screen.getByTestId("workspace-tab-trends"), { key: "ArrowRight" });
    expect(second.onModeChange).toHaveBeenCalledWith("history");
  });

  it("names the QUESTION on the tab, never the price", () => {
    renderWorkspace("trends");
    const strip = screen.getByTestId("workspace-tablist");
    expect(strip.textContent).toMatch(/trends/i);
    expect(strip.textContent).not.toMatch(/premium|upgrade|pro\b/i);
  });
});
