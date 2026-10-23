/**
 * GR1 — gameplay timing, split by WHERE the time went.
 *
 * A player who says "the answer felt slow" can mean five different things,
 * and they have five different owners:
 *
 *   * `frontend`      — the click waiting on this tab (handler work, auth
 *                       header minting) before the request leaves;
 *   * `network`       — transport: request out, response headers back,
 *                       MINUS whatever the server says it spent;
 *   * `backend`       — the server's own processing, read from its
 *                       `Server-Timing: app;dur=…` header (absent → unknown,
 *                       never guessed);
 *   * `polling`       — the gap between an acknowledged answer and the
 *                       snapshot that confirms it (a cadence cost, not a
 *                       server cost);
 *   * `presentation`  — INTENTIONAL holds (the reveal beat, title beats).
 *                       Recorded so they are never mistaken for latency, and
 *                       never a target for "make it faster".
 *   * `render`        — state committed → next painted frame.
 *
 * Local only. Nothing here leaves the device: the ring is read in DevTools
 * (`window.__mogzyGameplayTiming.summary()`) and mirrored as
 * `performance.measure` entries in the Performance panel. Recording can never
 * throw into gameplay — every entry point is wrapped.
 */

export type TimingCategory =
  | "frontend" | "network" | "backend" | "polling" | "presentation" | "render";

export interface TimingRecord {
  /** e.g. `ranked.submit`, `ranked.poll`, `answer.ack_to_locked`. */
  name: string;
  category: TimingCategory;
  ms: number;
  /** Wall-clock instant the measured span ended (epoch ms). */
  at: number;
  /** Free-form, non-sensitive labels (status, outcome, round). Never answers. */
  detail?: Record<string, string | number | boolean | null>;
}

export const TIMING_RING_SIZE = 400;

const ring: TimingRecord[] = [];

const now = (): number =>
  (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now() : Date.now();

/** A monotonic reading for span starts. */
export const timingNow = now;

export function recordTiming(rec: Omit<TimingRecord, "at"> & { at?: number }): void {
  try {
    if (!Number.isFinite(rec.ms) || rec.ms < 0) return;
    const full: TimingRecord = { ...rec, ms: Math.round(rec.ms * 10) / 10, at: rec.at ?? Date.now() };
    ring.push(full);
    if (ring.length > TIMING_RING_SIZE) ring.splice(0, ring.length - TIMING_RING_SIZE);
    if (typeof performance !== "undefined" && typeof performance.measure === "function") {
      const end = now();
      performance.measure(`mogzy:${full.category}:${full.name}`,
        { start: Math.max(0, end - full.ms), end, detail: full.detail });
    }
  } catch { /* instrumentation must never cost a frame of gameplay */ }
}

/**
 * Parse `Server-Timing` for the backend's `app` duration (ms), or null.
 * Only the `app` metric is read; anything else (or a malformed header) is
 * "unknown", which is the honest answer when the server did not say.
 */
export function serverAppMs(header: string | null | undefined): number | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().split(";");
    if (name.trim() !== "app") continue;
    for (const p of params) {
      const [k, v] = p.trim().split("=");
      if (k === "dur") {
        const ms = Number(v);
        return Number.isFinite(ms) && ms >= 0 ? ms : null;
      }
    }
  }
  return null;
}

/**
 * One request's split: total round trip, backend share (if stated), and the
 * remainder attributed to transport. Recorded as separate categories so a
 * summary can be read without arithmetic.
 */
export function recordRequestTiming(name: string, totalMs: number,
                                    serverTiming: string | null,
                                    detail: TimingRecord["detail"]): void {
  const backend = serverAppMs(serverTiming);
  recordTiming({ name, category: "network",
    ms: backend === null ? totalMs : Math.max(0, totalMs - backend),
    detail: { ...detail, total_ms: Math.round(totalMs), backend_known: backend !== null } });
  if (backend !== null) recordTiming({ name, category: "backend", ms: backend, detail });
}

/** Record the frames between "state committed" and "painted" (double rAF). */
export function recordPaint(name: string, detail?: TimingRecord["detail"]): void {
  try {
    if (typeof requestAnimationFrame !== "function") return;
    const start = now();
    requestAnimationFrame(() => requestAnimationFrame(() =>
      recordTiming({ name, category: "render", ms: now() - start, detail })));
  } catch { /* see recordTiming */ }
}

export function timingRecords(): readonly TimingRecord[] {
  return ring.slice();
}

export function clearTimingRecords(): void {
  ring.length = 0;
}

export interface TimingStat { count: number; p50: number; p95: number; max: number }

/** Percentiles per `category:name`, for a DevTools glance. */
export function timingSummary(): Record<string, TimingStat> {
  const groups = new Map<string, number[]>();
  for (const r of ring) {
    const key = `${r.category}:${r.name}`;
    const list = groups.get(key) ?? [];
    list.push(r.ms);
    groups.set(key, list);
  }
  const pick = (sorted: number[], q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))];
  const out: Record<string, TimingStat> = {};
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => a - b);
    out[key] = { count: sorted.length, p50: pick(sorted, 0.5), p95: pick(sorted, 0.95),
      max: sorted[sorted.length - 1] };
  }
  return out;
}

declare global {
  interface Window {
    __mogzyGameplayTiming?: {
      records: typeof timingRecords;
      summary: typeof timingSummary;
      clear: typeof clearTimingRecords;
    };
  }
}

if (typeof window !== "undefined" && !window.__mogzyGameplayTiming) {
  window.__mogzyGameplayTiming = {
    records: timingRecords, summary: timingSummary, clear: clearTimingRecords,
  };
}
