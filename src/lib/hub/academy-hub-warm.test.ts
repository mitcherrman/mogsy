import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareImage: vi.fn((_url: string, _opts?: unknown) => Promise.resolve("ok")),
  prepareImages: vi.fn(),
  critical: null as null | { resolve: () => void },
  prefetchRoute: vi.fn(),
}));

vi.mock("@/lib/ranked-core/media/prepareImage", () => ({
  prepareImage: mocks.prepareImage,
  prepareImages: mocks.prepareImages,
}));
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: mocks.prefetchRoute }));

import {
  ACADEMY_BOOK_FRAME,
  ACADEMY_BOOK_SPINE,
  ACADEMY_BROADCAST_BOOK,
  ACADEMY_LIBRARY_DESKTOP,
  ACADEMY_LIBRARY_MOBILE,
} from "@/academy/hub/hub-art";
import { championAssetsQuery, type ChampionManifest } from "@/hooks/useChampionAssets";
import {
  HUB_BOOK_COVER_CHAMPION,
  HUB_DESTINATION_ROUTES,
  HUB_MOGZY_SRC,
  LEAGUECRAFT_GUIDE_MOGZY_SRC,
  __resetAcademyHubWarmForTests,
  hubCoverSplashes,
  hubCriticalImages,
  warmAcademyHub,
} from "./academy-hub-warm";

const manifest: ChampionManifest = {
  champions: Object.fromEntries(
    ["Ryze", "Akali", "Viktor", "Ahri"].map((n) => [
      n,
      { icon: "", loading: "", cutout: "", splash: `https://cdn.test/${n}/splash.jpg` },
    ]),
  ),
};

function setDesktop(desktop: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q === "(min-width: 768px)" ? desktop : !desktop,
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  __resetAcademyHubWarmForTests();
  mocks.prepareImages.mockImplementation(
    () => new Promise<void>((resolve) => { mocks.critical = { resolve }; }),
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("hubCriticalImages", () => {
  it("names one breakpoint's art, never both", () => {
    expect(hubCriticalImages(true)).toEqual([
      ACADEMY_LIBRARY_DESKTOP,
      ACADEMY_BOOK_FRAME,
      HUB_MOGZY_SRC,
      ACADEMY_BROADCAST_BOOK,
    ]);
    expect(hubCriticalImages(false)).toEqual([ACADEMY_LIBRARY_MOBILE, ACADEMY_BOOK_SPINE, HUB_MOGZY_SRC]);
    expect(hubCriticalImages(true)).not.toContain(ACADEMY_LIBRARY_MOBILE);
    expect(hubCriticalImages(false)).not.toContain(ACADEMY_LIBRARY_DESKTOP);
  });

  it("warms the encodes the Hub renders, not the source PNGs", () => {
    for (const url of [...hubCriticalImages(true), ...hubCriticalImages(false)]) {
      expect(url).toMatch(/\.webp$/);
    }
    expect(HUB_MOGZY_SRC).toBe("/mascot/mogzy-mascot-base-v1-512.webp");
  });
});

describe("hubCoverSplashes", () => {
  it("resolves the four covers from the manifest, in Hub order", () => {
    expect(hubCoverSplashes(manifest)).toEqual(
      HUB_DESTINATION_ROUTES.map((to) => `https://cdn.test/${HUB_BOOK_COVER_CHAMPION[to]}/splash.jpg`),
    );
    expect(hubCoverSplashes(null)).toEqual([]);
  });
});

describe("warmAcademyHub", () => {
  it("desktop: manifest via the shared query, critical art at high priority, then routes and covers", async () => {
    setDesktop(true);
    const client = new QueryClient();
    const fetchQuery = vi.spyOn(client, "fetchQuery").mockResolvedValue(manifest);

    const done = warmAcademyHub(client);
    // The manifest and the critical art start together, first.
    expect(fetchQuery).toHaveBeenCalledWith(championAssetsQuery);
    expect(mocks.prepareImages).toHaveBeenCalledWith(hubCriticalImages(true), expect.objectContaining({ priority: "high" }));
    await flush();
    // Nothing else competes with the critical art while it is in flight.
    expect(mocks.prefetchRoute).not.toHaveBeenCalled();
    expect(mocks.prepareImage).not.toHaveBeenCalled();

    mocks.critical?.resolve();
    await done;
    expect(mocks.prefetchRoute.mock.calls.map((c) => c[0])).toEqual([...HUB_DESTINATION_ROUTES]);
    // Plain idle warms, not intent.
    expect(mocks.prefetchRoute.mock.calls.every((c) => c.length === 1)).toBe(true);
    expect(mocks.prepareImage.mock.calls.map((c) => c[0])).toEqual([
      LEAGUECRAFT_GUIDE_MOGZY_SRC,
      ...hubCoverSplashes(manifest),
    ]);
    expect(LEAGUECRAFT_GUIDE_MOGZY_SRC).toBe("/mascot/mogzy-explaining-transparent-192.webp");
  });

  it("phone: the phone art, and no cover splashes (the phone stack draws none)", async () => {
    setDesktop(false);
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(manifest);
    const done = warmAcademyHub(client);
    expect(mocks.prepareImages).toHaveBeenCalledWith(hubCriticalImages(false), expect.anything());
    mocks.critical?.resolve();
    await done;
    expect(mocks.prefetchRoute).toHaveBeenCalledTimes(4);
    expect(mocks.prepareImage.mock.calls.map((c) => c[0])).toEqual([LEAGUECRAFT_GUIDE_MOGZY_SRC]);
  });

  it("puts the manifest in the ONE cache the Hub's useChampionAssets reads", async () => {
    setDesktop(true);
    const client = new QueryClient();
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const done = warmAcademyHub(client);
    mocks.critical?.resolve();
    await done;
    expect(client.getQueryData(championAssetsQuery.queryKey)).toEqual(manifest);
    // A later reader (the Hub) is served from cache: no second request.
    await client.fetchQuery(championAssetsQuery);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("is idempotent: Landing, hand-off and Hub mount share one warm", async () => {
    setDesktop(true);
    const client = new QueryClient();
    const fetchQuery = vi.spyOn(client, "fetchQuery").mockResolvedValue(manifest);
    const a = warmAcademyHub(client);
    const b = warmAcademyHub(client);
    const c = warmAcademyHub(null);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchQuery).toHaveBeenCalledTimes(1);
    expect(mocks.prepareImages).toHaveBeenCalledTimes(1);
  });

  it("without a query client it still warms the art; the Hub fetches its own manifest", async () => {
    setDesktop(true);
    const done = warmAcademyHub(null);
    mocks.critical?.resolve();
    await done;
    expect(mocks.prefetchRoute).toHaveBeenCalledTimes(4);
    expect(mocks.prepareImage.mock.calls.map((c) => c[0])).toEqual([LEAGUECRAFT_GUIDE_MOGZY_SRC]);
  });

  it("a failed manifest never rejects the warm", async () => {
    setDesktop(true);
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockRejectedValue(new Error("offline"));
    const done = warmAcademyHub(client);
    mocks.critical?.resolve();
    await expect(done).resolves.toBeUndefined();
  });
});
