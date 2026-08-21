import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  authLoading: false,
  requireAuth: true,
  settingsLoading: false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mocks.user, loading: mocks.authLoading }),
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    settings: { require_auth: mocks.requireAuth },
    loading: mocks.settingsLoading,
  }),
}));

import ProtectedRoute from "./ProtectedRoute";

/**
 * Stands in for the /auth page and echoes the search string the guard sent it,
 * so each case can assert the exact returnTo that was preserved.
 */
function Probe() {
  const loc = useLocation();
  return <div data-testid="auth-page" data-search={loc.search} />;
}

const renderWithProbe = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/auth" element={<Probe />} />
        <Route
          path="*"
          element={
            <ProtectedRoute>
              <div data-testid="protected">secret</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  cleanup();
  mocks.user = null;
  mocks.authLoading = false;
  mocks.settingsLoading = false;
  mocks.requireAuth = true;
});

describe("ProtectedRoute — AUTH1 destination preservation", () => {
  it("carries the blocked deep link through as returnTo", () => {
    renderWithProbe("/profile");
    expect(screen.getByTestId("auth-page").getAttribute("data-search")).toBe(
      "?returnTo=%2Fprofile",
    );
  });

  it("preserves query parameters, which are part of the destination", () => {
    renderWithProbe("/quiz/stat-check/room/AB12?spectate=1");
    expect(screen.getByTestId("auth-page").getAttribute("data-search")).toBe(
      "?returnTo=%2Fquiz%2Fstat-check%2Froom%2FAB12%3Fspectate%3D1",
    );
  });

  it("preserves a hash fragment too", () => {
    renderWithProbe("/lol/docs/champions/ahri#abilities");
    expect(screen.getByTestId("auth-page").getAttribute("data-search")).toBe(
      "?returnTo=%2Flol%2Fdocs%2Fchampions%2Fahri%23abilities",
    );
  });

  it("lets an authenticated user straight through", () => {
    mocks.user = { id: "u1" };
    renderWithProbe("/profile");
    expect(screen.getByTestId("protected")).toBeTruthy();
  });

  it("lets everyone through when auth is not required at all", () => {
    mocks.requireAuth = false;
    renderWithProbe("/profile");
    expect(screen.getByTestId("protected")).toBeTruthy();
  });

  it("decides nothing while auth or settings are still loading", () => {
    mocks.authLoading = true;
    renderWithProbe("/profile");
    expect(screen.queryByTestId("auth-page")).toBeNull();
    expect(screen.queryByTestId("protected")).toBeNull();
  });
});
