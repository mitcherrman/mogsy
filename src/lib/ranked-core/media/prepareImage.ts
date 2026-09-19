/**
 * RFX1 Phase 2B1 — prepare ONE image before Ranked shows it.
 *
 * Narrow on purpose: this is not an asset manager. The browser's HTTP cache
 * does the caching; this module only makes sure the request STARTS early, that
 * a second caller for the same URL joins the first request instead of issuing
 * another, and that an `<img>` which mounts later finds the bytes (and, where
 * `decode()` is supported, a decoded frame) ready.
 *
 * THE CONTRACT A CALLER CAN RELY ON
 *   * It never rejects. A broken image resolves `"error"`; a slow one resolves
 *     `"timeout"` when the CALLER's budget runs out. Ranked must never wait on
 *     an image forever, and nothing here can make it.
 *   * The timeout belongs to the caller, not to the load. A caller that gives
 *     up at 600 ms does not cancel the request; a later caller with more time
 *     joins the same in-flight load and can still see it finish.
 *   * No decoded image is retained. The `HTMLImageElement` is dropped as soon
 *     as it settles; the entry kept per URL is a settled string, not pixels.
 *   * Failures are forgotten, successes are remembered. A URL that errored can
 *     be retried by a later round (the network may have recovered); one that
 *     loaded resolves immediately forever after.
 */

export type PrepareResult = "ok" | "error" | "timeout";

export interface PrepareOptions {
  /** `high` for media the next reveal depends on; `low` for decoration. */
  priority?: "high" | "low" | "auto";
  /** Call `img.decode()` after load, where supported. Default true. */
  decode?: boolean;
  /** This caller's budget. The load itself carries on past it. Default 8000. */
  timeoutMs?: number;
}

type PriorityImage = HTMLImageElement & { fetchPriority?: "high" | "low" | "auto" };

const DEFAULT_TIMEOUT_MS = 8000;
/** A safety valve, not a cache policy: entries are tiny settled promises. */
const MAX_ENTRIES = 400;

interface Entry {
  promise: Promise<"ok" | "error">;
  settled: "ok" | "error" | null;
  /** When the request was ISSUED — the measurement Phase 2B1 is about. */
  startedAt: number;
  settledAt: number | null;
}

const entries = new Map<string, Entry>();

/** One spelling per resource, so `/a.png` and `https://host/a.png` share. */
export function normalizeImageUrl(url: string): string {
  try {
    const base = typeof window !== "undefined" ? window.location.href : "http://localhost/";
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

function load(url: string, opts: PrepareOptions): Entry {
  const entry: Entry = {
    promise: Promise.resolve("error"),
    settled: null,
    startedAt: now(),
    settledAt: null,
  };
  entry.promise = new Promise<"ok" | "error">((resolve) => {
    let img: PriorityImage | null = new Image() as PriorityImage;
    const finish = (result: "ok" | "error") => {
      if (!img) return;
      // Drop the element: the browser cache holds the bytes, and nothing here
      // should keep a decoded bitmap alive after the round that wanted it.
      img.onload = null;
      img.onerror = null;
      img = null;
      entry.settled = result;
      entry.settledAt = now();
      if (result === "error") entries.delete(url);
      resolve(result);
    };
    img.decoding = "async";
    if (opts.priority && opts.priority !== "auto") img.fetchPriority = opts.priority;
    img.onload = () => {
      const el = img;
      if (!el) return;
      if (opts.decode !== false && typeof el.decode === "function") {
        // A decode failure after a successful load still leaves the bytes in
        // cache, which is most of the win: treat it as ok.
        el.decode().then(() => finish("ok"), () => finish("ok"));
      } else {
        finish("ok");
      }
    };
    img.onerror = () => finish("error");
    img.src = url;
  });
  if (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  entries.set(url, entry);
  return entry;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Start (or join) preparation of `url`. Resolves `"ok" | "error" | "timeout"`;
 * never rejects. Safe to call from render-time effects any number of times.
 */
export function prepareImage(url: string | null | undefined, opts: PrepareOptions = {}): Promise<PrepareResult> {
  if (!url || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve("error");
  }
  const key = normalizeImageUrl(url);
  const existing = entries.get(key);
  const entry = existing ?? load(key, opts);
  if (entry.settled) return Promise.resolve(entry.settled);
  const budget = Math.max(0, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return new Promise<PrepareResult>((resolve) => {
    const timer = setTimeout(() => resolve("timeout"), budget);
    entry.promise.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

/** Prepare several; resolves once every one has settled or timed out. */
export function prepareImages(
  urls: readonly string[], opts: PrepareOptions = {},
): Promise<PrepareResult[]> {
  return Promise.all(urls.map((u) => prepareImage(u, opts)));
}

/** Has this URL already loaded (and decoded) in this page? */
export function isImagePrepared(url: string): boolean {
  return entries.get(normalizeImageUrl(url))?.settled === "ok";
}

/**
 * Measurement only: when a URL's preparation was issued and settled, in
 * `performance.now()` ms. Used by the Phase 2B1 timing harness; nothing in the
 * product reads it.
 */
export function imagePreparationTiming(url: string): { startedAt: number; settledAt: number | null } | null {
  const e = entries.get(normalizeImageUrl(url));
  return e ? { startedAt: e.startedAt, settledAt: e.settledAt } : null;
}

/** Test seam. */
export function __resetPreparedImagesForTests(): void {
  entries.clear();
}
