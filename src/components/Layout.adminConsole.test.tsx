/**
 * The Admin Quiz Review console is a full-bleed work surface.
 *
 * Two things follow from that and are asserted here, because both were real
 * defects the first time the route escaped the reading column:
 *   1. it must not be capped by the centred `max-w-7xl` column — that cap was
 *      leaving it 1216px wide on a 1920px display;
 *   2. the shell's two floating overlays must not render over it — they sit in
 *      the exact bottom corners the console puts pagination and the detail
 *      panel in.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

vi.mock("./FloatingFriendsButton", () => ({
  default: () => <div data-testid="friends-drawer" />,
}));
vi.mock("./FloatingThemeSwitcher", () => ({
  default: () => <div data-testid="theme-switcher" />,
}));

vi.mock("./hud/GlobalHud", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./ThemeOverlay", () => ({ default: () => null }));
vi.mock("./HextechAmbience", () => ({ default: () => null }));
vi.mock("./TutorialTipPopup", () => ({ default: () => null }));

vi.mock("@/hooks/useTrackActivity", () => ({ useTrackActivity: () => {} }));
vi.mock("@/hooks/useSocialSync", () => ({ useSocialSync: () => {} }));
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

const main = () => document.querySelector("main") as HTMLElement;

afterEach(cleanup);

describe("Admin Quiz Review console shell", () => {
  it("escapes the centred reading column", () => {
    renderAt("/admin/quiz-content");
    expect(main().className).not.toContain("max-w-7xl");
  });

  it("leaves every other admin page in the reading column", () => {
    renderAt("/admin/people");
    expect(main().className).toContain("max-w-7xl");
  });

  it("suppresses both floating overlays over the console", () => {
    renderAt("/admin/quiz-content");
    expect(screen.queryByTestId("friends-drawer")).toBeNull();
    expect(screen.queryByTestId("theme-switcher")).toBeNull();
  });

  it("keeps both overlays on an ordinary admin page", () => {
    renderAt("/admin/people");
    expect(screen.queryByTestId("friends-drawer")).not.toBeNull();
    expect(screen.queryByTestId("theme-switcher")).not.toBeNull();
  });
});
