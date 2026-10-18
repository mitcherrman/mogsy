/**
 * Academy Core V3 — warm the Core's own critical art, in the PERF1 convention.
 *
 * This is the Core's twin of `warmAcademyHub`, kept separate on purpose: the
 * Hall's warm fetches the library painting and (on phones) the spine — art
 * the Core does not draw, so `/lol` must not call it. The Landing's hold and
 * hand-off call THIS; the Hall (`/lol/hall`) keeps calling its own warm on
 * mount, so a direct visit there still gets its ordering.
 *
 * Same rules as PERF1: idempotent, never awaited by a render or a navigation,
 * one breakpoint only, high priority for what is on the first screen and low
 * priority for what follows, and `prepareImage` (priority-aware, de-duplicated
 * per URL, never rejects) as the only loader.
 *
 * Order:
 *   1. the champion manifest through the app's one query definition, so the
 *      page's `useChampionAssets()` finds it cached and the four cover
 *      splashes can be NAMED;
 *   2. first-screen art at HIGH priority: the ONE shared book frame (four
 *      covers, one file), Mogzy's 512 plate (the SAME file the Landing and
 *      the Hall draw, so it is usually already cached) and, on desktop, the
 *      Patch Brief book (above the fold there; below it on phones, where it
 *      follows at low priority);
 *   3. as soon as the manifest answers: the four cover splashes — all four at
 *      high priority on desktop (all on screen); on phones the upper pair
 *      high and the lower pair low (below the first screen);
 *   3b. ACADEMY STARTUP S2 — the Patch Report book's feed (list -> detail, the
 *      page's own query keys) and then its champion icons: on desktop at once
 *      and high (the open book is on the first screen and was the last thing
 *      to arrive), on phones only after the critical set and low (below the
 *      fold there);
 *   4. once the critical set settles (or a short budget runs out): the four
 *      reaction poses (~10 KB each), the tiny local shards / role marks, and
 *      the four destination route chunks at idle.
 *
 * Not fetched any more (V2 → V3): the two manifest champion ICONS — the
 * crystal's projections now reuse the cover splashes that are already in cache.
 */
import type { QueryClient } from "@tanstack/react-query";

import { ACADEMY_BOOK_FRAME, ACADEMY_BROADCAST_BOOK } from "@/academy/hub/hub-art";
import { getMogzyArtAssetPath, type MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { HUB_DESTINATION_ROUTES } from "@/lib/hub/academy-hub-warm";
import { championAssetsQuery, getChampionSplash, type ChampionManifest } from "@/hooks/useChampionAssets";
import { prepareImage, prepareImages } from "@/lib/ranked-core/media/prepareImage";
import { prefetchRoute } from "@/lib/route-prefetch";
import { patchBriefIconUrls, prefetchPatchBrief } from "@/components/lol/broadcast/usePatchBriefFeed";
import { CORE_DESTINATIONS, type CoreDestination } from "./academy-core-destinations";

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
  return full
    ? [ACADEMY_BOOK_FRAME, CORE_MOGZY_REST_SRC, ACADEMY_BROADCAST_BOOK]
    : [ACADEMY_BOOK_FRAME, CORE_MOGZY_REST_SRC];
}

/** The four cover splash URLs, once the manifest is known, keyed by room. */
export function coreCoverSplashes(manifest: ChampionManifest | null | undefined): Record<CoreDestination["id"], string | null> {
  const out = {} as Record<CoreDestination["id"], string | null>;
  for (const d of CORE_DESTINATIONS) out[d.id] = getChampionSplash(manifest, d.championName);
  return out;
}

export type CoreWarmResult = Record<CoreDestination["id"], string | null>;

let started: Promise<CoreWarmResult> | null = null;

/**
 * Start (or join) the Core warm. Resolves with the cover splash URLs once the
 * manifest has answered (nulls when it does not name a champion). The page's
 * covers do not wait for this — `useChampionAssets()` reads the same cache
 * entry — it exists so the warm, not the covers' own <img>s, decides priority.
 */
export function warmAcademyCore(client?: QueryClient | null): Promise<CoreWarmResult> {
  if (started) return started;
  if (typeof window === "undefined") return Promise.resolve(coreCoverSplashes(null));
  const full = isFullLayout();

  const manifest: Promise<ChampionManifest | null> = client
    ? client.fetchQuery(championAssetsQuery).catch(() => null)
    : Promise.resolve(null);
  const critical = prepareImages(coreCriticalImages(full), {
    priority: "high",
    timeoutMs: CRITICAL_BUDGET_MS,
  });

  // The covers start the moment they can be named — in parallel with the
  // frame, not after it: on desktop all four are on the first screen.
  const covers = manifest.then((m) => {
    const splashes = coreCoverSplashes(m);
    const jobs = CORE_DESTINATIONS.map((d) => {
      const url = splashes[d.id];
      if (!url) return Promise.resolve("error" as const);
      const priority = full || d.tier === "upper" ? "high" : "low";
      return prepareImage(url, { priority, timeoutMs: CRITICAL_BUDGET_MS });
    });
    return Promise.all(jobs).then(() => splashes);
  });

  // The Patch Report's feed is two serial API reads: start them now on desktop
  // (they are small; the latency, not the bytes, is what made the book last).
  if (client) {
    const brief = full ? prefetchPatchBrief(client, manifest) : critical.then(() => prefetchPatchBrief(client, manifest));
    void brief.then((b) => {
      for (const url of patchBriefIconUrls(b)) void prepareImage(url, { priority: full ? "high" : "low" });
    });
  }

  started = critical.then(async () => {
    for (const to of HUB_DESTINATION_ROUTES) prefetchRoute(to);
    for (const pose of Object.values(CORE_MOGZY_REACTION_POSE)) {
      void prepareImage(coreReactionSrc(pose), { priority: "low" });
    }
    for (const u of [...CORE_MEASURE_SHARDS, ...CORE_OBSERVE_ROLES]) void prepareImage(u, { priority: "low" });
    if (!full) void prepareImage(ACADEMY_BROADCAST_BOOK, { priority: "low" });
    return covers;
  });
  return started;
}

/** Test seam. */
export function __resetAcademyCoreWarmForTests(): void {
  started = null;
}
