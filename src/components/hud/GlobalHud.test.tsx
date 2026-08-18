import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuthContextValue, AdminAuthStatus } from "@/lib/admin-auth/types";

// Migrated from Navbar.test.tsx: the HUD's account menu inherits the navbar's
// admin entry-point contract unchanged. Reuse the established admin-auth mock
// recipe (AdminAuthGate.test.tsx): the HUD reads the real useAdminAuth
// contract against a controlled context — no parallel authorization model.
let adminCtx: AdminAuthContextValue;
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => adminCtx,
}));

// Auth state drives ONLY the guest-signup affordances; default to a real
// account so the pre-existing chrome/admin tests exercise the quiet HUD.
let authUser: { id: string; is_anonymous?: boolean } | null = { id: "u1" };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser }) }));

const funnel = vi.hoisted(() => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/funnel-analytics", () => funnel);

vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/components/UserNotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));
vi.mock("@/components/audio/AcademyRadioControls", () => ({
  default: ({ variant }: { variant?: string }) => (
    <div data-testid={`radio-controls-${variant}`} />
  ),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));

import GlobalHud from "./GlobalHud";
import { ADMIN_DIRECTORY_PATH } from "@/lib/admin/admin-directory";

const baseCtx = (status: AdminAuthStatus): AdminAuthContextValue => ({
  status,
  principal:
    status === "authorized"
      ? { authMethod: "supabase_user", userId: "u1", email: "admin@mogzy.lol" }
      : null,
  isAuthorized: status === "authorized" || status === "authorized_via_fallback",
  fallbackActive: status === "authorized_via_fallback",
  recheck: vi.fn(),
  applyFallbackKey: vi.fn(),
  clearFallback: vi.fn(),
  invalidate: vi.fn(),
});

const renderHud = (initialPath = "/lol") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <GlobalHud />
    </MemoryRouter>,
  );

// Radix opens on pointerdown/keydown, not click, and jsdom has no real
// pointer — keyDown Enter is the reliable way to open the menu.
const openAccountMenu = () =>
  fireEvent.keyDown(screen.getByTestId("hud-account-trigger"), { key: "Enter" });

const adminLink = () => screen.queryByRole("menuitem", { name: /admin/i });

/** Accessible names of every item in the opened account menu. */
const menuItemNames = () =>
  screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());

afterEach(() => {
  cleanup();
  authUser = { id: "u1" };
  funnel.trackFunnelEvent.mockClear();
});

describe("GlobalHud chrome", () => {
  it("renders the Mogzy home control targeting the League hub, plus music, bell and account controls", () => {
    adminCtx = baseCtx("signed_out");
    renderHud();
    const home = screen.getByTestId("hud-home");
    expect(home.getAttribute("href")).toBe("/lol");
    expect(home.getAttribute("aria-label")).toContain("Mogzy");
    expect(screen.getByTestId("radio-controls-hud")).toBeTruthy();
    expect(screen.getByTestId("notification-bell")).toBeTruthy();
    expect(screen.getByTestId("hud-account-trigger")).toBeTruthy();
  });

  it("orders the right cluster music → profile → notifications, in DOM (= tab) order", () => {
    adminCtx = baseCtx("signed_out");
    renderHud();
    const music = screen.getByTestId("radio-controls-hud");
    const account = screen.getByTestId("hud-account-trigger");
    const bell = screen.getByTestId("notification-bell");
    const follows = (a: Element, b: Element) =>
      // b follows a in document order
      !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(music, account)).toBe(true);
    expect(follows(account, bell)).toBe(true);
  });

  it("exposes Profile and Settings in the account menu", async () => {
    adminCtx = baseCtx("signed_out");
    renderHud();
    openAccountMenu();
    const profile = await screen.findByRole("menuitem", { name: /profile/i });
    expect(profile.getAttribute("href")).toBe("/profile");
    expect(
      screen.getByRole("menuitem", { name: /settings/i }).getAttribute("href"),
    ).toBe("/settings");
  });

  it("keeps every HUD control outside width-gated blocks, so the chrome works at mobile widths", () => {
    adminCtx = baseCtx("authorized");
    renderHud();
    for (const id of ["hud-home", "hud-account-trigger"]) {
      const el = screen.getByTestId(id);
      expect(el.closest("div.hidden")).toBeNull();
      expect(el.closest("[class*='sm:hidden']")).toBeNull();
    }
  });
});

