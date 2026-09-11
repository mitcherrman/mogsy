/**
 * PT2E — the profile theme reaches the PROFILE, and nothing else.
 *
 * The legacy system wrote `theme-<profiles.custom_theme>` onto <html>, so a
 * user's chosen theme recoloured every surface whose path was not in the League
 * section. The modern surfaces escaped only because they own `theme-lol` and
 * the provider special-cased their paths — an arrangement that had already
 * failed once (Meta Reflex was missing from the path list and rendered in a
 * general Mogsy theme), and that left the Academy entrance, /welcome, the
 * Ranked tutorial, the blog and the admin console with no protection at all.
 *
 * This suite pins the replacement: Layout is the ONLY writer of a root theme
 * class, it writes exactly one class, and what it writes is a function of the
 * PATH alone. No user state can reach it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";
import { profileThemes } from "@/lib/profile-themes";

vi.mock("./hud/GlobalHud", () => ({ default: () => <nav data-testid="navbar" /> }));
vi.mock("./Footer", () => ({ default: () => null }));
vi.mock("./FloatingFriendsButton", () => ({ default: () => null }));
vi.mock("./HextechAmbience", () => ({ default: () => null }));
vi.mock("./TutorialTipPopup", () => ({ default: () => null }));
vi.mock("@/hooks/useTrackActivity", () => ({ useTrackActivity: () => {} }));
vi.mock("@/hooks/useSocialSync", () => ({ useSocialSync: () => {} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({ settings: {}, loading: false }),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchLikelyRoutes: () => {} }));

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

/** Drives `window.matchMedia("(prefers-color-scheme: dark)")`. */
const os = { prefersDark: true };

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: query.includes("prefers-color-scheme: dark") ? os.prefersDark : false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
}));

const rootThemeClasses = () =>
  Array.from(document.documentElement.classList).filter((c) => c.startsWith("theme-"));

/** Every surface the product direction says must keep its own design. */
const MODERN_LEAGUE_SURFACES = [
  "/lol",                      // Leaguecraft hub
  "/lol/tier-list",
  "/lol/mechanics",
  "/quiz",                     // Quiz
  "/quiz/ranked",              // Ranked
  "/quiz/daily-challenge",     // Daily
  "/combat-lab",               // Combat Lab
  "/league-swipe",             // Meta Reflex
];

/** Surfaces outside the League section that the legacy system DID recolour. */
const PREVIOUSLY_RECOLOURED = [
  "/",              // Academy entrance
  "/welcome",       // Academy introduction
  "/profile",
  "/user/abc",
  "/blog",
  "/settings",
  "/onboarding/ranked-tutorial",
];

beforeEach(() => {
  document.documentElement.className = "";
  os.prefersDark = true;
});
afterEach(() => { cleanup(); document.documentElement.className = ""; });

describe("root theme classes are a function of the path alone", () => {
  it("gives every modern League surface theme-lol and nothing else", () => {
    for (const path of MODERN_LEAGUE_SURFACES) {
      renderAt(path);
      expect(rootThemeClasses(), path).toEqual(["theme-lol"]);
      cleanup();
    }
  });

  it("gives every other surface NO theme class at all", () => {
    for (const path of PREVIOUSLY_RECOLOURED) {
      renderAt(path);
      expect(rootThemeClasses(), path).toEqual([]);
      cleanup();
    }
  });

  it("never writes a profile theme's class onto the root, on any path", () => {
    // The exact failure mode being retired: `theme-royal`, `theme-cyberpunk`,
    // `theme-midnight` … on <html>. `lol` is in the catalogue as a PROFILE
    // theme whose class name collides with the League surface class, so it is
    // checked against the non-League paths where a collision would be visible.
    const profileThemeClasses = profileThemes.map((t) => `theme-${t.id}`);
    for (const path of [...MODERN_LEAGUE_SURFACES, ...PREVIOUSLY_RECOLOURED]) {
      renderAt(path);
      for (const cls of rootThemeClasses()) {
        if (cls === "theme-lol" && path.startsWith("/lol")) continue;
        if (cls === "theme-lol" && MODERN_LEAGUE_SURFACES.includes(path)) continue;
        expect(profileThemeClasses, `${path} wrote ${cls}`).not.toContain(cls);
      }
      cleanup();
    }
  });

  it("scrubs a stale theme class left on the root by anything else", () => {
    document.documentElement.className = "dark theme-cyberpunk";
    renderAt("/profile");
    expect(rootThemeClasses()).toEqual([]);
  });

  it("hands theme-lol back cleanly when leaving and re-entering the League section", () => {
    renderAt("/lol");
    expect(rootThemeClasses()).toEqual(["theme-lol"]);
    cleanup();
    renderAt("/profile");
    expect(rootThemeClasses()).toEqual([]);
    cleanup();
    renderAt("/quiz/ranked");
    expect(rootThemeClasses()).toEqual(["theme-lol"]);
  });

});

/**
 * `dark` IS NOT PT2E's business.
 *
 * An early draft of this work made `dark` unconditional, on the argument that
 * the startup shell already paints a dark ground on every path. That is a real
 * observation, but it is a startup-shell question and settling it here would
 * have turned every general surface dark for light-OS visitors as a side effect
 * of retiring user themes. These cases pin the PRE-PT2E behaviour so the
 * argument cannot quietly win a second time: the League section forces `dark`,
 * and everything else follows the operating system.
 */
describe("dark mode follows the pre-PT2E rule, unchanged by this workstream", () => {
  it("forces dark inside the League section regardless of the OS", () => {
    for (const prefersDark of [true, false]) {
      os.prefersDark = prefersDark;
      for (const path of MODERN_LEAGUE_SURFACES) {
        renderAt(path);
        expect(document.documentElement.classList.contains("dark"),
          `${path} @ prefersDark=${prefersDark}`).toBe(true);
        cleanup();
      }
    }
  });

  it("follows the OS outside the League section", () => {
    for (const prefersDark of [true, false]) {
      os.prefersDark = prefersDark;
      for (const path of PREVIOUSLY_RECOLOURED) {
        renderAt(path);
        expect(document.documentElement.classList.contains("dark"),
          `${path} @ prefersDark=${prefersDark}`).toBe(prefersDark);
        cleanup();
      }
    }
  });

  it("drops dark again on leaving the League section for a light-OS visitor", () => {
    os.prefersDark = false;
    renderAt("/quiz/ranked");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    cleanup();
    renderAt("/profile");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("the retired sitewide furniture is gone", () => {
  it("mounts no floating theme switcher on any surface", () => {
    for (const path of [...MODERN_LEAGUE_SURFACES, ...PREVIOUSLY_RECOLOURED]) {
      renderAt(path);
      expect(screen.queryByTestId("theme-switcher"), path).toBeNull();
      cleanup();
    }
  });

  it("renders no cycle fade overlay", () => {
    // The fade-to-black that covered the whole viewport every cycle tick.
    renderAt("/profile");
    const blackOverlays = Array.from(document.querySelectorAll("div.bg-black.fixed"));
    expect(blackOverlays).toHaveLength(0);
  });
});
