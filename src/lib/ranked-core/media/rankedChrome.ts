/**
 * RFX1 Phase 2B1 — Tier 1: what the Ranked arena draws on every round.
 *
 * Deliberately tiny (constants + `prepareImage`), because the LOBBY imports it
 * to warm the arena during its matched→navigation beat and must not pull the
 * question-surface code into its own bundle.
 */
import { getRankedRoleMascotPath } from "@/components/mascot/mascot-assets";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { prepareImage } from "./prepareImage";

/**
 * The arena's persistent chrome: CSS backgrounds under `.ranked-academy`
 * (the chamber backdrop), the folio (`ranked-vellum-texture.webp`) and the
 * player rails (`navy-banner2-768w.webp`). A test asserts each is still in
 * `src/index.css`.
 *
 * RFX1 2B2 re-encoded all three as WebP derivatives (2.3 MB + 2.0 MB + 1.3 MB
 * of PNG became 67 KB + 95 KB + 69 KB). Index 0 is the DESKTOP backdrop; a
 * phone paints `RANKED_BACKDROP_NARROW_URL` instead, so warm through
 * `rankedBackdropUrl`/`prepareRankedChrome` rather than iterating this list.
 */
export const RANKED_CHROME_URLS: readonly string[] = [
  "/assets/ranked/ranked-academy-duel-bg.webp",
  "/assets/ranked/ranked-vellum-texture.webp",
  "/assets/ranked/navy-banner2-768w.webp",
];

/**
 * RFX1 2B2 — the phone's backdrop encode, which `index.css` selects under
 * `max-width: 640px`. A PRELOAD MUST REQUEST THE FILE THE STYLESHEET WILL
 * REQUEST: warming the desktop encode on a phone would download 95 KB nobody
 * paints and then still pay for the 39 KB. A test pins both URLs to the two
 * `--ranked-backdrop-image` declarations in `index.css`.
 */
export const RANKED_BACKDROP_NARROW_URL = "/assets/ranked/ranked-academy-duel-bg-960w.webp";

/** The viewport breakpoint `index.css` switches the backdrop at. */
export const RANKED_BACKDROP_NARROW_MAX_PX = 640;

/** Which backdrop encode this viewport will paint. */
export function rankedBackdropUrl(viewportWidth?: number): string {
  const w = viewportWidth ?? (typeof window === "undefined" ? undefined : window.innerWidth);
  return w !== undefined && w <= RANKED_BACKDROP_NARROW_MAX_PX
    ? RANKED_BACKDROP_NARROW_URL
    : RANKED_CHROME_URLS[0];
}

/** The role mascot a rail draws for `role`, or null. */
export function rankedRoleMascotUrl(role: RankedRole | null | undefined): string | null {
  // RFX1 2B2 — the ARENA encode, because the arena is what will render it.
  // `RoleCrest`/`MobileMatchBar` pass `art="compact"`, so this is the same URL
  // the <img> asks for and the warm is a cache hit rather than a second file.
  return role ? getRankedRoleMascotPath(role, "compact") : null;
}

/** Chrome is CSS backgrounds, so there is nothing to decode. */
export function prepareRankedChrome(viewportWidth?: number): void {
  // Only the encode this viewport will paint; see `rankedBackdropUrl`.
  const urls = [rankedBackdropUrl(viewportWidth), ...RANKED_CHROME_URLS.slice(1)];
  for (const url of urls) void prepareImage(url, { priority: "low", decode: false });
}
