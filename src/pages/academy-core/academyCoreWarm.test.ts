/**
 * Academy Core V3 — the page-scoped warm (PERF1 convention).
 *
 * What matters: the Core never asks for the Hall's library / spine art, its
 * first-screen set is one breakpoint's worth (the ONE shared book frame,
 * Mogzy, and on desktop the open book), the four cover splashes start as soon
 * as the manifest answers with the right priorities per breakpoint, the
 * manifest goes through the app's one query definition, and the whole thing
 * is idempotent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

// Requests are recorded when a caller sets a priority (that is what issues
// them); a priority-less call only JOINS a load already in flight with a
// longer wait (the warm's "has it really settled" check), so it is not a request.
const loader = vi.hoisted(() => {
  const pending: { budget?: number; resolve: () => void }[] = [];
  return {
    prepared: [] as { url: string; priority?: string }[],
    pending,
    /** The short (4 s) critical budget answers. */
    resolveCritical: () => { for (const p of pending.filter((x) => x.budget === 4000)) p.resolve(); },
    /** The first-screen art has actually loaded (the long, joining waits answer). */
    resolveSettled: () => { for (const p of pending.filter((x) => x.budget !== 4000)) p.resolve(); },
  };
});
vi.mock("@/lib/ranked-core/media/prepareImage", () => ({
  prepareImage: (url: string, opts: { priority?: string } = {}) => {
    if (opts.priority) loader.prepared.push({ url, priority: opts.priority });
    return Promise.resolve("ok");
  },
  prepareImages: (urls: string[], opts: { priority?: string; timeoutMs?: number } = {}) => {
    if (opts.priority) for (const url of urls) loader.prepared.push({ url, priority: opts.priority });
    return new Promise<void>((resolve) => { loader.pending.push({ budget: opts.timeoutMs, resolve }); });
  },
}));
const prefetchRoute = vi.fn();
vi.mock("@/lib/route-prefetch", () => ({ prefetchRoute: (p: string) => prefetchRoute(p) }));
const patch = vi.hoisted(() => ({
  prefetch: vi.fn<(client: unknown, manifest: Promise<unknown>) => Promise<unknown>>(() => Promise.resolve(null)),
}));
vi.mock("@/components/lol/broadcast/usePatchBriefFeed", () => ({
  prefetchPatchBrief: (client: unknown, manifest: Promise<unknown>) => patch.prefetch(client, manifest),
  patchBriefIconUrls: (brief: { icons: string[] } | null) => brief?.icons ?? [],
}));
const BRIEF = { icons: ["https://api.example/assets/champions/Diana/icon.png", "https://api.example/assets/champions/Ashe/icon.png"] };

import {
  ACADEMY_BOOK_FRAME, ACADEMY_BOOK_SPINE, ACADEMY_BROADCAST_BOOK, ACADEMY_LIBRARY_DESKTOP, ACADEMY_LIBRARY_MOBILE,
} from "@/academy/hub/hub-art";
import { championAssetsQuery } from "@/hooks/useChampionAssets";
import {
  CORE_MOGZY_REST_SRC, __resetAcademyCoreWarmForTests, academyCoreSettled, coreCriticalImages, warmAcademyCore,
} from "./academy-core-warm";

const HALL_ONLY = [ACADEMY_LIBRARY_DESKTOP, ACADEMY_LIBRARY_MOBILE, ACADEMY_BOOK_SPINE];
const MANIFEST = { champions: Object.fromEntries(["Ryze", "Ahri", "Akali", "Viktor"].map((n) => [n, {
  icon: `assets/champions/${n}/icon.png`, splash: `assets/champions/${n}/splash/0_default.jpg`, loading: "", cutout: "",
}])) };

