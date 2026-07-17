export { AD_PLACEMENTS, isKnownPlacement, type AdPlacement, type AdPlacementMeta } from "./placements";
export {
  resolveAdPolicy,
  classifyBlockedRoute,
  type AdPolicyContext,
  type AdPolicyDecision,
  type AdSuppressionReason,
  type ProStatus,
} from "./policy";
export { getAdsConfig, type AdsConfig } from "./config";
export { pickHouseAd, type HouseAdCreative } from "./houseAds";
export { emitAdEvent, setAdEventSink, type AdLifecycleEvent } from "./analytics";
export {
  getConsentState,
  useConsentState,
  subscribeConsent,
  setConsentStateFromCmp,
  resetConsentForTests,
  connectCmpAdapter,
  type CmpAdapter,
  type ConsentState,
} from "./consent";
export { isProductionAdHost } from "./adHosts";
export {
  ensureGoogleAdsScript,
  getAdsensePublisherId,
  getGoogleLoaderState,
  type GoogleLoaderState,
} from "./googleLoader";
export {
  useLegacyAdGate,
  resolveLegacyAdGate,
  type LegacyAdGateDecision,
  type LegacyAdGateOverrides,
} from "./useLegacyAdGate";
