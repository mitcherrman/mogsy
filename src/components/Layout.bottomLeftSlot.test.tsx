/**
 * COM1-2B — the bottom-left slot belongs to the Community button.
 *
 * WHAT WAS WRONG. Layout mounted `<FloatingScrollButton />` unconditionally at
 * `fixed bottom-6 left-6 z-[60]` — the Community trigger's exact coordinates,
 * one stacking layer above its `z-40` — and it appeared on any page taller than
 * the viewport + 200px. On desktop it covered the Community button outright.
 *
 * The component was a legacy Mogzy page-scroll helper: two `window.scrollTo`
 * calls, to the top and to the bottom. Nothing about ordinary scrolling depended
 * on it — it was a duplicate of Home/End and of the browser's own scrollbar —
 * so it was deleted rather than relocated.
 *
 * These tests are the regression guard for the deletion, not for the overlap:
 * jsdom has no layout, so "does it cover the button" is not observable here.
 * What IS observable, and what actually broke, is that Layout mounted a second
 * fixed control into the same corner.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

vi.mock("./FloatingFriendsButton", () => ({
  default: () => <div data-testid="friends-drawer" className="fixed bottom-6 left-6 z-40" />,
}));
vi.mock("./hud/GlobalHud", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./ThemeOverlay", () => ({ default: () => null }));
vi.mock("./FloatingThemeSwitcher", () => ({ default: () => null }));
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
          <Route path="*" element={<div style={{ height: 5000 }}>tall page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

const BOTTOM_LEFT = /fixed\s+bottom-6\s+left-6/;

describe("the bottom-left corner has exactly one occupant", () => {
  it("mounts no second fixed bottom-left control alongside the Community button", () => {
    const { container } = renderAt("/quiz");
    const corner = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
      BOTTOM_LEFT.test(el.className || ""),
    );
    expect(corner).toHaveLength(1);
    expect(corner[0].getAttribute("data-testid")).toBe("friends-drawer");
  });

  it("renders no scroll control, however tall the page is", () => {
    renderAt("/quiz");
    // The legacy control revealed itself on scroll; it registered a `scroll`
    // listener at mount and rendered ArrowUp/ArrowDown once the document
    // exceeded the viewport by 200px. Nothing in the shell does that any more.
    window.dispatchEvent(new Event("scroll"));
    expect(screen.queryByTestId("floating-scroll-button")).toBeNull();
    expect(document.querySelector(".z-\\[60\\]")).toBeNull();
  });

  it("leaves the corner empty on a surface that suppresses the Community drawer", () => {
    // Stat Check gameplay hides the drawer. Nothing must take its place there.
    const { container } = renderAt("/quiz/stat-check/room/ABCD12");
    const corner = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
      BOTTOM_LEFT.test(el.className || ""),
    );
    expect(corner).toHaveLength(0);
  });
});