describe("GlobalHud admin entry point (migrated navbar contract)", () => {
  it("shows an Admin item targeting the directory for an authorized admin", async () => {
    adminCtx = baseCtx("authorized");
    renderHud();
    openAccountMenu();
    const link = await screen.findByTestId("hud-admin-link");
    // Consistency: the HUD must use the exported registry constant.
    expect(link.getAttribute("href")).toBe(ADMIN_DIRECTORY_PATH);
    expect(ADMIN_DIRECTORY_PATH).toBe("/admin/directory");
  });

  it("does not render the item for a guest", async () => {
    adminCtx = baseCtx("signed_out");
    renderHud();
    openAccountMenu();
    await screen.findByRole("menu");
    expect(adminLink()).toBeNull();
    expect(screen.queryByTestId("hud-admin-link")).toBeNull();
  });

  it("does not render the item for an authenticated non-admin", async () => {
    adminCtx = baseCtx("signed_in_non_admin");
    renderHud();
    openAccountMenu();
    await screen.findByRole("menu");
    expect(adminLink()).toBeNull();
  });

  it("does not render the item (or any placeholder) during unresolved auth", async () => {
    for (const status of ["loading", "checking"] as const) {
      adminCtx = baseCtx(status);
      renderHud();
      openAccountMenu();
      await screen.findByRole("menu");
      expect(adminLink()).toBeNull();
      expect(screen.queryByTestId("hud-admin-link")).toBeNull();
      cleanup();
    }
  });

  it("does not render the item for expired, unavailable, malformed, or rejected states", async () => {
    for (const status of [
      "expired_session",
      "backend_unavailable",
      "malformed_response",
      "fallback_rejected",
    ] as const) {
      adminCtx = baseCtx(status);
      renderHud();
      openAccountMenu();
      await screen.findByRole("menu");
      expect(adminLink()).toBeNull();
      cleanup();
    }
  });

  it("serves identical account menus to guests and non-admins (no placeholder, no layout change)", async () => {
    // Radix generates per-render ids, so raw innerHTML equality is noise; the
    // contract is that the menu's contents are indistinguishable.
    adminCtx = baseCtx("signed_out");
    renderHud();
    openAccountMenu();
    await screen.findByRole("menu");
    const guestItems = menuItemNames();
    expect(document.body.innerHTML).not.toContain("hud-admin-link");
    cleanup();

    adminCtx = baseCtx("signed_in_non_admin");
    renderHud();
    openAccountMenu();
    await screen.findByRole("menu");
    expect(menuItemNames()).toEqual(guestItems);
    expect(document.body.innerHTML).not.toContain("hud-admin-link");
  });

  it("has an accessible name containing Admin and exposes no identity or counts", async () => {
    adminCtx = baseCtx("authorized");
    renderHud();
    openAccountMenu();
    const link = await screen.findByTestId("hud-admin-link");
    expect(link.textContent).toBe("Admin");
    expect(document.body.textContent).not.toContain("admin@mogzy.lol");
    expect(document.body.textContent).not.toContain("u1");
  });

  it("sits in the always-visible account menu, so it is usable at mobile widths", async () => {
    adminCtx = baseCtx("authorized");
    renderHud();
    openAccountMenu();
    const link = await screen.findByTestId("hud-admin-link");
    // Neither the item (portal content) nor the trigger that reveals it lives
    // inside a width-gated block — the entry point exists at every width.
    expect(link.closest("div.hidden")).toBeNull();
    expect(link.closest("[class*='sm:hidden']")).toBeNull();
    const trigger = screen.getByTestId("hud-account-trigger");
    expect(trigger.closest("div.hidden")).toBeNull();
    expect(trigger.closest("[class*='sm:hidden']")).toBeNull();
  });
});

describe("GlobalHud guest signup affordances (replaced the /lol banner)", () => {
  const anon = { id: "anon1", is_anonymous: true };

  it("shows the signup chip to anonymous visitors, returning them to the page they left", () => {
    adminCtx = baseCtx("signed_out");
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
    adminCtx = baseCtx("signed_out");
    authUser = null;
    renderHud();
    expect(screen.getByTestId("hud-signup-chip")).toBeTruthy();
  });

  it("hides the chip and the menu entry from authenticated accounts", async () => {
    adminCtx = baseCtx("signed_in_non_admin");
    authUser = { id: "u2" };
    renderHud();
    expect(screen.queryByTestId("hud-signup-chip")).toBeNull();
    openAccountMenu();
    await screen.findByRole("menu");
    expect(screen.queryByTestId("hud-signup-menu-item")).toBeNull();
    // The quiet account chrome is unchanged for real accounts.
    expect(screen.getByRole("menuitem", { name: /profile/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeTruthy();
  });

  it("gives anonymous visitors a signup menu entry without disturbing the admin contract", async () => {
    adminCtx = baseCtx("signed_out");
    authUser = anon;
    renderHud("/quiz");
    openAccountMenu();
    const item = await screen.findByTestId("hud-signup-menu-item");
    expect(item.getAttribute("href")).toBe(
      "/auth?mode=signup&returnTo=%2Fquiz",
    );
    expect(item.textContent).toContain("Sign up free");
    expect(item.textContent).toContain("Save your XP, streaks, and progress.");
    // Being a guest never conjures the Admin item.
    expect(screen.queryByTestId("hud-admin-link")).toBeNull();
  });

  it("tracks both signup CTAs through the existing funnel with the encoded returnTo", async () => {
    adminCtx = baseCtx("signed_out");
    authUser = anon;
    renderHud("/lol");
    fireEvent.click(screen.getByTestId("hud-signup-chip"));
    expect(funnel.trackFunnelEvent).toHaveBeenCalledWith(
      "hud_signup_chip_clicked",
      { returnTo: "/lol" },
    );

    // Fresh render for the menu CTA: the chip click above already navigated
    // the MemoryRouter away from /lol, and returnTo must reflect the page
    // the click actually happened on.
    cleanup();
    renderHud("/lol");
    openAccountMenu();
    fireEvent.click(await screen.findByTestId("hud-signup-menu-item"));
    expect(funnel.trackFunnelEvent).toHaveBeenCalledWith(
      "hud_signup_menu_clicked",
      { returnTo: "/lol" },
    );
  });
});
