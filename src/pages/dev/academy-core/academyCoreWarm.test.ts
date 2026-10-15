/**
 * Academy Core V2 — the page-scoped warm (PERF1 convention).
 *
 * What matters: the Core never asks for the Hall's old four-book art, its
 * first-screen set is one breakpoint's worth, the follow-ups come after the
 * critical set, the manifest goes through the app's one query definition,
 * and the whole thing is idempotent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const loader = vi.hoisted(() => ({
  prepared: [] as { url: string; priority?: string }[],
  resolveCritical: () => {},
}));
vi.mock("@/lib/ranked-core/media/prepareImage", () => ({
  prepareImage: (url: string, opts: { priority?: string } = {}) => {
    loader.prepared.push({ url, priority: opts.priority });
    return Promise.resolve("ok");
  },
  prepareImages: (urls: string[], opts: { priority?: string } = {}) => {
    for (const url of urls) loader.prepared.push({ url, priority: opts.priority });
    return new Promise<void>((resolve) => { loader.resolveCritical = resolve; });
  },
}));
const prefetchRoute = vi.fn();
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: (p: string) => prefetchRoute(p) }));

import {
  ACADEMY_BOOK_FRAME, ACADEMY_BOOK_SPINE, ACADEMY_BROADCAST_BOOK, ACADEMY_LIBRARY_DESKTOP, ACADEMY_LIBRARY_MOBILE,
} from "@/academy/hub/hub-art";
import { championAssetsQuery } from "@/hooks/useChampionAssets";
import {
  CORE_MOGZY_REST_SRC, __resetAcademyCoreWarmForTests, coreCriticalImages, warmAcademyCore,
} from "./academy-core-warm";

const HALL_ONLY = [ACADEMY_LIBRARY_DESKTOP, ACADEMY_LIBRARY_MOBILE, ACADEMY_BOOK_FRAME, ACADEMY_BOOK_SPINE];

function setLayout(full: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: full && q.includes("min-width: 1024px"), media: q, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

beforeEach(() => {
  loader.prepared.length = 0;
  prefetchRoute.mockClear();
  __resetAcademyCoreWarmForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("critical set", () => {
  it("desktop: Mogzy's cached 512 plate and the Patch Brief book, nothing from the old Hall", () => {
    expect(coreCriticalImages(true)).toEqual([CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK]);
    for (const u of HALL_ONLY) expect(coreCriticalImages(true)).not.toContain(u);
  });

  it("phone: Mogzy only — the book is below the fold there", () => {
    expect(coreCriticalImages(false)).toEqual([CORE_MOGZY_REST_SRC]);
  });
});

describe("warmAcademyCore", () => {
  it("fetches the manifest through the app's query definition and the critical set at high priority first", async () => {
    setLayout(true);
    const client = new QueryClient();
    const fetchQuery = vi.spyOn(client, "fetchQuery").mockResolvedValue({ champions: {
      Ryze: { icon: "assets/champions/Ryze/icon.png", splash: "", loading: "", cutout: "" },
      Ahri: { icon: "assets/champions/Ahri/icon.png", splash: "", loading: "", cutout: "" },
    } } as never);
    const done = warmAcademyCore(client);
    expect(fetchQuery).toHaveBeenCalledWith(championAssetsQuery);
    expect(loader.prepared.map((p) => p.url)).toEqual([CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK]);
    expect(loader.prepared.every((p) => p.priority === "high")).toBe(true);
    // nothing else until the critical set settles
    expect(prefetchRoute).not.toHaveBeenCalled();
    loader.resolveCritical();
    const icons = await done;
    expect(prefetchRoute.mock.calls.map((c) => c[0])).toEqual(["/quiz", "/combat-lab", "/lol/docs", "/lol/pro-play"]);
    const later = loader.prepared.slice(2);
    expect(later.every((p) => p.priority === "low")).toBe(true);
    expect(later.map((p) => p.url)).toEqual(expect.arrayContaining([
      "/mascot/mogzy-holding-book-transparent-192.webp",
      "/mascot/mogzy-raising-hand-transparent-192.webp",
      "/mascot/mogzy-explaining-transparent-192.webp",
      "/mascot/mogzy-peeking-transparent-192.webp",
      "/assets/ranked/mogzy-role-icons/top.svg",
    ]));
    expect(icons.inquiryIcon).toMatch(/assets\/champions\/Ryze\/icon\.png$/);
    expect(icons.observeIcon).toMatch(/assets\/champions\/Ahri\/icon\.png$/);
    for (const u of HALL_ONLY) expect(loader.prepared.map((p) => p.url)).not.toContain(u);
  });

  it("phone: the book follows at low priority instead of leading", async () => {
    setLayout(false);
    const done = warmAcademyCore(null);
    expect(loader.prepared.map((p) => p.url)).toEqual([CORE_MOGZY_REST_SRC]);
    loader.resolveCritical();
    await done;
    const book = loader.prepared.find((p) => p.url === ACADEMY_BROADCAST_BOOK);
    expect(book?.priority).toBe("low");
  });

  it("is idempotent: a second call joins the first", async () => {
    setLayout(true);
    const a = warmAcademyCore(null);
    const b = warmAcademyCore(null);
    expect(b).toBe(a);
    loader.resolveCritical();
    await a;
    expect(loader.prepared.filter((p) => p.url === CORE_MOGZY_REST_SRC)).toHaveLength(1);
  });
});
