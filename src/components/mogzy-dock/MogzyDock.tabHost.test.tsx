/**
 * RMOB2 — a surface may HOST the dock's tabs in its own row (the phone Ranked
 * bottom bar). The dock still owns the panels and their rules; the hosted tab
 * is the compact form (icon + label, no mascot).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/components/mascot/MogzyMascot", () => ({
  MogzyMascot: () => <span data-testid="mascot" />,
}));

import {
  DOCK_ORDER, MogzyDockProvider, useMogzyDockTabHost, useMogzyDockTabsHosted,
} from "./MogzyDock";
import { MogzyExplainsPanel } from "@/components/ranked-rules/MogzyExplainsPanel";

afterEach(cleanup);

function Rules() {
  const [open, setOpen] = useState(false);
  return (
    <MogzyExplainsPanel open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}
      dockOrder={DOCK_ORDER.rules} side="right" title="Rules" tabLabel="Rules"
      openLabel="open rules" testId="rules" tabIcon={<svg data-testid="rules-icon" />}>
      <p>body</p>
    </MogzyExplainsPanel>
  );
}

function Host({ enabled }: { enabled: boolean }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useMogzyDockTabHost("right", el, enabled);
  const hosted = useMogzyDockTabsHosted("right");
  return <div ref={setEl} data-testid="host" data-hosted={hosted ? "yes" : "no"} />;
}

describe("dock tab hosting", () => {
  it("leaves the tab in the corner, with its mascot, when nothing hosts it", () => {
    render(<MogzyDockProvider><Rules /><Host enabled={false} /></MogzyDockProvider>);
    const tab = screen.getByTestId("rules-tab");
    expect(screen.getByTestId("mogzy-dock-tabs-right").contains(tab)).toBe(true);
    expect(tab.getAttribute("data-hosted")).toBeNull();
    expect(screen.getByTestId("mascot")).toBeInTheDocument();
    expect(screen.getByTestId("host").getAttribute("data-hosted")).toBe("no");
  });

  it("moves the tab into the host, draws the compact form, and keeps the panel working", () => {
    render(<MogzyDockProvider><Rules /><Host enabled /></MogzyDockProvider>);
    const host = screen.getByTestId("host");
    const tab = screen.getByTestId("rules-tab");
    expect(host.contains(tab)).toBe(true);
    expect(host.getAttribute("data-hosted")).toBe("yes");
    expect(tab.getAttribute("data-hosted")).toBe("true");
    expect(screen.queryByTestId("mascot")).toBeNull();
    expect(screen.getByTestId("rules-icon")).toBeInTheDocument();
    expect(tab).toHaveAccessibleName("open rules");
    // The panel still opens into the dock's own column, not into the host.
    fireEvent.click(tab);
    const panel = screen.getByTestId("rules-panel");
    expect(screen.getByTestId("mogzy-dock-panels-right").contains(panel)).toBe(true);
    expect(screen.getByTestId("mogzy-dock-right").getAttribute("data-tabs-hosted")).toBe("true");
  });

  it("gives the tab back to the corner when the host stops hosting", () => {
    const { rerender } = render(<MogzyDockProvider><Rules /><Host enabled /></MogzyDockProvider>);
    rerender(<MogzyDockProvider><Rules /><Host enabled={false} /></MogzyDockProvider>);
    expect(screen.getByTestId("mogzy-dock-tabs-right").contains(screen.getByTestId("rules-tab")))
      .toBe(true);
  });
});
