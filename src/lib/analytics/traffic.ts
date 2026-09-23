/**
 * USERS1 — traffic classification.
 *
 * WHAT THIS IS FOR
 *
 * Before this module, every browser that loaded a page was counted the same
 * way, and — worse — every browser that loaded a page became a Supabase auth
 * user. Production ended up with ~5,000 anonymous identities and an analytics
 * store dominated by Claude/Codex sessions, Playwright runs, previews and
 * crawlers. The counts were not wrong by a little; they were measuring the
 * development process.
 *
 * So each SESSION now carries a class:
 *
 *   human       strong evidence of a person using the product
 *   automation  a crawler, a headless browser, a driver-controlled browser
 *   internal    our own deliberately marked QA / agent / preview traffic
 *   unknown     not enough evidence either way
 *
 *
 * THE THREE RULES THAT KEEP THIS HONEST
 *
 * 1. UNKNOWN IS NOT HUMAN. A session starts `unknown` and is promoted to
 *    `human` only when the browser reports a trusted human input event. We do
 *    not assume that the absence of bot evidence is the presence of a person,
 *    because that assumption is exactly how the current numbers got inflated.
 *
 * 2. THE EXPLICIT MARKER CAN ONLY EXCLUDE, NEVER LAUNDER. A caller may mark
 *    itself `internal` or `automation`. It may NOT mark itself `human` — that
 *    class is reachable only through a real input event. This is what stops
 *    the marker from becoming a way to dress automation up as an audience.
 *
 * 3. NOTHING HERE IS A SECURITY CONTROL. Classification is self-reported
 *    analytics metadata. No authorization, rate limit, gate or entitlement may
 *    read it. It exists so operator KPIs describe the audience; a determined
 *    caller can lie to it and that is acceptable, because lying to it gains
 *    them nothing.
 *
 *
 * NO FINGERPRINTING
 *
 * The signals below are coarse facts about the environment — `navigator.
 * webdriver`, obvious bot tokens in the user agent, and which host is being
 * served. Nothing reads a canvas, a font list, screen metrics, or an IP, and
 * nothing attempts to re-derive an identity from them. A returning visitor is
 * recognised by the first-party visitor id in localStorage and by nothing else
 * (see identity.ts).
 *
 *
 * HOW A CODING AGENT OR TEST MARKS ITSELF — see docs/USERS1_HANDOFF.md
 *
 *   URL      ...?mgz_traffic=internal&mgz_source=claude
 *            (persisted for this browser, so it survives navigation)
 *   Script   window.__MOGZY_TRAFFIC__ = { class: "internal", source: "playwright" }
 *            set before the app boots — Playwright's addInitScript, a bookmarklet
 *   Build    VITE_TRAFFIC_CLASS=internal VITE_TRAFFIC_SOURCE=smoke_test
 *   Clear    ...?mgz_traffic=clear
 */

import { clamp } from "./runtime";
import { e2eEnabled } from "@/lib/e2e/identity";

export const TRAFFIC_CLASSES = ["human", "automation", "internal", "unknown"] as const;
export type TrafficClass = (typeof TRAFFIC_CLASSES)[number];

export type TrafficSignal = {
  trafficClass: TrafficClass;
  /** Who/what it is, when known: "claude", "playwright", "googlebot", "preview". */
  trafficSource: string | null;
  /** Why this class was chosen. Stored so a number can always be explained. */
  classificationReason: string;
};

export const TRAFFIC_MARKER_KEY = "mogzy.analytics.traffic.v1";
export const TRAFFIC_QUERY_CLASS = "mgz_traffic";
export const TRAFFIC_QUERY_SOURCE = "mgz_source";

const SOURCE_MAX = 64;
const REASON_MAX = 200;

export const UNKNOWN_TRAFFIC: TrafficSignal = {
  trafficClass: "unknown",
  trafficSource: null,
  classificationReason: "no signal",
};

export function isTrafficClass(value: unknown): value is TrafficClass {
  return typeof value === "string" && (TRAFFIC_CLASSES as readonly string[]).includes(value);
}

/**
 * Classes a caller is allowed to claim for itself. `human` is absent on
 * purpose — see rule 2 in the file header.
 */
const MARKABLE: readonly TrafficClass[] = ["internal", "automation"];

/**
 * Bot tokens, lowercase, matched as substrings of the user agent.
 *
 * Deliberately short and boring. A long list of vendor strings goes stale and
 * creates the impression that detection is complete; it is not, which is what
 * `unknown` is for. These are the tokens that appear in the traffic this
 * product actually sees.
 */
const BOT_TOKENS = [
  "headlesschrome",
  "playwright",
  "puppeteer",
  "selenium",
  "phantomjs",
  "cypress",
  "lighthouse",
  "chrome-lighthouse",
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "baiduspider",
  "applebot",
  "slurp",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "slackbot",
  "petalbot",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "bytespider",
  "gptbot",
  "claudebot",
  "claude-web",
  "anthropic-ai",
  "perplexitybot",
  "ccbot",
  "python-requests",
  "curl/",
  "wget/",
  "node-fetch",
  "axios/",
  "bot",
  "crawler",
  "spider",
] as const;

/** Hosts that are never the live product, so their traffic is ours by definition. */
function hostKind(hostname: string): { source: string; reason: string } | null {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".localhost")) {
    return { source: "localhost", reason: "served from localhost" };
  }
  if (
    h.endsWith(".lovable.app") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovable.dev") ||
    h.endsWith(".sandbox.lovable.dev")
  ) {
    return { source: "preview", reason: `preview host ${h}` };
  }
  return null;
}

