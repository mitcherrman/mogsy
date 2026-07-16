/**
 * Advertising feature flags, read from Vite env at build time.
 *
 * Safe defaults: everything off. `VITE_ADS_ENABLED` is the global emergency
 * kill switch — when false (or unset) no ad code renders anything anywhere,
 * regardless of the other flags.
 *
 * No flag here enables any Google/AdSense network call; a third-party
 * provider does not exist yet (see providers boundary in AdSlot.tsx).
 */

export interface AdsConfig {
  /** Global kill switch. Default false. */
  adsGloballyEnabled: boolean;
  /** Future third-party (e.g. AdSense) eligibility. Default false. */
  thirdPartyAdsEnabled: boolean;
  /** Internal house promotions. Default false. */
  houseAdsEnabled: boolean;
  /** Dashed dev placeholders. Only honored outside production builds. */
  placeholdersEnabled: boolean;
}

function flag(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

export function getAdsConfig(): AdsConfig {
  const env = import.meta.env;
  return {
    adsGloballyEnabled: flag(env.VITE_ADS_ENABLED),
    thirdPartyAdsEnabled: flag(env.VITE_THIRD_PARTY_ADS_ENABLED),
    houseAdsEnabled: flag(env.VITE_HOUSE_ADS_ENABLED),
    // Placeholders are a development aid: never in production builds.
    placeholdersEnabled: flag(env.VITE_AD_PLACEHOLDERS_ENABLED) && !env.PROD,
  };
}
