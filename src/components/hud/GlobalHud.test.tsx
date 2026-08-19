import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Auth state drives ONLY the guest-signup affordances; default to a real
// account so the chrome tests exercise the quiet HUD.
let authUser: { id: string; is_anonymous?: boolean } | null = { id: "u1" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser }) }));

const funnel = vi.hoisted(() => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => funnel);

// The identity compound (portrait + badge + chevron + panel) has its own suite
// in MogzyIdentityMenu.identity.test.tsx. Here it is a placeholder, so these
// tests speak only about the HUD's own composition and ordering.
vi.mock("@/components/hud/MogzyIdentityMenu", () => ({
  default: () => <div data-testid="hud-identity-menu" />,
}));
vi.mock("@/components/audio/AcademyRadioControls", () => ({
  default: ({ variant }: { variant?: string }) => (
    <div data-testid={`radio-controls-${variant}`} />
  ),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));

import GlobalHud from "./GlobalHud";

const renderHud = (initialPath = "/lol") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <GlobalHud />
    </MemoryRouter>,
  );

/** b follows a in document order. */
const follows = (a: Element, b: Element) =>
  !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  cleanup();
  authUser = { id: "u1" };
  funnel.trackFunnelEvent.mockClear();
});

describe("GlobalHud chrome", () => {
  it("renders the home control targeting the League hub, plus music and the identity compound", () => {
    renderHud();
    const home = screen.getByTestId("hud-home");
    expect(home.getAttribute("href")).toBe("/lol");
    expect(screen.getByTestId("radio-controls-hud")).toBeTruthy();
    expect(screen.getByTestId("hud-identity-menu")).toBeTruthy();
  });

  it("uses Mogzy's hat — not the mascot portrait — as the home icon", () => {
    // The hat means Home/Academy; the mascot portrait means "you" and belongs
    // to the profile control on the other side of the HUD. Two symbols, two
    // meanings — asserting the src is what keeps them from converging again.
    renderHud();
    const img = screen.getByTestId("hud-home").querySelector("img");
    expect(img?.getAttribute("src")).toBe("/mascot/mogzy-hat.png");
    // Decorative: the accessible name lives on the link, not the image.
    expect(img?.getAttribute("alt")).toBe("");
  });

  it("gives the home control an explicit Home accessible name", () => {
    renderHud();
    const home = screen.getByTestId("hud-home");
    expect(home.getAttribute("aria-label")).toMatch(/home/i);
    expect(home.getAttribute("title")).toBe("Home");
  });

  it("keeps the home route pointing at the same destination as before", () => {
    // LEAGUE_ONLY_MODE routes home to the League hub. The icon changed; the
    // destination deliberately did not.
    renderHud("/quiz");
    expect(screen.getByTestId("hud-home").getAttribute("href")).toBe("/lol");
  });

  it("orders the right cluster music → identity compound, in DOM (= tab) order", () => {
    renderHud();
    expect(
      follows(screen.getByTestId("radio-controls-hud"), screen.getByTestId("hud-identity-menu")),
    ).toBe(true);
  });

  it("keeps every HUD control outside width-gated blocks, so the chrome works at mobile widths", () => {
    renderHud();
    for (const id of ["hud-home", "hud-identity-menu"]) {
      const el = screen.getByTestId(id);
      expect(el.closest("div.hidden")).toBeNull();
      expect(el.closest("[class*='sm:hidden']")).toBeNull();
    }
  });
});

describe("GlobalHud home control — target and pop", () => {
  it("gives the home control a 44px hit target around a smaller mark", () => {
    renderHud();
    const home = screen.getByTestId("hud-home");
    expect(home.className).toMatch(/\bh-11\b/);
    expect(home.className).toMatch(/\bw-11\b/);
    // The visible chip stays 36px: the target grew, the chrome did not.
    expect(home.firstElementChild!.className).toMatch(/\bh-9\b/);
  });

  it("puts the transform on the chip, never on the box the layout measures", () => {
    // Same contract as the Mogzy portrait: a transformed child paints outside
    // its parent without reserving space, so the hat can grow 35% while the
    // HUD row, the page title and the document's scroll width all hold still.
    renderHud();
    const home = screen.getByTestId("hud-home");
    const transformish = (el: Element) =>
      el.className.split(/\s+/).filter((c) => /scale-\[|translate-y/.test(c));
    expect(transformish(home)).toEqual([]);
    expect(transformish(home.firstElementChild!).length).toBeGreaterThan(0);
  });

  it("answers keyboard focus exactly as it answers hover", () => {
    renderHud();
    const classes = screen.getByTestId("hud-home").firstElementChild!.className;
    const hovers = classes.match(/group-hover:[a-z-]*(scale|translate)[^\s]*/g) ?? [];
    expect(hovers.length).toBeGreaterThan(0);
    for (const h of hovers) {
      expect(classes).toContain(h.replace("group-hover:", "group-focus-visible:"));
    }
    expect(classes).toContain("group-focus-visible:ring-2");
  });
});

describe("GlobalHud — retired controls", () => {
  it("no longer renders a standalone account/profile trigger", () => {
    // Profile is now one click on the Mogzy portrait inside the identity
    // compound. A second, generic account icon would be a duplicate trigger.
    renderHud();
    expect(screen.queryByTestId("hud-account-trigger")).toBeNull();
    expect(screen.queryByRole("button", { name: /profile and settings/i })).toBeNull();
  });

  it("leaves no dead account-menu markup behind", () => {
    renderHud();
    expect(document.body.innerHTML).not.toContain("hud-account-trigger");
    expect(document.body.innerHTML).not.toContain("hud-admin-link");
  });
});

describe("GlobalHud guest signup affordances (replaced the /lol banner)", () => {
  const anon = { id: "anon1", is_anonymous: true };

  it("shows the signup chip to anonymous visitors, returning them to the page they left", () => {
    authUser = anon;
    renderHud("/lol/docs");
    const chip = screen.getByTestId("hud-signup-chip");
    expect(chip.getAttribute("href")).toBe(
      "/auth?mode=signup&returnTo=%2Flol%2Fdocs",
    );
    // Accessible name carries the full pitch even when the value phrase is
    // responsively hidden; the chip is never width-gated away entirely.
    expect(chip.getAttribute("aria-label")).toBe(
      "Sign up free — save your progress",
    );
    expect(chip.closest("div.hidden")).toBeNull();
    expect(chip.closest("[class*='sm:hidden']")).toBeNull();
  });

  it("treats a missing session as a guest too", () => {
    authUser = null;
    renderHud();
    expect(screen.getByTestId("hud-signup-chip")).toBeTruthy();
  });

  it("keeps the signup chip ahead of the music and identity controls", () => {
    authUser = anon;
    renderHud();
    const chip = screen.getByTestId("hud-signup-chip");
    expect(follows(chip, screen.getByTestId("radio-controls-hud"))).toBe(true);
    expect(follows(chip, screen.getByTestId("hud-identity-menu"))).toBe(true);
  });

  it("hides the chip from authenticated accounts", () => {
    authUser = { id: "u2" };
    renderHud();
    expect(screen.queryByTestId("hud-signup-chip")).toBeNull();
  });

  it("tracks the chip through the existing funnel with the encoded returnTo", () => {
    authUser = anon;
    renderHud("/lol");
    fireEvent.click(screen.getByTestId("hud-signup-chip"));
    expect(funnel.trackFunnelEvent).toHaveBeenCalledWith(
      "hud_signup_chip_clicked",
      { returnTo: "/lol" },
    );
  });
});
