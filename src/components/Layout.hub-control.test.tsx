/**
 * The shell renders a "League Hub" back control on every LoL sub-route. Combat
 * Lab now carries that control inline in its own compact page header, so the
 * shell must not also render one there — two would be a visible duplicate, and
 * the shell's mobile copy sits in normal flow, costing vertical space above the
 * simulator. Its sub-routes keep the shell control.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

// Chrome that is irrelevant to this behaviour and does its own data fetching.
vi.mock("./Navbar", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./ThemeOverlay", () => ({ default: () => null }));
vi.mock("./FloatingThemeSwitcher", () => ({ default: () => null }));
vi.mock("./FloatingScrollButton", () => ({ default: () => null }));
vi.mock("./FloatingFriendsButton", () => ({ default: () => null }));
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

const hubControls = () => screen.queryAllByLabelText("Back to League hub");

describe("shell League Hub control", () => {
  it("renders on an ordinary League sub-page", () => {
    renderAt("/lol/docs");
    expect(hubControls().length).toBeGreaterThan(0);
  });

  it("is suppressed on Combat Lab, which renders its own inline control", () => {
    renderAt("/combat-lab");
    expect(hubControls()).toHaveLength(0);
  });

  it("still renders on Combat Lab sub-routes", () => {
    renderAt("/combat-lab/diagnostics");
    expect(hubControls().length).toBeGreaterThan(0);
  });

  it("is still absent on the hub itself", () => {
    renderAt("/lol");
    expect(hubControls()).toHaveLength(0);
  });
});
