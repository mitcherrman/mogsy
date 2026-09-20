/**
 * RFX1 Phase 2B1 — Ranked's three preparation tiers, attached to the state the
 * arena already has. No new polling, no new server calls, no new authority.
 *
 *   Tier 1  persistent chrome + both seats' role mascots. Chrome starts on
 *           mount (and earlier still, from the lobby handoff —
 *           `warmRankedEntry`); a mascot starts the moment its role is known.
 *   Tier 2  the PRESENTED round's media, from its payload, the moment the
 *           payload is known. For round 1 that is inside the server's entry
 *           lead-in, before `started_at`.
 *   Tier 3  `upcomingRound` — the round the server has opened while the arena
 *           still presents the previous one's reveal. Its media is requested
 *           as soon as it exists, so the requests begin BEFORE the swap.
 *
 * Meta Reflex needs no tier of its own: its round payload carries all five
 * cards, and `rankedRoundMedia` returns every card's art, so the whole block
 * is prepared the moment the block round is known (as Tier 3 during the
 * previous reveal, at the latest as Tier 2 when it is presented).
 *
 * Nothing here decides timing. The only waits that consult preparation are the
 * reveal hold's bounded swap gate (`useRankedMatch.prepareRound`) and round 1's
 * bounded entry wait, and both are capped by the server's `started_at`.
 */
import { useContext, useEffect, useRef, useState } from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { championAssetsQuery, type ChampionManifest } from "@/hooks/useChampionAssets";
import { upcomingRound } from "@/lib/ranked-core/flow/rankedFlow";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import { prepareImage, prepareImages } from "./prepareImage";
import { prepareRankedChrome, rankedRoleMascotUrl } from "./rankedChrome";
import { rankedRoundMedia, roundMediaKey } from "./roundMedia";

/** Upper bound on one round's critical preparation; the gates cap far sooner. */
const ROUND_PREP_BUDGET_MS = 10_000;

const viewportWidth = () => (typeof window !== "undefined" ? window.innerWidth : undefined);

const mark = (name: string) => {
  try { performance.mark(name); } catch { /* measurement only */ }
};

/**
 * The swap gate's preparer: resolves when `round`'s CRITICAL media has settled
 * (loaded, failed or timed out). Joins requests already in flight.
 */
export function prepareRoundCritical(round: PublicRoundView): Promise<unknown> {
  return prepareImages(rankedRoundMedia(round, { viewportWidth: viewportWidth() }).critical,
    { priority: "high", timeoutMs: ROUND_PREP_BUDGET_MS });
}

/**
 * Round 1 entry preparation, as the arena can observe it. Phase 2B2's visible
 * intro reads this; 2B1 only uses `preparing` to keep the existing placeholder
 * up for a bounded moment.
 *
 *   match-unresolved   no snapshot yet: only the match id is known
 *   preparing          first question known; its critical media is loading
 *   ready              critical media settled (or its budget ran out) and the
 *                      first question is on screen, before `started_at`
 *   live               `started_at` has passed — the clock is running
 */
export type RankedEntryPhase = "match-unresolved" | "preparing" | "ready" | "live";

export function projectEntryPhase(args: {
  hasRound: boolean;
  entryPreparing: boolean;
  msUntilAnswerable: number | null;
}): RankedEntryPhase {
  if (!args.hasRound) return "match-unresolved";
  if (args.entryPreparing) return "preparing";
  return args.msUntilAnswerable !== null && args.msUntilAnswerable > 0 ? "ready" : "live";
}

