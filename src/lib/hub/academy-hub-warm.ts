/**
 * PERF1 — warm the Academy Hub before (or as) the visitor arrives.
 *
 * ONE path, called from the Landing once its own art is in, from the Landing's
 * hand-off, and from the Hub's own mount (so a direct /lol visit gets the same
 * ordering). Every step is idempotent and nothing here gates a navigation or a
 * render: a warm that fails or is slow just leaves the Hub's own <img>s to do
 * the loading, exactly as before.
 *
 * Order, and why:
 *   1. the champion manifest (a few KB of JSON) — the book covers cannot even
 *      be NAMED until it resolves, so it starts first and in parallel;
 *   2. the next screen's critical art at HIGH priority, for THIS breakpoint
 *      only (the same media query as the Hall's <picture>): background, book
 *      shell (desktop) or spine (phone), and Mogzy — plus, on desktop, the
 *      Patch Brief's open book, which is above the fold there and which the
 *      Broadcast surface waits for before it shows anything (below the fold on
 *      a phone, so not warmed there);
 *   3. once those settle (or a short budget runs out): the four cover splashes
 *      (desktop only — the phone stack draws none), at idle the four
 *      destination route chunks, and Leaguecraft's ~10 KB first-use Mogzy.
 *
 * Not `prefetchImages` from route-prefetch: that is idle-scheduled at LOW
 * priority for likely-next routes, which is wrong for the very next screen.
 * The loader is `prepareImage`, the app's existing priority-aware, de-duplicated
 * image preparation (it never rejects and drops the element once settled).
 */
import type { QueryClient } from "@tanstack/react-query";

import {
  ACADEMY_BOOK_FRAME,
  ACADEMY_BOOK_SPINE,
  ACADEMY_BROADCAST_BOOK,
  ACADEMY_LIBRARY_DESKTOP,
  ACADEMY_LIBRARY_MOBILE,
  HUB_DESKTOP_MEDIA,
} from "@/academy/hub/hub-art";
import { getMogzyArtAssetPath } from "@/components/mascot/mascot-assets";
import {
  championAssetsQuery,
  getChampionSplash,
  type ChampionManifest,
} from "@/hooks/useChampionAssets";
import { prepareImage, prepareImages } from "@/lib/ranked-core/media/prepareImage";
import { prefetchRoute } from "@/lib/route-prefetch";

/** The Hub's four primary destinations, in the Hub's row-major order. */
export const HUB_DESTINATION_ROUTES = ["/quiz", "/combat-lab", "/lol/docs", "/lol/pro-play"] as const;
export type HubDestinationRoute = (typeof HUB_DESTINATION_ROUTES)[number];

/** The champion whose splash is inlaid in each destination's closed volume. */
export const HUB_BOOK_COVER_CHAMPION: Record<HubDestinationRoute, string> = {
  "/quiz": "Ryze",
  "/combat-lab": "Akali",
  "/lol/docs": "Viktor",
  "/lol/pro-play": "Ahri",
};

/** The Hub guide's Mogzy — the same encode the Landing draws. */
export const HUB_MOGZY_SRC = getMogzyArtAssetPath({ category: "mascot", name: "base" }, "medium");

/**
 * Leaguecraft's first-use guide (`pose: "explaining"`, scale compact — see
 * LeaguecraftGuide). ~10 KB, but on a cold /quiz it queues behind the lobby's
 * multi-MB paintings; warmed here it is already cached when the book is opened.
 */
export const LEAGUECRAFT_GUIDE_MOGZY_SRC = getMogzyArtAssetPath(
  { category: "mascot", name: "explaining" },
  "compact",
);

/**
 * How long the follow-up work (covers, route chunks) waits for the critical
 * art before going ahead anyway. A slow painting must not hold the rest back.
 */
const CRITICAL_BUDGET_MS = 4000;

function isDesktopHub(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia === "function") return window.matchMedia(HUB_DESKTOP_MEDIA).matches;
  return window.innerWidth >= 768;
}

/** The Hub's first-screen art for one breakpoint. Never both variants. */
export function hubCriticalImages(desktop: boolean = isDesktopHub()): string[] {
  return desktop
    ? [ACADEMY_LIBRARY_DESKTOP, ACADEMY_BOOK_FRAME, HUB_MOGZY_SRC, ACADEMY_BROADCAST_BOOK]
    : [ACADEMY_LIBRARY_MOBILE, ACADEMY_BOOK_SPINE, HUB_MOGZY_SRC];
}

/** The four cover splash URLs, once the manifest is known. */
export function hubCoverSplashes(manifest: ChampionManifest | null | undefined): string[] {
  return HUB_DESTINATION_ROUTES.map((to) => getChampionSplash(manifest, HUB_BOOK_COVER_CHAMPION[to])).filter(
    (u): u is string => !!u,
  );
}

let started: Promise<void> | null = null;

/**
 * Start (or join) the Hub warm. Safe to call any number of times, from
 * anywhere; only the first call does work. `client` is the app's React Query
 * client — the manifest goes through `championAssetsQuery` on it, so the Hub's
 * `useChampionAssets()` finds it cached and nothing fetches it twice. Without
 * a client the manifest step is skipped (the Hub then fetches it as before).
 */
export function warmAcademyHub(client?: QueryClient | null): Promise<void> {
  if (started) return started;
  if (typeof window === "undefined") return Promise.resolve();
  const desktop = isDesktopHub();

  const manifest: Promise<ChampionManifest | null> = client
    ? client.fetchQuery(championAssetsQuery).catch(() => null)
    : Promise.resolve(null);
  const critical = prepareImages(hubCriticalImages(desktop), {
    priority: "high",
    timeoutMs: CRITICAL_BUDGET_MS,
  });

  started = critical.then(async () => {
    for (const to of HUB_DESTINATION_ROUTES) prefetchRoute(to);
    void prepareImage(LEAGUECRAFT_GUIDE_MOGZY_SRC, { priority: "low" });
    if (!desktop) return;
    const covers = hubCoverSplashes(await manifest);
    await Promise.all(covers.map((u) => prepareImage(u, { timeoutMs: CRITICAL_BUDGET_MS })));
  });
  return started;
}

/** Test seam. */
export function __resetAcademyHubWarmForTests(): void {
  started = null;
}
