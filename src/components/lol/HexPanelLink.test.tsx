/**
 * Clipped Hextech nav panel: semantic link behavior, accessible naming,
 * variants, and click passthrough.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Swords } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HexPanelLink from "./HexPanelLink";

function renderPanel(props: Partial<React.ComponentProps<typeof HexPanelLink>> = {}) {
  return render(
    <MemoryRouter>
      <HexPanelLink
        to="/combat-lab"
        title="Combat Lab"
        description="Simulate matchups."
        Icon={Swords}
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("HexPanelLink", () => {
  it("renders a semantic link with an accessible name and correct destination", () => {
    renderPanel();
    const link = screen.getByRole("link", { name: /Combat Lab/ });
    expect(link.getAttribute("href")).toBe("/combat-lab");
    expect(screen.getByText("Simulate matchups.")).toBeTruthy();
  });

  it("fires the onClick passthrough (SFX/analytics hook point)", () => {
    const onClick = vi.fn();
    renderPanel({ onClick });
    fireEvent.click(screen.getByRole("link", { name: /Combat Lab/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports compact and accent variants without losing the title text", () => {
    renderPanel({ compact: true, accent: "gold", title: "Stat Duel", description: undefined });
    expect(screen.getByRole("link", { name: /Stat Duel/ })).toBeTruthy();
  });
});
