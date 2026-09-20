/**
 * FUNNEL1B1 — the unglamorous primitives every other analytics module sits on:
 * a UUID source, a storage wrapper that cannot throw, and the diagnostics
 * channel that keeps "fire and forget" from meaning "fail and never know".
 *
 * Nothing here imports Supabase or React. It is the layer that has to work in
 * a private window, in a sandboxed iframe, in jsdom, and on the landing page
 * before any session exists.
 */

/** DEV-only console prefix, so an analytics warning is identifiable at a glance. */
const LOG_PREFIX = "[analytics]";

export type AnalyticsFailure = {
  /** Which operation failed — "insert:analytics_events", "storage:read", … */
  readonly op: string;
  readonly message: string;
  readonly at: number;
};

/**
 * WHY THIS EXISTS AT ALL.
 *
 * The predecessor (`trackFunnelEvent`) swallowed every error into a bare
 * `catch {}`. That contract is right — analytics must never break gameplay —
 * but it is also exactly how a missing table went unnoticed in production for
 * two months (see docs/FUNNEL1_HANDOFF.md §5). Silence is the correct
 * behaviour for the USER and the wrong behaviour for the DEVELOPER.
 *
 * So failures still never propagate, and they are still never surfaced in the
 * UI, but they are counted and the most recent ones are retained. In DEV they
 * also reach the console. A smoke test, a debug panel, or a future Admin
 * freshness indicator can read this instead of rediscovering the outage.
 */
const MAX_RETAINED_FAILURES = 20;

const diagnostics = {
  failures: [] as AnalyticsFailure[],
  failureCount: 0,
  eventsSent: 0,
};

export function recordFailure(op: string, error: unknown): void {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

  diagnostics.failureCount += 1;
  diagnostics.failures.push({ op, message, at: Date.now() });
  if (diagnostics.failures.length > MAX_RETAINED_FAILURES) {
    diagnostics.failures.shift();
  }

  // import.meta.env is absent under plain node (the PGlite suites); guard it.
  const isDev =
    typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
  if (isDev && typeof console !== "undefined") {
    console.warn(`${LOG_PREFIX} ${op} failed: ${message}`);
  }
}

export function recordSent(): void {
  diagnostics.eventsSent += 1;
}

/** Read-only snapshot for tests, debug panels and smoke checks. */
export function getAnalyticsDiagnostics(): {
  failureCount: number;
  eventsSent: number;
  failures: readonly AnalyticsFailure[];
} {
  return {
    failureCount: diagnostics.failureCount,
    eventsSent: diagnostics.eventsSent,
    failures: [...diagnostics.failures],
  };
}

/** Test-only. Production has no reason to forget its own failures. */
export function resetAnalyticsDiagnostics(): void {
  diagnostics.failures = [];
  diagnostics.failureCount = 0;
  diagnostics.eventsSent = 0;
}

// ---------------------------------------------------------------------------
// UUIDs
// ---------------------------------------------------------------------------

/**
 * crypto.randomUUID() is unavailable on http:// origins (it requires a secure
 * context) and in a few older mobile browsers. getRandomValues is available
 * far more widely; Math.random is the last resort and is explicitly NOT
 * cryptographic — it only has to avoid collisions within one browser's
 * lifetime, which is all a visitor id needs of it.
 */
export function secureUuid(): string {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // fall through
    }
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // RFC 4122 v4 bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * localStorage throws — not returns null, THROWS — when site data is blocked,
 * in some private windows, and inside a cross-origin iframe. It is also absent
 * entirely under this repo's jsdom pin (see src/test/localStorageStub.ts).
 * Every access goes through here, and every one of them can fail without
 * anything above noticing.
 */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch (error) {
      recordFailure("storage:read", error);
      return null;
    }
  },

  set(key: string, value: string): boolean {
    try {
      globalThis.localStorage?.setItem(key, value);
      return true;
    } catch (error) {
      recordFailure("storage:write", error);
      return false;
    }
  },

  remove(key: string): void {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch (error) {
      recordFailure("storage:remove", error);
    }
  },
};

export function readJson<T>(key: string): T | null {
  const raw = safeStorage.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    // A corrupt record is worse than no record: it would pin a visitor to a
    // broken session forever. Drop it and let the caller mint a fresh one.
    recordFailure("storage:parse", error);
    safeStorage.remove(key);
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    return safeStorage.set(key, JSON.stringify(value));
  } catch (error) {
    recordFailure("storage:serialize", error);
    return false;
  }
}

/** Trim and cap, matching the CHECK constraints in the migration. */
export function clamp(value: string | null | undefined, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}
