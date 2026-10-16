/**
 * ACADEMY CORE V2 — the `/lol#academy-commons` deep link.
 *
 * The Commons has carried `id="academy-commons"` for a long time, but the
 * browser's fragment scroll fires before this lazily loaded page mounts, so
 * the link used to land on the Hall. The Hall now honours the fragment once
 * on mount through its own fold navigation. Mocks mirror LolHub.test.tsx.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LolHub from "./LolHub";
import { installLocalStorageStub } from "@/test/localStorageStub";

installLocalStorageStub();

vi.mock("@/lib/hub/academy-hub-warm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hub/academy-hub-warm")>()),
  warmAcademyHub: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/hooks/useChampionAssets", () => ({
  useChampionAssets: () => ({ data: null }),
  getChampionCutout: () => null,
  getChampionSplash: () => null,
  getChampionLoading: () => null,
}));
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", async () => {
  const { INITIAL_BROADCAST_FEED } = await vi.importActual<
    typeof import("@/components/lol/broadcast/broadcast-content")
  >("@/components/lol/broadcast/broadcast-content");
  return { usePatchBriefFeed: () => INITIAL_BROADCAST_FEED };
});
vi.mock("@/lib/lol/academy-updates-store", () => ({ listPublishedUpdates: vi.fn() }));
vi.mock("@/components/ads/AdSlot", () => ({ default: () => null }));
vi.mock("@/hooks/useAppSettings", async () => {
  const { DEFAULT_PLATFORM_POLICY } = await vi.importActual<
    typeof import("@/lib/platform-policy/policy")
  >("@/lib/platform-policy/policy");
  return {
    useAppSettings: () => ({
      loading: false,
      settings: { policy: { ...DEFAULT_PLATFORM_POLICY, academy: { updatesEnabled: false } } },
    }),
  };
});
vi.mock("@/components/lol/LolPopoutStyleToggle", () => ({ default: () => null }));
vi.mock("@/lib/funnel-analytics", () => ({ trackFunnelEvent: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ useSurfaceEvent: vi.fn() }));
vi.mock("@/lib/audio/usePlaySfx", () => ({ usePlaySfx: () => ({ play: vi.fn() }) }));
vi.mock("@/lib/audio/useSfx", () => ({ useSfx: () => ({ play: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select: () => b, eq: () => b, maybeSingle: () => b,
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
  });
  return { supabase: { from: () => b, auth: { signInAnonymously: vi.fn() } } };
});

function renderHub(entry: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <LolHub />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const scrolled: Element[] = [];
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
  scrolled.length = 0;
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) { scrolled.push(this); };
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
});
afterEach(() => {
  Element.prototype.scrollIntoView = original;
  vi.restoreAllMocks();
});

describe("/lol#academy-commons", () => {
  it("scrolls the Commons into view once the Hall has mounted", async () => {
    await act(async () => { renderHub("/lol#academy-commons"); });
    const commons = scrolled.find((el) => el.getAttribute("data-hub-screen") === "commons");
    expect(commons, "the Commons section was scrolled into view").toBeTruthy();
    expect(commons?.id).toBe("academy-commons");
  });

  it("leaves a plain /lol visit exactly as it was (no scroll)", async () => {
    await act(async () => { renderHub("/lol"); });
    expect(scrolled.filter((el) => el.getAttribute("data-hub-screen") === "commons")).toHaveLength(0);
  });
});
