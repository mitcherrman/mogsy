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
 *   4. once the first-screen art has ACTUALLY settled (loaded or failed — not
 *      when the short budget runs out): the four reaction poses (~10 KB
 *      each), the tiny local shards / role marks and, on phones, the open
 *      book. ACADEMY STARTUP S3: the four destination route chunks are no
 *      longer started here; the page asks for them at idle after it is shown
 *      (`academyCoreSettled`). On slow networks the old budget-driven step
 *      started all of this while the frame and covers were still downloading
 *      (measured: slow 4G, critical art not in after 14 s).
 *
 * Not fetched any more (V2 → V3): the two manifest champion ICONS — the
 * crystal's projections now reuse the cover splashes that are already in cache.
 */
import type { QueryClient } from "@tanstack/react-query";

import { ACADEMY_BOOK_FRAME, ACADEMY_BROADCAST_BOOK } from "@/academy/hub/hub-art";
import { getMogzyArtAssetPath, type MogzyMascotPose } from "@/components/mascot/mascot-assets";
import { championAssetsQuery, getChampionSplash, type ChampionManifest } from "@/hooks/useChampionAssets";
import { prepareImage, prepareImages } from "@/lib/ranked-core/media/prepareImage";
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
/** How long the decorative follow-ups may wait for the first-screen art before going anyway. */
const SETTLE_CAP_MS = 20_000;
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
let settled: Promise<void> | null = null;

/** `p`, or `fallback` once `ms` have passed — whichever comes first. Never rejects. */
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

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

  // The first screen has really settled when every critical image and every
  // on-screen cover has loaded or failed. These calls JOIN the loads above (the
  // budget belongs to the caller, not the request), they only wait longer.
  // RC1: the WHOLE wait is capped, not only each image's: the manifest request
  // has no timeout of its own, and a stalled one used to hold everything that
  // follows the settle (destination chunks, poses, shards, the phone Patch
  // warm) for as long as the request hung.
  const firstScreen = within(Promise.all([
    prepareImages(coreCriticalImages(full), { timeoutMs: SETTLE_CAP_MS }),
    manifest.then((m) => {
      const splashes = coreCoverSplashes(m);
      return Promise.all(
        CORE_DESTINATIONS.filter((d) => full || d.tier === "upper").map((d) =>
          prepareImage(splashes[d.id], { timeoutMs: SETTLE_CAP_MS })),
      );
    }),
  ]).then(() => undefined), SETTLE_CAP_MS, undefined);
  settled = firstScreen;

  // The Patch Report's feed is two serial API reads: start them now on desktop
  // (they are small; the latency, not the bytes, is what made the book last).
  if (client) {
    const brief = full ? prefetchPatchBrief(client, manifest) : firstScreen.then(() => prefetchPatchBrief(client, manifest));
    void brief.then((b) => {
      for (const url of patchBriefIconUrls(b)) void prepareImage(url, { priority: full ? "high" : "low" });
    });
  }

  void settled.then(() => {
    for (const pose of Object.values(CORE_MOGZY_REACTION_POSE)) {
      void prepareImage(coreReactionSrc(pose), { priority: "low" });
    }
    for (const u of [...CORE_MEASURE_SHARDS, ...CORE_OBSERVE_ROLES]) void prepareImage(u, { priority: "low" });
    if (!full) void prepareImage(ACADEMY_BROADCAST_BOOK, { priority: "low" });
  });

  // RC1: the page's `warmed` (cover art, shards, role marks) must not hang on a
  // stalled manifest either: after the critical set, the covers get one more
  // budget, then the warm resolves with what it can name (nothing yet). The
  // covers still appear whenever the manifest does — the page reads the same
  // query — the warm just stops holding the rest back.
  started = critical.then(() => within(covers, CRITICAL_BUDGET_MS, coreCoverSplashes(null)));
  return started;
}

/**
 * Resolves once a running warm's first-screen art has settled (loaded or
 * failed; at most SETTLE_CAP_MS). Immediately when no warm is running: then
 * there is nothing on the network to make way for.
 */
export function academyCoreSettled(): Promise<void> {
  return settled ?? Promise.resolve();
}

/** Test seam. */
export function __resetAcademyCoreWarmForTests(): void {
  started = null;
  settled = null;
}
