/**
 * RFX1 Phase 2B1 — Tier 1: what the Ranked arena draws on every round.
 *
 * Deliberately tiny (constants + `prepareImage`), because the LOBBY imports it
 * to warm the arena during its matched→navigation beat and must not pull the
 * question-surface code into its own bundle.
 */
import { MOGZY_ROLE_ASSETS } from "@/components/mascot/mascot-assets";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { prepareImage } from "./prepareImage";

/**
 * The arena's persistent chrome: CSS backgrounds under `.ranked-academy`
 * (`ranked-academy-duel-bg.png`), the folio (`ranked-vellum-texture.png`) and
 * the player rails (`navy-banner2.png`). A test asserts each is still in
 * `src/index.css`.
 */
export const RANKED_CHROME_URLS: readonly string[] = [
  "/assets/ranked/ranked-academy-duel-bg.png",
  "/assets/ranked/ranked-vellum-texture.png",
  "/assets/ranked/navy-banner2.png",
];

/** The role mascot a rail draws for `role`, or null. */
export function rankedRoleMascotUrl(role: RankedRole | null | undefined): string | null {
  return role ? MOGZY_ROLE_ASSETS[role] ?? null : null;
}

/** Chrome is CSS backgrounds, so there is nothing to decode. */
export function prepareRankedChrome(): void {
  for (const url of RANKED_CHROME_URLS) void prepareImage(url, { priority: "low", decode: false });
}
