/**
 * PT2E — the profile theme renders on the profile, and stays there.
 *
 * `/user/:profileId` has rendered `custom_theme` across its hero, cards, stat
 * tiles and headings since it was written. In production it never got to:
 * LEAGUE_ONLY_MODE routes the read through `get_league_profiles()`, whose fixed
 * column list did not include `custom_theme`, so every visitor's profile fell
 * back to `default` however carefully they had chosen. The migration publishes
 * the column; this suite pins that the page uses it — and that using it does
 * not leak back out into the document.
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserProfile from "./UserProfile";
import { getThemeById } from "@/lib/profile-themes";

const db = vi.hoisted(() => ({
  profile: {} as Record<string, unknown>,
}));

vi.mock("@/components/SEOHead", () => ({ default: () => null }));
vi.mock("@/components/profile/LeaguePublicProfile", () => ({
  default: () => <div data-testid="league-public-profile" />,
}));
// The per-theme ambient animation. Rendering it is the point of the assertion
// below, so it is stubbed to something identifiable rather than to null.
vi.mock("@/components/ThemeOverlay", () => ({
  default: ({ themeId }: { themeId: string }) => (
    <div data-testid="theme-overlay" data-theme-id={themeId} />
  ),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "viewer-1" }, loading: false }),
}));
vi.mock("@/lib/quiz/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quiz/api")>();
  return {
    ...actual,
    quizApi: { ...actual.quizApi, getProgress: vi.fn(async () => ({ total_attempts: 0 })) },
  };
});

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const b: Record<string, unknown> = {};
    ["select", "eq", "in", "order", "limit", "gt", "not", "neq", "is", "or"]
      .forEach((m) => (b[m] = () => b));
    b.single = async () => ({ data: null, error: null });
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve);
    return b;
  };
  return {
    supabase: {
      from: () => builder(),
      rpc: async (fn: string) =>
        fn === "get_league_profiles"
          ? { data: [db.profile], error: null }
          : { data: [], error: null },
    },
  };
});

function renderProfile() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/user/profile-1"]}>
        <Routes>
          <Route path="/user/:profileId" element={<UserProfile />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seedProfile(custom_theme: string | null) {
  db.profile = {
    id: "profile-1",
    display_name: "Ashe",
    avatar_url: null,
    profile_frame: null,
    is_pro: true,
    is_bot: false,
    is_anonymous: false,
    is_disabled: false,
    created_at: "2026-01-15T00:00:00Z",
    custom_theme,
  };
}

beforeEach(() => { document.documentElement.className = "dark"; });
afterEach(() => { cleanup(); document.documentElement.className = ""; });

describe("profile theme rendering", () => {
  it("applies the theme's own tokens across the profile card, not the default's", async () => {
    // NOTE: the page-background half of a theme (`styles.pageBg`) is an inline
    // gradient, and jsdom's cssstyle drops a gradient from the `background`
    // shorthand outright — the attribute comes back empty for any element
    // React gave one to. So the page-wide claim is asserted through the
    // class-level tokens, which cover the hero, the cards and the stat tiles.
    seedProfile("royal");
    const { container } = renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());

    const royal = getThemeById("royal");
    const dflt = getThemeById("default");
    for (const token of ["heroBg", "nameColor", "mutedColor", "accentRing", "iconAccent"] as const) {
      const cls = royal.styles[token].split(/\s+/).filter(Boolean)[0];
      expect(cls, `royal.${token} must be set to assert on`).toBeTruthy();
      expect(royal.styles[token], `royal.${token} must differ from default`)
        .not.toBe(dflt.styles[token]);
      expect(container.innerHTML, `${token} (${cls}) is not rendered`).toContain(cls);
    }
  });

  it("passes the stored theme to the ambient overlay", async () => {
    seedProfile("cyberpunk");
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    expect(screen.getByTestId("theme-overlay").getAttribute("data-theme-id"))
      .toBe("cyberpunk");
  });

  it("falls back to default when the profile carries no theme", async () => {
    seedProfile(null);
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    expect(screen.getByTestId("theme-overlay").getAttribute("data-theme-id"))
      .toBe("default");
  });

  it("falls back to default — not to an empty theme — on an unknown id", async () => {
    // `getThemeById` used to return `profileThemes[0]`, which was the Cycle All
    // entry: every style token an empty string, so an unrecognised value
    // rendered a profile with no tokens at all rather than the default look.
    seedProfile("a-theme-that-was-deleted");
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    expect(screen.getByTestId("theme-overlay").getAttribute("data-theme-id"))
      .toBe("default");
  });

  it("mutates no root theme class while rendering a themed profile", async () => {
    // A profile theme is profile decoration. Viewing someone's Cyberpunk
    // profile must not recolour the viewer's application.
    seedProfile("cyberpunk");
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    expect(document.documentElement.className).toBe("dark");
    expect(Array.from(document.documentElement.classList)
      .filter((c) => c.startsWith("theme-"))).toEqual([]);
  });

  it("reads the theme from the League contract RPC, not a widened table select", async () => {
    seedProfile("aurora");
    renderProfile();
    await waitFor(() => expect(screen.getByText("Ashe")).toBeTruthy());
    // The fixture serves custom_theme ONLY through get_league_profiles; if the
    // page had gone back to a direct profiles/public_profiles read it would
    // have received nothing and fallen back to default.
    expect(screen.getByTestId("theme-overlay").getAttribute("data-theme-id"))
      .toBe("aurora");
  });
});
