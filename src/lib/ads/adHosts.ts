/**
 * Production-host recognition for Google ad units.
 *
 * On production hosts, AdSense units run live; on every other host (previews,
 * localhost, historical domains) units carry data-adtest="on" so no live ad
 * traffic is generated. The canonical public origin is https://mogzy.lol —
 * historical domains (mogsy.app, mogsy.net) are redirect-only and therefore
 * deliberately NOT recognized as production for ad serving.
 *
 * Recognizing a host here does NOT enable serving by itself: global/third-
 * party flags, consent, and the ad policy all still gate every unit.
 */

const PRODUCTION_AD_HOSTS = new Set(["mogzy.lol", "www.mogzy.lol"]);

export function isProductionAdHost(hostname: string): boolean {
  return PRODUCTION_AD_HOSTS.has(hostname.trim().toLowerCase());
}
