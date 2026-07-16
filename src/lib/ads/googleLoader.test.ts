import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureGoogleAdsScript,
  getAdsensePublisherId,
  getGoogleLoaderState,
  resetGoogleLoaderForTests,
  type EnsureGoogleAdsOptions,
} from "./googleLoader";
import type { AdsConfig } from "./config";

const allOn: AdsConfig = {
  adsGloballyEnabled: true,
  thirdPartyAdsEnabled: true,
  houseAdsEnabled: true,
  placeholdersEnabled: true,
};

const PUB = "ca-pub-9823769047605421";

function opts(overrides: Partial<EnsureGoogleAdsOptions> = {}): EnsureGoogleAdsOptions {
  return {
    config: allOn,
    consent: "granted",
    policyEligible: true,
    allowInTestEnv: true,
    publisherIdOverride: PUB,
    ...overrides,
  };
}

function scripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll('script[src*="adsbygoogle.js"]'));
}

describe("ensureGoogleAdsScript", () => {
  beforeEach(() => {
    resetGoogleLoaderForTests();
    scripts().forEach((s) => s.remove());
    document.querySelectorAll('meta[name="google-adsense-account"]').forEach((m) => m.remove());
  });

  afterEach(() => {
    scripts().forEach((s) => s.remove());
  });

  it("does not inject when global ads are disabled", async () => {
    const ok = await ensureGoogleAdsScript(opts({ config: { ...allOn, adsGloballyEnabled: false } }));
    expect(ok).toBe(false);
    expect(scripts()).toHaveLength(0);
  });

  it("does not inject when third-party ads are disabled", async () => {
    const ok = await ensureGoogleAdsScript(opts({ config: { ...allOn, thirdPartyAdsEnabled: false } }));
    expect(ok).toBe(false);
    expect(scripts()).toHaveLength(0);
  });

  it("does not inject without explicit granted consent", async () => {
    for (const consent of ["unknown", "denied"] as const) {
      expect(await ensureGoogleAdsScript(opts({ consent }))).toBe(false);
    }
    expect(scripts()).toHaveLength(0);
  });

  it("does not inject without an eligible policy decision (covers Pro, loading entitlement, excluded routes/states)", async () => {
    // Pro users, unresolved entitlement, and excluded routes all yield a
    // suppressed policy decision — callers pass policyEligible: false.
    const ok = await ensureGoogleAdsScript(opts({ policyEligible: false }));
    expect(ok).toBe(false);
    expect(scripts()).toHaveLength(0);
  });

  it("does not run in the test environment unless a test explicitly opts in", async () => {
    const ok = await ensureGoogleAdsScript(opts({ allowInTestEnv: false }));
    expect(ok).toBe(false);
    expect(scripts()).toHaveLength(0);
    expect(getGoogleLoaderState()).toBe("idle");
  });

  it("injects at most one script across concurrent calls", async () => {
    const [a, b, c] = [
      ensureGoogleAdsScript(opts()),
      ensureGoogleAdsScript(opts()),
      ensureGoogleAdsScript(opts()),
    ];
    expect(scripts()).toHaveLength(1);
    expect(getGoogleLoaderState()).toBe("loading");
    scripts()[0].dispatchEvent(new Event("load"));
    expect(await Promise.all([a, b, c])).toEqual([true, true, true]);
    expect(getGoogleLoaderState()).toBe("loaded");
    expect(scripts()).toHaveLength(1);
    expect(scripts()[0].src).toContain(`client=${PUB}`);
  });

  it("reuses an existing matching script instead of injecting a second", async () => {
    const existing = document.createElement("script");
    existing.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + PUB;
    document.head.appendChild(existing);
    expect(await ensureGoogleAdsScript(opts())).toBe(true);
    expect(getGoogleLoaderState()).toBe("loaded");
    expect(scripts()).toHaveLength(1);
  });

  it("handles script failure safely and only retries when explicitly asked", async () => {
    const p = ensureGoogleAdsScript(opts());
    scripts()[0].dispatchEvent(new Event("error"));
    expect(await p).toBe(false);
    expect(getGoogleLoaderState()).toBe("failed");
    expect(scripts()).toHaveLength(0);
    // No implicit retry:
    expect(await ensureGoogleAdsScript(opts())).toBe(false);
    expect(scripts()).toHaveLength(0);
    // Explicit retry re-attempts:
    const retry = ensureGoogleAdsScript(opts({ retry: true }));
    expect(scripts()).toHaveLength(1);
    scripts()[0].dispatchEvent(new Event("load"));
    expect(await retry).toBe(true);
  });

  it("fails closed when no publisher ID is configured (never fabricates)", async () => {
    const ok = await ensureGoogleAdsScript(opts({ publisherIdOverride: undefined }));
    expect(ok).toBe(false);
    expect(scripts()).toHaveLength(0);
  });
});

describe("getAdsensePublisherId", () => {
  beforeEach(() => {
    document.querySelectorAll('meta[name="google-adsense-account"]').forEach((m) => m.remove());
  });

  it("reads the account-verification meta tag", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "google-adsense-account");
    meta.setAttribute("content", PUB);
    document.head.appendChild(meta);
    expect(getAdsensePublisherId()).toBe(PUB);
    meta.remove();
  });

  it("returns null when nothing valid is configured", () => {
    expect(getAdsensePublisherId()).toBeNull();
  });

  it("rejects a malformed meta value", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "google-adsense-account");
    meta.setAttribute("content", "ca-pub-XXXX");
    document.head.appendChild(meta);
    expect(getAdsensePublisherId()).toBeNull();
    meta.remove();
  });
});
