/**
 * The shell's auth/app-settings gate is unchanged policy — nothing inside
 * <Layout> renders until both resolve. What changed is what the visitor looks
 * at while that happens: the destination route's own shell instead of a
 * full-screen pulsing wordmark.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";
import { LOL_BASE_BG } from "@/lib/startup-shell";

const state = vi.hoisted(() => ({ authLoading: false, settingsLoading: false }));
const prefetched = vi.hoisted(() => ({ calls: [] as string[][] }));

vi.mock("./hud/GlobalHud", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./ThemeOverlay", () => ({ default: () => null }));
vi.mock("./FloatingThemeSwitcher", () => ({ default: () => null }));
vi.mock("./FloatingScrollButton", () => ({ default: () => null }));
vi.mock("./FloatingFriendsButton", () => ({ default: () => null }));
vi.mock("./HextechAmbience", () => ({ default: () => null }));
vi.mock("./TutorialTipPopup", () => ({ default: () => null }));

vi.mock("@/hooks/useTrackActivity", () => ({ useTrackActivity: () => {} }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, loading: state.authLoading }),
}));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: {}, loading: state.settingsLoading }),
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
vi.mock("@/lib/route-prefetch", () => ({
  prefetchLikelyRoutes: (paths: string[]) => prefetched.calls.push(paths),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={<div>page content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.authLoading = false;
  state.settingsLoading = false;
  prefetched.calls = [];
  document.documentElement.className = "";
});

afterEach(cleanup);

describe("the boot gate keeps its policy", () => {
  it("renders no page content while auth is still resolving", () => {
    state.authLoading = true;
    renderAt("/lol");
    expect(screen.queryByText("page content")).toBeNull();
    expect(screen.queryByTestId("navbar")).toBeNull();
  });

  it("renders no page content while app settings are still resolving", () => {
    state.settingsLoading = true;
    renderAt("/lol");
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("renders the page once both have resolved", () => {
    renderAt("/lol");
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});

describe("what the gate shows instead", () => {
  it("shows no legacy wordmark and nothing animated on any startup path", () => {
    for (const path of ["/lol", "/lol/docs", "/settings"]) {
      state.authLoading = true;
      const { container } = renderAt(path);
      expect(container.innerHTML).not.toContain("mogsy-logo-text.png");
      expect(container.innerHTML).not.toMatch(/animate-|animation:/);
      cleanup();
    }
  });

  it("paints the League base colour on a direct /lol hit", () => {
    state.authLoading = true;
    const { container } = renderAt("/lol");
    const surface = container.querySelector("[data-startup-surface]") as HTMLElement;
    expect(surface).not.toBeNull();
    expect(surface.style.background).toBe("rgb(6, 12, 20)"); // LOL_BASE_BG
    expect(LOL_BASE_BG).toBe("#060c14");
  });

  it("draws no hub geometry while the gate is closed", () => {
    state.authLoading = true;
    const { container } = renderAt("/lol");
    const surface = container.querySelector("[data-startup-surface]") as HTMLElement;
    // No book outlines, heading band, navbar bar or mascot silhouette — the
    // visitor must not watch the hub assemble out of empty boxes.
    expect(surface.childElementCount).toBe(0);
    expect(container.querySelectorAll("[data-shell-book]")).toHaveLength(0);
    expect(container.querySelectorAll("img, svg, header, nav")).toHaveLength(0);
  });

  it("exposes no user-specific content and no loading announcement", () => {
    state.authLoading = true;
    const { container } = renderAt("/lol");
    expect(container.querySelectorAll("a, button, input")).toHaveLength(0);
    expect((container.textContent ?? "").trim()).toBe("");
    expect(container.querySelector("[role='status']")).toBeNull();
  });
});

describe("route theme lands before paint", () => {
  it("applies the League theme even while the gate is still closed", () => {
    state.authLoading = true;
    renderAt("/lol");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(true);
  });

  it("does not force unrelated routes into the League theme", () => {
    renderAt("/settings");
    expect(document.documentElement.classList.contains("theme-lol")).toBe(false);
  });
});

describe("startup prefetching", () => {
  it("does not warm routes that only redirect to the hub in League-only mode", () => {
    renderAt("/lol");
    const warmed = prefetched.calls.flat();
    for (const dead of ["/home", "/play", "/swipe", "/shop"]) {
      expect(warmed).not.toContain(dead);
    }
  });

  it("still warms routes that remain reachable", () => {
    renderAt("/lol");
    expect(prefetched.calls.flat()).toContain("/profile");
  });
});
