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
 *
 * RFB — THE CORNER NOW HAS TWO OCCUPANTS, ON PURPOSE.
 * The question reporter moved from the bottom-right to the bottom-LEFT, to
 * mirror Ranked Rules across the viewport. So the rule this file guards is no
 * longer "exactly one control down there" — it is that nothing lands on the
 * Community button's OWN coordinates. The dock gets the corner floor and the
 * Community trigger is lifted clear of it (`lifted`) for exactly as long as a
 * reporter is registered there, which on every non-quiz route is never.
 *
 * The lift is a class swap, which jsdom CAN see, so the mock below renders the
 * real one rather than a fixed string — otherwise this file would keep passing
 * while the two controls sat on top of each other in a browser.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";

vi.mock("./FloatingFriendsButton", () => ({
  default: ({ lifted = false }: { lifted?: boolean }) => (
    <div
      data-testid="friends-drawer"
      data-lifted={lifted ? "true" : "false"}
      className={`fixed left-6 z-40 ${lifted ? "bottom-20" : "bottom-6"}`}
    />
  ),
}));
vi.mock("./hud/GlobalHud", () => ({ default: () => null }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./HextechAmbience", () => ({ default: () => null }));
vi.mock("./TutorialTipPopup", () => ({ default: () => null }));

vi.mock("@/hooks/useTrackActivity", () => ({ useTrackActivity: () => {} }));
vi.mock("@/hooks/useSocialSync", () => ({ useSocialSync: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: { require_auth: false }, loading: false }),
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

/* Token-based and not a /fixed\s+bottom-6\s+left-6/ regex: the Community
   button's class list is now built conditionally (`bottom-6` vs `bottom-20`),
   so the tokens no longer appear in source order. An order-dependent matcher
   would silently stop matching the very control it exists to find and report
   an empty corner as a pass. */
const isBottomLeft = (el: HTMLElement) => {
  const tokens = (el.className || "").split(/\s+/);
  return ["fixed", "bottom-6", "left-6"].every(t => tokens.includes(t));
};

describe("nothing lands on the Community button's coordinates", () => {
  it("mounts no second control at bottom-6/left-6 alongside the Community button", () => {
    const { container } = renderAt("/quiz");
    const corner = Array.from(container.querySelectorAll<HTMLElement>("*")).filter((el) =>
      isBottomLeft(el),
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
      isBottomLeft(el),
    );
    expect(corner).toHaveLength(0);
  });
});

describe("the reporter's corner and the Community button share it by height", () => {
  it("leaves the Community button at its own coordinates while nothing is docked left", () => {
    // /quiz publishes no question, so the reporter renders nothing and the
    // left dock is empty. The button must not drift on ordinary routes — the
    // lift is paid for only where it is needed.
    renderAt("/quiz");
    expect(screen.getByTestId("friends-drawer").dataset.lifted).toBe("false");
    expect(screen.getByTestId("friends-drawer").className).toContain("bottom-6");
  });

  it("mounts the dock's left anchor, which is what the reporter portals into", () => {
    // The shell renders both halves of the mirrored pair unconditionally, so
    // no route can be missing one of them.
    renderAt("/quiz");
    expect(screen.getByTestId("mogzy-dock-left")).toBeInTheDocument();
    expect(screen.getByTestId("mogzy-dock-right")).toBeInTheDocument();
  });

  it("keeps the left anchor off the Community button's exact coordinates", () => {
    // The anchor sits at bottom-4/left-3, not bottom-6/left-6: the two are
    // separated in HEIGHT by the lift, not by being in different corners.
    renderAt("/quiz");
    const anchor = screen.getByTestId("mogzy-dock-left");
    expect(isBottomLeft(anchor)).toBe(false);
    expect(anchor.className).toContain("left-3");
  });
});
