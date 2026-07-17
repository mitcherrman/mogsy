/**
 * Reactive consent boundary.
 *
 * No CMP is integrated yet, so consent starts — and in production currently
 * stays — "unknown", which structurally blocks all third-party (Google)
 * rendering and script loading. When Google Privacy & Messaging (or another
 * certified CMP) is added, its adapter is the ONLY code that should call
 * `setConsentStateFromCmp`. Application code must never manufacture
 * "granted", and nothing here persists to localStorage — the CMP owns
 * persistence of the user's choice.
 *
 * Consent can change mid-session (grant, deny, withdraw). Components read it
 * through `useConsentState()` (useSyncExternalStore) so eligibility
 * recomputes immediately. Withdrawal (granted → denied) suppresses all
 * FUTURE unit renders and script loads; already-served Google iframes are
 * not forcibly destroyed from our code — Google's own tags respond to the
 * CMP signal, and tearing down live ad iframes manually is unsafe/unneeded.
 */

import { useSyncExternalStore } from "react";

export type ConsentState = "granted" | "denied" | "unknown";

let state: ConsentState = "unknown";
const listeners = new Set<() => void>();

export function getConsentState(): ConsentState {
  return state;
}

export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Trusted CMP adapter entry point. Call ONLY from a real CMP integration
 * (see `CmpAdapter` below) or from tests.
 */
export function setConsentStateFromCmp(next: ConsentState): void {
  if (next !== "granted" && next !== "denied" && next !== "unknown") return;
  if (next === state) return;
  state = next;
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      // one bad listener must not break consent propagation
    }
  }
}

/** Test hook: reset to the safe default between tests. */
export function resetConsentForTests(): void {
  setConsentStateFromCmp("unknown");
}

/** React hook — re-renders subscribers when consent changes mid-session. */
export function useConsentState(): ConsentState {
  return useSyncExternalStore(subscribeConsent, getConsentState, getConsentState);
}

/**
 * Adapter contract for the future Google Privacy & Messaging (or other
 * certified CMP) integration. The exact callback names/payloads of Google's
 * consent APIs must be taken from current Google documentation at wiring
 * time — they are deliberately NOT guessed here. The adapter's job:
 *
 *   1. Initialize the CMP script per Google's docs (consent-gated regions,
 *      US state opt-out messages as configured in AdSense Privacy &
 *      Messaging).
 *   2. Translate the CMP's advertising-consent signal into exactly one of
 *      "granted" | "denied" | "unknown".
 *   3. Call `setConsentStateFromCmp` on initial resolution and on every
 *      subsequent change (including withdrawal).
 */
export interface CmpAdapter {
  /** Start listening to the CMP; returns a cleanup/unsubscribe function. */
  start(onChange: (state: ConsentState) => void): () => void;
}

let activeAdapterCleanup: (() => void) | null = null;

/** Register the real CMP adapter (call once at app bootstrap when it exists). */
export function connectCmpAdapter(adapter: CmpAdapter): () => void {
  activeAdapterCleanup?.();
  activeAdapterCleanup = adapter.start(setConsentStateFromCmp);
  return () => {
    activeAdapterCleanup?.();
    activeAdapterCleanup = null;
  };
}