type MarkerInput = {
  search?: string;
  hostname?: string;
  userAgent?: string;
  webdriver?: boolean;
  /** Injected by a test harness before boot. */
  injected?: unknown;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  env?: { class?: string; source?: string };
};

function storageOrNull(): MarkerInput["storage"] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type StoredMarker = { class: TrafficClass; source: string | null };

function readInjected(injected: unknown): StoredMarker | null {
  if (!injected || typeof injected !== "object") return null;
  const raw = injected as { class?: unknown; source?: unknown };
  if (!isTrafficClass(raw.class) || !MARKABLE.includes(raw.class)) return null;
  return { class: raw.class, source: clamp(typeof raw.source === "string" ? raw.source : null, SOURCE_MAX) };
}

/**
 * The explicit marker, resolved and persisted.
 *
 * Persisting it is the point: an agent that arrives once with the query
 * parameter stays classified for the rest of the browser's life, so the very
 * first page load is not the only one excluded. `?mgz_traffic=clear` removes
 * it, which is how a person takes their own browser back.
 */
export function resolveTrafficMarker(input: MarkerInput = {}): StoredMarker | null {
  const storage = input.storage ?? storageOrNull();

  // 1. Injected global — a test harness that ran before any of our code.
  const injectedRaw =
    input.injected ??
    (typeof window !== "undefined"
      ? (window as unknown as { __MOGZY_TRAFFIC__?: unknown }).__MOGZY_TRAFFIC__
      : undefined);
  const injected = readInjected(injectedRaw);
  if (injected) return injected;

  // 2. Query parameter, which also writes through to storage.
  const search = input.search ?? (typeof window !== "undefined" ? window.location.search : "");
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search ?? "");
  } catch {
    params = new URLSearchParams();
  }
  const queried = params.get(TRAFFIC_QUERY_CLASS);
  if (queried === "clear") {
    try {
      storage?.removeItem(TRAFFIC_MARKER_KEY);
    } catch {
      /* storage unavailable — the marker was never persisted anyway */
    }
    return null;
  }
  if (isTrafficClass(queried) && MARKABLE.includes(queried)) {
    const marker: StoredMarker = {
      class: queried,
      source: clamp(params.get(TRAFFIC_QUERY_SOURCE), SOURCE_MAX),
    };
    try {
      storage?.setItem(TRAFFIC_MARKER_KEY, JSON.stringify(marker));
    } catch {
      /* not persistable; still applies to this page load */
    }
    return marker;
  }

  // 3. Previously persisted marker.
  try {
    const raw = storage?.getItem(TRAFFIC_MARKER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { class?: unknown; source?: unknown };
      const stored = readInjected(parsed);
      if (stored) return stored;
    }
  } catch {
    /* corrupt marker is the same as no marker */
  }

  // 4. Build-time marker, for a deployment that is internal in its entirety.
  const envClass = input.env?.class ?? (import.meta.env.VITE_TRAFFIC_CLASS as string | undefined);
  const envSource = input.env?.source ?? (import.meta.env.VITE_TRAFFIC_SOURCE as string | undefined);
  if (isTrafficClass(envClass) && MARKABLE.includes(envClass)) {
    return { class: envClass, source: clamp(envSource ?? null, SOURCE_MAX) };
  }

  return null;
}

/**
 * Classify the current browser.
 *
 * Precedence, highest first:
 *   1. E2E mode            — our own acceptance runner, by definition internal.
 *   2. Explicit marker     — internal / automation only.
 *   3. Driver or bot UA    — automation.
 *   4. Non-production host — internal (localhost, Lovable preview).
 *   5. unknown             — everything else, until a person touches something.
 */
export function classifyTraffic(input: MarkerInput = {}): TrafficSignal {
  const signal = (
    trafficClass: TrafficClass,
    trafficSource: string | null,
    classificationReason: string,
  ): TrafficSignal => ({
    trafficClass,
    trafficSource: clamp(trafficSource, SOURCE_MAX),
    classificationReason: clamp(classificationReason, REASON_MAX) ?? "unclassified",
  });

  try {
    if (e2eEnabled()) return signal("internal", "e2e", "VITE_E2E_AUTH acceptance run");
  } catch {
    /* import.meta.env unavailable (Remotion bundle) — fall through */
  }

  const marker = resolveTrafficMarker(input);
  if (marker) return signal(marker.class, marker.source, "explicitly marked by the caller");

  const webdriver =
    input.webdriver ??
    (typeof navigator !== "undefined" ? navigator.webdriver === true : false);
  if (webdriver) return signal("automation", "webdriver", "navigator.webdriver is true");

  const ua = (
    input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "")
  ).toLowerCase();
  const token = BOT_TOKENS.find((t) => ua.includes(t));
  if (token) return signal("automation", token, `user agent contains "${token}"`);

  const hostname =
    input.hostname ?? (typeof window !== "undefined" ? window.location.hostname : "");
  const host = hostname ? hostKind(hostname) : null;
  if (host) return signal("internal", host.source, host.reason);

  return { ...UNKNOWN_TRAFFIC };
}

/**
 * Is this browser one we would ever promote to `human`?
 *
 * A driver-controlled browser dispatches input events that the DOM reports as
 * trusted — CDP input is indistinguishable from a real click at the event
 * level — so `isTrusted` alone cannot carry this decision. The webdriver flag
 * is what actually separates them, and it is checked at promotion time as well
 * as at classification time.
 */
export function canPromoteToHuman(input: { webdriver?: boolean } = {}): boolean {
  const webdriver =
    input.webdriver ?? (typeof navigator !== "undefined" ? navigator.webdriver === true : false);
  return !webdriver;
}