function usePrepareRound(round: PublicRoundView | null, hasManifest: boolean,
                         manifest: ChampionManifest | null, tier: string) {
  const key = roundMediaKey(round);
  useEffect(() => {
    if (!round || !key) return;
    const media = rankedRoundMedia(round, { manifest, viewportWidth: viewportWidth() });
    mark(`ranked-prep:${tier}:start:${key}`);
    void prepareImages(media.critical, { priority: "high", timeoutMs: ROUND_PREP_BUDGET_MS })
      .then(() => mark(`ranked-prep:${tier}:ready:${key}`));
    for (const url of media.bestEffort) void prepareImage(url, { priority: "low" });
    // `round` is read through `key`: a new snapshot of the SAME round's
    // content must not restart anything. `hasManifest` re-runs once when the
    // manifest lands, which only adds fallback splashes (dedupe does the rest).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasManifest]);
}

export function useRankedMediaPreparation(args: {
  /** The controller's live snapshot (authority). */
  live: PublicRoundView | null;
  /** The round the surface presents (lags `live` through a reveal). */
  presented: PublicRoundView | null;
}): void {
  const { live, presented } = args;
  // The same query every champion card uses, so this only STARTS the manifest
  // fetch earlier; it is shared, not duplicated. Read through the context
  // OPTIONALLY: the arena renders without a QueryClient in isolation (tests,
  // dev probes), and preparation must never be a reason it cannot.
  const client = useContext(QueryClientContext);
  const [manifest, setManifest] = useState<ChampionManifest | null>(
    () => client?.getQueryData<ChampionManifest | null>(championAssetsQuery.queryKey) ?? null);
  useEffect(() => {
    if (!client || manifest) return;
    let alive = true;
    client.fetchQuery(championAssetsQuery)
      .then((m) => { if (alive && m) setManifest(m); }, () => { /* fallbacks only */ });
    return () => { alive = false; };
  }, [client, manifest]);
  const hasManifest = !!manifest;

  // Tier 1 — chrome once per mount (a no-op after the lobby warmed it).
  useEffect(() => { prepareRankedChrome(); }, []);
  // Tier 1 — both seats' mascots, as soon as the frozen roles are known.
  const roles = (live?.players ?? []).map((p) => p.role).filter(Boolean) as RankedRole[];
  const rolesKey = roles.join(",");
  useEffect(() => {
    // Low: ~1 MB PNGs today (Phase 2B2 re-encodes them); the question's own
    // critical media must win the bandwidth.
    for (const r of roles) void prepareImage(rankedRoleMascotUrl(r), { priority: "low" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesKey]);

  // Tier 2 — the presented round (round 1: inside the server lead-in).
  usePrepareRound(presented ?? live, hasManifest, manifest, "current");
  // Tier 3 — the next round, while the previous one is still being revealed.
  usePrepareRound(upcomingRound(live, presented), hasManifest, manifest, "next");
}

/**
 * Round 1's bounded entry wait. Returns true while the arena should keep its
 * existing placeholder because round 1's critical media is still preparing
 * AND the server's lead-in leaves room for it (`budgetMs`, from
 * `entryPrepBudgetMs`). Decided ONCE, synchronously, from the first snapshot
 * this mount sees — so the arena never flashes before the placeholder — and a
 * reload into a running round has no budget and never waits.
 *
 * It cannot stick: `prepareImages` resolves by `budgetMs` at the latest, and
 * later polls (new snapshot objects) neither restart nor cancel the wait.
 */
export function useEntryPreparation(
  first: PublicRoundView | null, budgetMs: (round: PublicRoundView) => number,
): boolean {
  const [done, setDone] = useState(false);
  const decisionRef = useRef<{ budget: number } | null>(null);
  if (decisionRef.current === null && first) decisionRef.current = { budget: budgetMs(first) };
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  useEffect(() => {
    const decision = decisionRef.current;
    if (!first || !decision || decision.budget <= 0 || startedRef.current) return;
    startedRef.current = true;
    mark("ranked-prep:entry:start");
    void prepareImages(
      rankedRoundMedia(first, { viewportWidth: viewportWidth() }).critical,
      { priority: "high", timeoutMs: decision.budget },
    ).then(() => {
      mark("ranked-prep:entry:ready");
      if (mountedRef.current) setDone(true);
    });
  }, [first]);
  return !!decisionRef.current && decisionRef.current.budget > 0 && !done;
}