function setLayout(full: boolean) {
  window.matchMedia = ((q: string) => ({
    matches: full && q.includes("min-width: 1024px"), media: q, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
const splash = (n: string) => expect.stringMatching(new RegExp(`assets/champions/${n}/splash/0_default\\.jpg$`));

beforeEach(() => {
  patch.prefetch.mockReset();
  patch.prefetch.mockImplementation(() => Promise.resolve(null));
  loader.prepared.length = 0;
  loader.pending.length = 0;
  prefetchRoute.mockClear();
  __resetAcademyCoreWarmForTests();
});
afterEach(() => vi.restoreAllMocks());

describe("critical set", () => {
  it("desktop: the one shared book frame, Mogzy's cached 512 plate and the open Patch Brief book — nothing from the old Hall", () => {
    expect(coreCriticalImages(true)).toEqual([ACADEMY_BOOK_FRAME, CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK]);
    for (const u of HALL_ONLY) expect(coreCriticalImages(true)).not.toContain(u);
  });

  it("phone: frame and Mogzy only — the open book is below the fold there", () => {
    expect(coreCriticalImages(false)).toEqual([ACADEMY_BOOK_FRAME, CORE_MOGZY_REST_SRC]);
  });
});

describe("warmAcademyCore", () => {
  it("desktop: manifest through the app's query, critical set at high priority, then all four covers at high priority", async () => {
    setLayout(true);
    const client = new QueryClient();
    const fetchQuery = vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    const done = warmAcademyCore(client);
    expect(fetchQuery).toHaveBeenCalledWith(championAssetsQuery);
    expect(loader.prepared.map((p) => p.url)).toEqual([ACADEMY_BOOK_FRAME, CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK]);
    await Promise.resolve(); await Promise.resolve(); // the manifest answers
    const covers = loader.prepared.slice(3);
    expect(covers.map((p) => p.url)).toEqual([splash("Ryze"), splash("Ahri"), splash("Akali"), splash("Viktor")]);
    expect(covers.every((p) => p.priority === "high")).toBe(true);
    loader.resolveCritical();
    const result = await done;
    expect(result.leaguecraft).toMatch(/Ryze\/splash/);
    expect(result["pro-play"]).toMatch(/Ahri\/splash/);
    // the decorative follow-ups wait for the art to have REALLY settled
    expect(loader.prepared.slice(7)).toEqual([]);
    loader.resolveSettled();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    // ACADEMY STARTUP S3: the destination pages are the page's to ask for, once shown
    expect(prefetchRoute).not.toHaveBeenCalled();
    const later = loader.prepared.slice(7);
    expect(later.every((p) => p.priority === "low")).toBe(true);
    expect(later.map((p) => p.url)).toEqual(expect.arrayContaining([
      "/mascot/mogzy-holding-book-transparent-192.webp", "/mascot/mogzy-peeking-transparent-192.webp",
    ]));
    for (const u of HALL_ONLY) expect(loader.prepared.map((p) => p.url)).not.toContain(u);
    // V2's manifest icons are gone: the projections reuse the cover splashes
    expect(loader.prepared.map((p) => p.url).some((u) => /\/icon\.png$/.test(u))).toBe(false);
  });

  it("phone: the upper pair high, the lower pair low, the open book low and last", async () => {
    setLayout(false);
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    const done = warmAcademyCore(client);
    await Promise.resolve(); await Promise.resolve();
    const byUrl = new Map(loader.prepared.map((p) => [p.url, p.priority]));
    expect([...byUrl.keys()].find((u) => /Ryze\/splash/.test(u)) && byUrl.get([...byUrl.keys()].find((u) => /Ryze\/splash/.test(u))!)).toBe("high");
    expect(byUrl.get([...byUrl.keys()].find((u) => /Ahri\/splash/.test(u))!)).toBe("high");
    expect(byUrl.get([...byUrl.keys()].find((u) => /Akali\/splash/.test(u))!)).toBe("low");
    expect(byUrl.get([...byUrl.keys()].find((u) => /Viktor\/splash/.test(u))!)).toBe("low");
    loader.resolveCritical();
    await done;
    expect(loader.prepared.find((p) => p.url === ACADEMY_BROADCAST_BOOK)).toBeUndefined();
    loader.resolveSettled();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(loader.prepared.find((p) => p.url === ACADEMY_BROADCAST_BOOK)?.priority).toBe("low");
  });

  it("is idempotent: a second call joins the first", async () => {
    setLayout(true);
    const a = warmAcademyCore(null);
    const b = warmAcademyCore(null);
    expect(b).toBe(a);
    loader.resolveCritical();
    await a;
    expect(loader.prepared.filter((p) => p.url === ACADEMY_BOOK_FRAME)).toHaveLength(1);
  });
});


describe("warmAcademyCore — the Patch Report book (ACADEMY STARTUP S2)", () => {
  it("desktop: starts the feed at once, before the critical art settles, then warms every brief icon at high priority", async () => {
    setLayout(true);
    patch.prefetch.mockImplementation(() => Promise.resolve(BRIEF));
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    const done = warmAcademyCore(client);
    expect(patch.prefetch).toHaveBeenCalledTimes(1);
    expect(patch.prefetch.mock.calls[0][0]).toBe(client);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const icons = loader.prepared.filter((p) => /\/icon\.png$/.test(p.url));
    expect(icons.map((p) => p.url)).toEqual(BRIEF.icons);
    expect(icons.every((p) => p.priority === "high")).toBe(true);
    loader.resolveCritical();
    await done;
  });

  it("phone: the feed waits for the critical art (the book is below the fold) and its icons are low", async () => {
    setLayout(false);
    patch.prefetch.mockImplementation(() => Promise.resolve(BRIEF));
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    const done = warmAcademyCore(client);
    await Promise.resolve(); await Promise.resolve();
    expect(patch.prefetch).not.toHaveBeenCalled();
    loader.resolveCritical();
    await done;
    await Promise.resolve(); await Promise.resolve();
    // integration: the phone's feed follows the first screen's REAL settle (S3), not the 4 s budget
    expect(patch.prefetch).not.toHaveBeenCalled();
    loader.resolveSettled();
    await new Promise((r) => setTimeout(r, 0));
    expect(patch.prefetch).toHaveBeenCalledTimes(1);
    const icons = loader.prepared.filter((p) => /\/icon\.png$/.test(p.url));
    expect(icons.map((p) => p.url)).toEqual(BRIEF.icons);
    expect(icons.every((p) => p.priority === "low")).toBe(true);
  });

  it("without a query client (no provider) nothing is prefetched", async () => {
    setLayout(true);
    const done = warmAcademyCore(null);
    loader.resolveCritical();
    await done;
    expect(patch.prefetch).not.toHaveBeenCalled();
  });
});

describe("warmAcademyCore — slow networks (ACADEMY STARTUP S3)", () => {
  it("the critical budget running out does NOT start the decorative loads while the first-screen art is still downloading", async () => {
    setLayout(true);
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    const done = warmAcademyCore(client);
    await Promise.resolve(); await Promise.resolve();
    const before = loader.prepared.length;
    loader.resolveCritical(); // 4 s pass; the frame and covers are still on the wire
    await done;
    await Promise.resolve(); await Promise.resolve();
    expect(loader.prepared.length).toBe(before);
    expect(prefetchRoute).not.toHaveBeenCalled();
    loader.resolveSettled();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(loader.prepared.length).toBeGreaterThan(before);
    expect(loader.prepared.slice(before).every((p) => p.priority === "low")).toBe(true);
  });

  it("academyCoreSettled answers when the first screen has settled, and at once when no warm runs", async () => {
    let settledNow = false;
    await academyCoreSettled().then(() => { settledNow = true; });
    expect(settledNow).toBe(true);
    setLayout(true);
    const client = new QueryClient();
    vi.spyOn(client, "fetchQuery").mockResolvedValue(MANIFEST as never);
    void warmAcademyCore(client);
    let settled = false;
    void academyCoreSettled().then(() => { settled = true; });
    loader.resolveCritical();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(false);
    loader.resolveSettled();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(settled).toBe(true);
  });
});
