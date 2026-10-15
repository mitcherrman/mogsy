/**
 * Academy Core V2 — warm the Core's own critical art, in the PERF1 convention.
 *
 * This is the Core's twin of `warmAcademyHub`, kept separate on purpose: the
 * Hall's warm fetches the library painting, the book frame and (on phones) the
 * spine — the old four-book assets the Core does not draw — so the preview
 * must not call it. If the Core ever replaces /lol, the Landing's hand-off
 * should call THIS instead (and the Hall's list retires); that is a production
 * step and is documented in the handoff, not done here.
 *
 * Same rules as PERF1: idempotent, never awaited by a render or a navigation,
 * one breakpoint only, high priority for what is on the first screen and low
 * priority for what follows, and `prepareImage` (priority-aware, de-duplicated
 * per URL, never rejects) as the only loader.
 *
 * Order:
 *   1. the champion manifest through the app's one query definition, so the
 *      page's `useChampionAssets()` (via the Patch Brief feed) finds it cached;
 *   2. first-screen art at HIGH priority: Mogzy's 512 plate (the SAME file the
 *      Landing and the Hall draw, so it is usually already cached) and, on
 *      desktop, the Patch Brief book (above the fold there; below it on phones,
 *      where it is fetched at low priority after the critical set);
 *   3. once those settle (or a short budget runs out): the four reaction
 *      poses (~10 KB each), the two projection icons the manifest names, the
 *      phone book, and the four destination route chunks at idle.
 */
import type { QueryClient } from "@tanstack/react-query";

import { ACADEMY_BROADCAST_BOOK } from "@/academy/hub/hub-art";
import { getMogzyArtAssetPath, type MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { HUB_BOOK_COVER_CHAMPION, HUB_DESTINATION_ROUTES } from "@/lib/hub/academy-hub-warm";
import { championAssetsQuery, getChampionIcon, type ChampionManifest } from "@/hooks/useChampionAssets";
import { prepareImage, prepareImages } from "@/lib/ranked-core/media/prepareImage";
import { prefetchRoute } from "@/lib/route-prefetch";

/** Mogzy at rest beside the instrument — the Landing / Hall encode (71 KB). */
export const CORE_MOGZY_REST_SRC = getMogzyArtAssetPath({ category: "mascot", name: "base" }, "medium");

/** The reaction pose per room, all of which have ~10 KB compact derivatives. */
export const CORE_MOGZY_REACTION_POSE: Record<string, MogzyMascotPose> = {
  leaguecraft: "holdingBook",
  "combat-lab": "raisingHand",
  archives: "explaining",
  "pro-play": "peeking",
};

export function coreReactionSrc(pose: MogzyMascotPose): string {
  return getMogzyArtAssetPath({ category: "mascot", name: pose }, "compact");
}

/** Local, tiny (2–3 KB) media the projections use. Served from /public. */
export const CORE_MEASURE_SHARDS = [
  "/assets/journey/mogzy-stat-shards/adaptive_force.png",
  "/assets/journey/mogzy-stat-shards/attack_speed.png",
] as const;
export const CORE_OBSERVE_ROLES = [
  "/assets/ranked/mogzy-role-icons/top.svg",
  "/assets/ranked/mogzy-role-icons/jungle.svg",
  "/assets/ranked/mogzy-role-icons/mid.svg",
  "/assets/ranked/mogzy-role-icons/bot.svg",
  "/assets/ranked/mogzy-role-icons/support.svg",
] as const;

/** The two manifest icons the projections show: the Hall's cover champions for those rooms. */
export const CORE_INQUIRY_CHAMPION = HUB_BOOK_COVER_CHAMPION["/quiz"];
export const CORE_OBSERVE_CHAMPION = HUB_BOOK_COVER_CHAMPION["/lol/pro-play"];

const CRITICAL_BUDGET_MS = 4000;
/** Same breakpoint the page uses to choose the full (book-beside-Core) composition. */
export const CORE_FULL_LAYOUT_MEDIA = "(min-width: 1024px)";

function isFullLayout(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia === "function") return window.matchMedia(CORE_FULL_LAYOUT_MEDIA).matches;
  return window.innerWidth >= 1024;
}

/** The Core's first-screen art for one layout. Never both variants' extras. */
export function coreCriticalImages(full: boolean = isFullLayout()): string[] {
  return full ? [CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK] : [CORE_MOGZY_REST_SRC];
}

/** What follows the critical set, once the manifest is known. */
export function coreProjectionIcons(manifest: ChampionManifest | null | undefined): {
  inquiryIcon: string | null;
  observeIcon: string | null;
} {
  return {
    inquiryIcon: getChampionIcon(manifest, CORE_INQUIRY_CHAMPION),
    observeIcon: getChampionIcon(manifest, CORE_OBSERVE_CHAMPION),
  };
}

export interface CoreWarmResult {
  inquiryIcon: string | null;
  observeIcon: string | null;
}

let started: Promise<CoreWarmResult> | null = null;

/**
 * Start (or join) the Core warm. Resolves with the projection icon URLs once
 * they have been prepared (null when the manifest does not name them), so the
 * page can mount the `<image>`s only after the bytes are in cache.
 */
export function warmAcademyCore(client?: QueryClient | null): Promise<CoreWarmResult> {
  if (started) return started;
  if (typeof window === "undefined") return Promise.resolve({ inquiryIcon: null, observeIcon: null });
  const full = isFullLayout();

  const manifest: Promise<ChampionManifest | null> = client
    ? client.fetchQuery(championAssetsQuery).catch(() => null)
    : Promise.resolve(null);
  const critical = prepareImages(coreCriticalImages(full), {
    priority: "high",
    timeoutMs: CRITICAL_BUDGET_MS,
  });

  started = critical.then(async () => {
    for (const to of HUB_DESTINATION_ROUTES) prefetchRoute(to);
    for (const pose of Object.values(CORE_MOGZY_REACTION_POSE)) {
      void prepareImage(coreReactionSrc(pose), { priority: "low" });
    }
    for (const u of [...CORE_MEASURE_SHARDS, ...CORE_OBSERVE_ROLES]) void prepareImage(u, { priority: "low" });
    if (!full) void prepareImage(ACADEMY_BROADCAST_BOOK, { priority: "low" });
    const icons = coreProjectionIcons(await manifest);
    await Promise.all(
      [icons.inquiryIcon, icons.observeIcon]
        .filter((u): u is string => !!u)
        .map((u) => prepareImage(u, { priority: "low", timeoutMs: CRITICAL_BUDGET_MS })),
    );
    return icons;
  });
  return started;
}

/** Test seam. */
export function __resetAcademyCoreWarmForTests(): void {
  started = null;
}
