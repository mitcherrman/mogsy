/**
 * Idempotent, consent-aware Google AdSense script loader.
 *
 * Replaces the old unconditional <script> tag in index.html. The script is
 * now loaded ONLY on demand, and only when every gate passes:
 *   - global ads enabled (VITE_ADS_ENABLED)
 *   - third-party ads enabled (VITE_THIRD_PARTY_ADS_ENABLED)
 *   - consent explicitly "granted" (no CMP exists yet, so this is
 *     structurally unreachable in production today)
 *   - the caller holds a third-party-eligible policy decision
 *   - a valid, legitimate publisher ID is configured (never fabricated)
 *
 * The publisher identity is the owner's real AdSense account. Its single
 * deployed source of truth is the existing account-verification meta tag in
 * index.html (`<meta name="google-adsense-account">`); an optional
 * VITE_ADSENSE_PUBLISHER_ID env var takes precedence when set. A missing or
 * malformed ID fails closed.
 *
 * Test-mode note: Google unit test behavior (data-adtest on non-production
 * hosts) is applied by AdBanner at the unit level and is unaffected here.
 */

import type { AdsConfig } from "./config";
import type { ConsentState } from "./consent";

export type GoogleLoaderState = "idle" | "loading" | "loaded" | "failed";

const SCRIPT_SRC_MATCH = 'script[src*="adsbygoogle.js"]';
const PUBLISHER_ID_PATTERN = /^ca-pub-\d{6,}$/;

let state: GoogleLoaderState = "idle";
let pending: Promise<boolean> | null = null;

export function getGoogleLoaderState(): GoogleLoaderState {
  return state;
}

/** Test hook: reset module state between tests. */
export function resetGoogleLoaderForTests(): void {
  state = "idle";
  pending = null;
}

/**
 * The legitimate publisher ID, from a single controlled source:
 * env override first, otherwise the account-verification meta tag.
 * Returns null (fail closed) when absent or malformed — never fabricates.
 */
export function getAdsensePublisherId(): string | null {
  const fromEnv = import.meta.env.VITE_ADSENSE_PUBLISHER_ID;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "") {
    const value = fromEnv.trim();
    return PUBLISHER_ID_PATTERN.test(value) ? value : null;
  }
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="google-adsense-account"]');
    const content = (meta?.getAttribute("content") ?? "").trim();
    if (PUBLISHER_ID_PATTERN.test(content)) return content;
  }
  return null;
}

export interface EnsureGoogleAdsOptions {
  config: AdsConfig;
  consent: ConsentState;
  /** True only when the policy resolver returned a third-party-eligible decision. */
  policyEligible: boolean;
  /** Explicit retry after a previous script failure. Never retried implicitly. */
  retry?: boolean;
  /** Unit tests only: allow injection inside the vitest environment. */
  allowInTestEnv?: boolean;
  /** Unit tests only: bypass the meta/env publisher lookup. */
  publisherIdOverride?: string;
}

/**
 * Ensure the AdSense script is present. Resolves true when the script is
 * (or already was) loaded, false when any gate suppresses loading or the
 * load fails. Never throws; concurrent callers share one promise, so at
 * most one script tag is ever injected.
 */
export function ensureGoogleAdsScript(opts: EnsureGoogleAdsOptions): Promise<boolean> {
  try {
    // Never load ad scripts inside the test runner unless a test opts in.
    if (import.meta.env.MODE === "test" && !opts.allowInTestEnv) {
      return Promise.resolve(false);
    }
    if (!opts.config.adsGloballyEnabled) return Promise.resolve(false);
    if (!opts.config.thirdPartyAdsEnabled) return Promise.resolve(false);
    if (opts.consent !== "granted") return Promise.resolve(false);
    if (!opts.policyEligible) return Promise.resolve(false);
    if (typeof document === "undefined") return Promise.resolve(false);

    if (state === "loaded") return Promise.resolve(true);
    if (state === "loading" && pending) return pending;
    if (state === "failed" && !opts.retry) return Promise.resolve(false);

    const publisherId = opts.publisherIdOverride ?? getAdsensePublisherId();
    if (!publisherId) {
      state = "failed";
      return Promise.resolve(false);
    }

    // Reuse a script somebody else already put on the page.
    const existing = document.querySelector(SCRIPT_SRC_MATCH);
    if (existing) {
      state = "loaded";
      return Promise.resolve(true);
    }

    state = "loading";
    pending = new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.async = true;
      script.crossOrigin = "anonymous";
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
      script.addEventListener("load", () => {
        state = "loaded";
        pending = null;
        resolve(true);
      });
      script.addEventListener("error", () => {
        state = "failed";
        pending = null;
        script.remove();
        resolve(false);
      });
      document.head.appendChild(script);
    });
    return pending;
  } catch {
    // Loader failures must never surface into product UI.
    state = "failed";
    pending = null;
    return Promise.resolve(false);
  }
}
