/**
 * Patch Hub Catch-Up domain (PH3-B): pure, no React, no fetch, no storage.
 * See docs/PATCH_HUB_PH3_CATCHUP_HANDOFF.md.
 */
export { buildCatchUpReport } from "./build";
export { VERIFIED_ALIASES } from "./aliases";
export { classifyChainValues } from "./classify";
export { continuityKey, continuityKeyString, scopeOfCard } from "./keys";
export { adjacency, analyzeCoverage, comparePatchVersions, parsePatchVersion } from "./patch-range";
export { canonicalLabel, canonicalValue, valueFact, valueTemplate } from "./value";
export type * from "./types";
