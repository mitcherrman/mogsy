/**
 * Academy Pulse — PULSE-2A: the live content provider.
 *
 * One provider per VIEWER. A guest (no session, or an anonymous one) gets the
 * public editorial catalogue and Pulse makes no request at all. A signed-in
 * account gets the same editorial catalogue plus scenes about its own record
 * (see `live-items.ts`), read through the product's existing self-scoped
 * clients (`live-reads.ts`).
 *
 * GUARANTEES
 *   bounded      the reads share one deadline (`timeoutMs`); a read still
 *                running then is aborted and contributes nothing
 *   cancellable  the caller's AbortSignal aborts every read in flight
 *   never empty  `load` never rejects except on the caller's own abort: a
 *                failed, refused, malformed or slow read leaves the editorial
 *                catalogue exactly as a guest sees it
 *   per viewer   the warm cache is keyed by the viewer and holds ONE viewer;
 *                another viewer never sees it, even for a frame
 *   promotions   a viewer the server (or the entitlement session) knows to be
 *                Premium is not shown the Premium promotion
 *
 * Not here, on purpose: community activity, leaderboards, percentiles,
 * achievements and streaks. The backend has no consented public read for any
 * of them (see docs/handoffs/ACADEMY_PULSE_P2A.md §2), so those cadence slots
 * stay empty and the scheduler skips them.
 */
import type { HistoryPage } from "@/lib/history/contracts";
import type { TrendReport } from "@/lib/quiz/analyticsApi";

import type { PulseCatalogue, PulseContentProvider } from "../../model/pulse-types";
import { publicPulseCatalogue } from "../pulse-provider";
import { dailyRecordItem, dailyTrendItem, practiceItem, serverSaysPremium, withLiveItems } from "./live-items";
import { httpPulseLiveReads, type PulseLiveReads } from "./live-reads";

export type PulseViewer =
  | { kind: "guest" }
  | {
      kind: "account";
      /** The auth user id: the cache key only. Never sent, logged or rendered by Pulse. */
      id: string;
      /** The entitlement session's answer; "unknown" until it resolves. */
      premium: "pro" | "free" | "unknown";
    };

export const GUEST_VIEWER: PulseViewer = Object.freeze({ kind: "guest" });

/** The whole budget for a viewer's reads. Past it, Pulse plays editorial. */
export const LIVE_READ_TIMEOUT_MS = 3_000;
/** How long a viewer's reads stay warm (a remount, a layout switch). */
export const LIVE_CACHE_TTL_MS = 5 * 60_000;

interface LiveResult {
  page: HistoryPage | null;
  report: TrendReport | null;
}

let warm: { viewerId: string; at: number; result: LiveResult } | null = null;

/** Tests and sign-out. */
export function clearPulseLiveCache(): void {
  warm = null;
}

function warmFor(viewerId: string, now: number): LiveResult | null {
  if (!warm) return null;
  if (warm.viewerId !== viewerId || now - warm.at > LIVE_CACHE_TTL_MS) {
    warm = null;
    return null;
  }
  return warm.result;
}

export function composeLiveCatalogue(viewer: PulseViewer, result: LiveResult | null): PulseCatalogue {
  const base = publicPulseCatalogue();
  if (viewer.kind === "guest" || !result) return base;
  const { page, report } = result;
  return withLiveItems(
    base,
    [page && dailyRecordItem(page), page && dailyTrendItem(page), report && practiceItem(report)],
    { dropPremiumPromo: viewer.premium === "pro" || serverSaysPremium(page, report) },
  );
}

function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === "AbortError";
}

/** Settles with the read's value, or null for any failure (including the deadline). */
function settle<T>(read: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<T | null>((resolve) => {
    const onAbort = () => resolve(null);
    signal.addEventListener("abort", onAbort, { once: true });
    read(signal).then(
      (v) => { signal.removeEventListener("abort", onAbort); resolve(signal.aborted ? null : v); },
      () => { signal.removeEventListener("abort", onAbort); resolve(null); },
    );
  });
}

export interface LiveProviderOptions {
  reads?: PulseLiveReads;
  timeoutMs?: number;
  now?: () => number;
}

export function createLivePulseProvider(viewer: PulseViewer, opts: LiveProviderOptions = {}): PulseContentProvider {
  if (viewer.kind === "guest") {
    return {
      id: "live-v1:guest",
      load: async () => composeLiveCatalogue(viewer, null),
      peek: () => composeLiveCatalogue(viewer, null),
    };
  }
  const reads = opts.reads ?? httpPulseLiveReads;
  const timeoutMs = opts.timeoutMs ?? LIVE_READ_TIMEOUT_MS;
  const now = opts.now ?? Date.now;

  return {
    id: `live-v1:account:${viewer.premium}`,
    // Warm reads draw at once. Cold, the glass stays empty for at most the
    // read budget rather than showing editorial scenes that are swapped out
    // under the viewer a moment later.
    peek: () => {
      const result = warmFor(viewer.id, now());
      return result ? composeLiveCatalogue(viewer, result) : null;
    },
    load: async (outer) => {
      const cached = warmFor(viewer.id, now());
      if (cached) return composeLiveCatalogue(viewer, cached);

      const ctl = new AbortController();
      const forward = () => ctl.abort();
      outer?.addEventListener("abort", forward, { once: true });
      if (outer?.aborted) ctl.abort();
      const deadline = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const [page, report] = await Promise.all([settle(reads.history, ctl.signal), settle(reads.practice, ctl.signal)]);
        if (outer?.aborted) throw new DOMException("Pulse content load aborted", "AbortError");
        const result: LiveResult = { page, report };
        // Only a complete answer is kept warm: a timed-out or failed read is retried next mount.
        if (page && report) warm = { viewerId: viewer.id, at: now(), result };
        return composeLiveCatalogue(viewer, result);
      } catch (e) {
        if (isAbort(e)) throw e;
        return composeLiveCatalogue(viewer, null);
      } finally {
        clearTimeout(deadline);
        outer?.removeEventListener("abort", forward);
      }
    },
  };
}
