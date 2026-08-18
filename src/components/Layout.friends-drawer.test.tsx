/**
 * The friends drawer is a floating overlay. It belongs on ordinary League
 * pages, but never on a full-bleed Stat Check gameplay surface, where it would
 * sit on top of the tabletop and its trigger would compete with the board for
 * clicks.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

vi.mock("./FloatingFriendsButton", () => ({
  default: () => <div data-testid="friends-drawer" />,
}));

// Chrome that is irrelevant to this behaviour and does its own data fetching.
vi.mock("./hud/GlobalHud", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./ThemeOverlay", () => ({ default: () => null }));
vi.mock("./FloatingThemeSwitcher", () => ({ default: () => null }));
vi.mock("./FloatingScrollButton", () => ({ default: () => null }));
vi.mock("./HextechAmbience", () => ({ default: () => null }));
vi.mock("./TutorialTipPopup", () => ({ default: () => null }));

vi.mock("@/hooks/useTrackActivity", () => ({ useTrackActivity: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { require_auth: false }, loading: false }),
}));
vi.mock("@/hooks/useSitewideTheme", () => ({
  useSitewideTheme: () => ({
    theme: { styles: {} },
    themeId: "default",
    visualThemeId: "default",
    isEnabled: false,
    isCycleFading: false,
  }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchLikelyRoutes: () => {} }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("friends drawer placement", () => {
  it("renders on an ordinary League page", () => {
    renderAt("/lol");
    expect(screen.queryByTestId("friends-drawer")).not.toBeNull();
  });

  it("is suppressed on the live Stat Check room surface", () => {
    renderAt("/quiz/stat-check/room/ABCD12");
    expect(screen.queryByTestId("friends-drawer")).toBeNull();
  });

  it("is suppressed on the Stat Check mode-select entrance", () => {
    renderAt("/quiz/stat-check");
    expect(screen.queryByTestId("friends-drawer")).toBeNull();
  });

  it("is suppressed on the Stat Check dev tabletop", () => {
    renderAt("/dev/stat-check");
    expect(screen.queryByTestId("friends-drawer")).toBeNull();
  });
});
