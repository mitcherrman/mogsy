/**
 * The hub's library painting is the largest thing on the page. It used to ship
 * as two <img> elements with one hidden by CSS, so every phone downloaded the
 * desktop painting as well as its own. A <picture> lets the browser resolve the
 * breakpoint itself and fetch exactly one file.
 *
 * Note on scope: jsdom does not implement <picture> source selection, so these
 * assert the markup contract the browser acts on — one candidate per breakpoint,
 * one <img> — rather than the resulting network request. The real request split
 * is verified in the browser.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LolHub from "./LolHub";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", is_anonymous: false }, loading: false }),
}));
vi.mock("@/hooks/blog/useBlogPosts", () => ({
  useBlogList: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionCutout: () => null,
  getChampionSplash: () => null,
  getChampionLoading: () => null,
}));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
vi.mock("@/components/lol/LolWelcomeIntro", () => ({ default: () => null }));
vi.mock("@/components/lol/LolPopoutStyleToggle", () => ({ default: () => null }));
vi.mock("@/hooks/useAppSettings", () => ({
  useAppSettings: () => ({
    loading: false,
    settings: {
      policy: {
        combatSim: { tokensRequiredForNonPro: true },
        tutorial: { autoPopupEnabled: true, completionRequiredForNewUsers: true },
      },
    },
  }),
}));
vi.mock("@/hooks/useRankedTutorialStatus", () => ({
  useRankedTutorialStatus: () => ({
    loading: false,
    error: false,
    completed: true,
    required: false,
    refresh: vi.fn(),
    completeTutorial: vi.fn(),
  }),
}));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/ui-sfx", () => ({ playUiSfx: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b,
    eq: () => b,
    maybeSingle: () => b,
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
  });
  return { supabase: { from: () => b, auth: { signInAnonymously: vi.fn() } } };
});

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/lol"]}>
        <LolHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(cleanup);

const backgroundImg = () => screen.getByTestId("academy-library-background") as HTMLImageElement;

describe("the hub requests one library background, not two", () => {
  it("renders a single <img> for the painting", () => {
    renderHub();
    const picture = backgroundImg().closest("picture");
    expect(picture).not.toBeNull();
    expect(picture!.querySelectorAll("img")).toHaveLength(1);
  });

  it("offers the desktop painting only above the md breakpoint", () => {
    renderHub();
    const sources = backgroundImg().closest("picture")!.querySelectorAll("source");
    expect(sources[0].getAttribute("media")).toBe("(min-width: 768px)");
    expect(sources[0].getAttribute("srcset")).toContain("academy-library-desktop");
  });

  it("offers the mobile painting only below the md breakpoint", () => {
    renderHub();
    const sources = backgroundImg().closest("picture")!.querySelectorAll("source");
    expect(sources[1].getAttribute("media")).toBe("(max-width: 767px)");
    expect(sources[1].getAttribute("srcset")).toContain("academy-library-mobile");
  });

  it("declares the breakpoints exhaustively so a painting always wins", () => {
    renderHub();
    const media = [...backgroundImg().closest("picture")!.querySelectorAll("source")].map((s) =>
      s.getAttribute("media"),
    );
    expect(media).toEqual(["(min-width: 768px)", "(max-width: 767px)"]);
  });

  it("never puts a real painting in the <img> fallback", () => {
    // React assigns `src` while the <img> is still detached from the <picture>,
    // so a real file here downloads before source selection can run — the exact
    // double-fetch this markup exists to prevent.
    renderHub();
    const src = backgroundImg().getAttribute("src") ?? "";
    expect(src.startsWith("data:image/")).toBe(true);
    expect(src).not.toContain("academy-library");
  });

  it("no longer hides a second full-size painting with CSS", () => {
    const { container } = renderHub();
    const libraryImgs = [...container.querySelectorAll("img")].filter((i) =>
      (i.getAttribute("src") ?? "").includes("academy-library"),
    );
    expect(libraryImgs).toHaveLength(0);
    expect(container.querySelectorAll(".md\\:hidden.absolute.inset-0")).toHaveLength(0);
  });
});

describe("the painting is treated as the hub's largest visual", () => {
  it("loads eagerly at high priority", () => {
    renderHub();
    const img = backgroundImg();
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("keeps the per-breakpoint crop", () => {
    renderHub();
    const cls = backgroundImg().className;
    expect(cls).toContain("object-cover");
    expect(cls).toContain("object-top");
    expect(cls).toContain("md:[object-position:center_72%]");
  });
});

describe("the hub holds its geometry before the painting decodes", () => {
  it("reserves the full viewport for the above-the-fold section", () => {
    renderHub();
    const section = backgroundImg().closest("section")!;
    expect(section.className).toContain("md:min-h-[calc(100dvh-var(--app-header-h))]");
    expect(section.className).toContain("relative");
  });

  it("keeps the painting out of flow so it cannot push content", () => {
    renderHub();
    expect(backgroundImg().className).toContain("absolute");
  });
});
