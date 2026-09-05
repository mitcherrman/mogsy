/**
 * The hub's Mogzy Premium promotion panel.
 *
 * Two things this file is really guarding:
 *  1. **Naming.** The subscription is "Mogzy Premium" at `/lol/premium`; `Pro`
 *     belongs to Pro Play. A `Pro` regression in this copy would be a product
 *     naming bug, not a cosmetic one, so it is asserted directly.
 *  2. **The member variant never advertises an upgrade** — and an *unresolved*
 *     entitlement renders the promotional variant rather than holding, because
 *     this is a promo module and not a gate.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import HubPremiumPanel from "./HubPremiumPanel";

const mocks = vi.hoisted(() => ({
  proStatus: "free" as "unknown" | "pro" | "free",
}));

vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({ proStatus: mocks.proStatus }),
}));

function renderPanel(proStatus: "unknown" | "pro" | "free") {
  mocks.proStatus = proStatus;
  return render(
    <MemoryRouter>
      <HubPremiumPanel />
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("HubPremiumPanel", () => {
  it("promotes Premium to a free user and routes to the canonical page", () => {
    renderPanel("free");
    const panel = screen.getByTestId("hub-premium-panel");
    expect(panel.dataset.premiumState).toBe("promo");
    expect(screen.getByRole("heading", { name: "Mogzy Premium" })).toBeTruthy();
    // The eyebrow now reads off the plaque's brass title band.
    expect(screen.getByText("Academy Membership")).toBeTruthy();
    const cta = screen.getByTestId("hub-premium-cta");
    expect(cta.textContent).toContain("Explore Premium");
    expect(cta.getAttribute("href")).toBe("/lol/premium");
  });

  it("never says Pro — that word belongs to Pro Play, not the subscription", () => {
    const { container } = renderPanel("free");
    expect(container.textContent).not.toMatch(/\bPro\b/);
    expect(container.textContent).not.toMatch(/Upgrade to Pro|Mogzy Pro|Go Pro/i);
  });

  it("stops advertising an upgrade once the member's entitlement resolves", () => {
    renderPanel("pro");
    const panel = screen.getByTestId("hub-premium-panel");
    expect(panel.dataset.premiumState).toBe("member");
    expect(screen.getByText("Member in good standing")).toBeTruthy();
    expect(screen.queryByText("Academy Membership")).toBeNull();
    const cta = screen.getByTestId("hub-premium-cta");
    expect(cta.textContent).toContain("View Premium");
    expect(cta.textContent).not.toContain("Explore");
    expect(cta.getAttribute("href")).toBe("/lol/premium");
  });

  it("renders the promotional variant while entitlement is still unknown", () => {
    renderPanel("unknown");
    expect(screen.getByTestId("hub-premium-panel").dataset.premiumState).toBe("promo");
    expect(screen.getByTestId("hub-premium-cta").textContent).toContain("Explore Premium");
  });

  it("claims only features Premium actually ships, and prints no price", () => {
    const { container } = renderPanel("free");
    // The two live features on /lol/premium. Everything else there is badged
    // "Coming soon" and must stay unnamed here.
    expect(container.textContent).toContain("Your full quiz history");
    expect(container.textContent).toContain("Every question you’ve missed");
    for (const comingSoon of [
      "Combat Lab",
      "Matchup Cards",
      "Learning Journeys",
      "Practice Filters",
      "Category Stats",
    ]) {
      expect(container.textContent).not.toContain(comingSoon);
    }
    // /lol/premium owns pricing; the hub must not print a figure it cannot sell.
    expect(container.textContent).not.toMatch(/\$\s?\d/);
    expect(container.textContent).not.toMatch(/per month|\/month|monthly/i);
  });

  it("keeps the CTA a 44px-plus tap target and offers a keyboard focus ring", () => {
    renderPanel("free");
    const cta = screen.getByTestId("hub-premium-cta");
    expect(cta.className).toMatch(/min-h-\[52px\]/);
    expect(cta.className).toMatch(/focus-visible:ring-2/);
    // Motion is restrained and opts out under prefers-reduced-motion.
    expect(cta.className).toMatch(/motion-reduce:hover:translate-y-0/);
  });
});
