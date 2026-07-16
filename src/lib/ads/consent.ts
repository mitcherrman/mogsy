/**
 * Consent integration boundary.
 *
 * No CMP exists yet, so consent is permanently "unknown" and third-party
 * (Google) rendering is structurally impossible: the policy resolver and the
 * Google script loader both require an explicit "granted".
 *
 * When a CMP is integrated, this module is the ONLY place that should learn
 * about it — return the CMP's advertising-consent signal here and every
 * consumer (AdSlot, useLegacyAdGate, googleLoader) picks it up. Never return
 * "granted" from application code without a real CMP behind it.
 */

export type ConsentState = "granted" | "denied" | "unknown";

export function getConsentState(): ConsentState {
  return "unknown";
}
