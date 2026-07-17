import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { AdminAuthContextValue, AdminAuthStatus } from "@/lib/admin-auth/types";

// Reuse the established admin-auth mock recipe (AdminAuthGate.test.tsx): the
// Navbar reads the real useAdminAuth contract against a controlled context —
// no parallel authorization model.
let adminCtx: AdminAuthContextValue;
vi.mock("@/lib/admin-auth/AdminAuthProvider", () => ({
  useAdminAuth: () => adminCtx,
}));

let authUser: { id: string; is_anonymous?: boolean } | null = null;
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authUser, signOut: vi.fn() }) }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { nav_tab_mode: "play" } }),
}));
vi.mock("@/hooks/useFriends", () => ({ useFriends: () => ({ pendingRequests: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
    }),
  },
}));
vi.mock("./NavBanner", () => ({ default: () => <div data-testid="nav-banner" /> }));
vi.mock("./UserNotificationBell", () => ({
  default: () => <div data-testid="notification-bell" />,
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));

import Navbar from "./Navbar";
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

const renderNavbar = () =>
  render(
    <MemoryRouter initialEntries={["/lol"]}>
      <Navbar />
    </MemoryRouter>,
  );

const adminLink = () => screen.queryByRole("link", { name: "Admin" });

afterEach(cleanup);

describe("Navbar admin entry point", () => {
  it("shows an Admin link targeting the directory for an authorized admin", () => {
    adminCtx = baseCtx("authorized");
    authUser = { id: "u1" };
    renderNavbar();
    const link = adminLink();
    expect(link).toBeTruthy();
    // Consistency: the Navbar must use the exported registry constant.
    expect(link?.getAttribute("href")).toBe(ADMIN_DIRECTORY_PATH);
    expect(ADMIN_DIRECTORY_PATH).toBe("/admin/directory");
  });

  it("does not render the link for a guest", () => {
    adminCtx = baseCtx("signed_out");
    authUser = null;
    renderNavbar();
    expect(adminLink()).toBeNull();
    expect(screen.queryByTestId("navbar-admin-link")).toBeNull();
  });

  it("does not render the link for an authenticated non-admin", () => {
    adminCtx = baseCtx("signed_in_non_admin");
    authUser = { id: "u2" };
    renderNavbar();
    expect(adminLink()).toBeNull();
  });

  it("does not render the link (or any placeholder) during unresolved auth", () => {
    for (const status of ["loading", "checking"] as const) {
      adminCtx = baseCtx(status);
      authUser = { id: "u1" };
      renderNavbar();
      expect(adminLink()).toBeNull();
      expect(screen.queryByTestId("navbar-admin-link")).toBeNull();
      cleanup();
    }
  });

  it("does not render the link for expired, unavailable, malformed, or rejected states", () => {
    for (const status of [
      "expired_session",
      "backend_unavailable",
      "malformed_response",
      "fallback_rejected",
    ] as const) {
      adminCtx = baseCtx(status);
      authUser = { id: "u1" };
      renderNavbar();
      expect(adminLink()).toBeNull();
      cleanup();
    }
  });

  it("keeps existing notification and navigation controls rendering", () => {
    adminCtx = baseCtx("signed_out");
    authUser = null;
    renderNavbar();
    expect(screen.getByTestId("notification-bell")).toBeTruthy();
    // League-only nav items render in both desktop and mobile blocks.
    expect(screen.getAllByRole("link", { name: /home/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /quiz/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /profile/i }).length).toBeGreaterThan(0);
  });

  it("renders identical public chrome for guest and non-admin (no layout change)", () => {
    adminCtx = baseCtx("signed_out");
    authUser = null;
    const guest = renderNavbar().container.innerHTML;
    cleanup();
    adminCtx = baseCtx("signed_in_non_admin");
    const nonAdmin = renderNavbar().container.innerHTML;
    expect(nonAdmin).toBe(guest);
    expect(guest).not.toContain("navbar-admin-link");
  });

  it("has an accessible name containing Admin and exposes no identity or counts", () => {
    adminCtx = baseCtx("authorized");
    authUser = { id: "u1" };
    renderNavbar();
    const link = screen.getByRole("link", { name: "Admin" });
    expect(link.textContent).toBe("Admin");
    expect(document.body.textContent).not.toContain("admin@mogzy.lol");
    expect(document.body.textContent).not.toContain("u1");
  });

  it("sits in the always-visible top-bar cluster, so it is usable at mobile widths", () => {
    adminCtx = baseCtx("authorized");
    authUser = { id: "u1" };
    renderNavbar();
    const link = screen.getByTestId("navbar-admin-link");
    // Not inside the desktop-only (hidden sm:flex) nav-item block and not
    // inside the mobile-only (sm:hidden) bottom bar — visible at all widths.
    expect(link.closest("div.hidden")).toBeNull();
    expect(link.closest("[class*='sm:hidden']")).toBeNull();
    // The text label may collapse responsively, but the aria-label keeps the
    // accessible name at every width.
    expect(link.getAttribute("aria-label")).toBe("Admin");
  });
});
