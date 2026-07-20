// React Query hooks + countdown for Combat Sim Battles (Phase 3A).
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { battlesApi, BattlesApiError } from "@/lib/combat-battles/api";
import type { Side } from "@/lib/combat-battles/types";

const KEYS = {
  list: ["combat-battles", "list"] as const,
  detail: (slug: string) => ["combat-battles", "detail", slug] as const,
  arena: ["combat-battles", "arena-score"] as const,
};

export function useBattleList() {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: ({ signal }) => battlesApi.list(signal).then((r) => r.battles),
    staleTime: 30_000,
  });
}

/** Battle detail carries prediction + settlement + (post-reveal) result. */
export function useBattleDetail(slug: string | undefined, enabled = true) {
  return useQuery({
    queryKey: KEYS.detail(slug ?? ""),
    queryFn: ({ signal }) => battlesApi.detail(slug!, signal),
    enabled: Boolean(slug) && enabled,
    staleTime: 15_000,
  });
}

export function useMyArenaScore(enabled = true) {
  return useQuery({
    queryKey: KEYS.arena,
    queryFn: ({ signal }) => battlesApi.myArenaScore(signal),
    enabled,
    staleTime: 30_000,
    retry: false, // 401/403 for guests shouldn't retry
  });
}

export function useSubmitPrediction(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (side: Side) => battlesApi.submitPrediction(slug, side),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(slug) });
    },
    onError: (err) => {
      // On a lock-race (or any window transition), the server is authoritative —
      // refetch so the UI reflects the true final state.
      if (err instanceof BattlesApiError && err.isWindowClosed) {
        qc.invalidateQueries({ queryKey: KEYS.detail(slug) });
      }
    },
  });
}

export function invalidateBattleDetailKey(slug: string) {
  return ["combat-battles", "detail", slug] as const;
}

/**
 * Server-reconciled countdown to an ISO target. Presentation-only: it never
 * unlocks/reveals/settles anything. On reaching the target it calls `onBoundary`
 * exactly once so the caller can refetch server-authoritative state.
 *
 * Clock-skew handling mirrors the Daily Score Attack timer: the target is a
 * server timestamp; we compare against Date.now() and treat the crossing as a
 * signal to reconcile with the server, never as the source of truth.
 */
export function useCountdown(targetIso: string | null, onBoundary?: () => void) {
  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    targetIso ? Math.max(0, Date.parse(targetIso) - Date.now()) : null,
  );
  const firedRef = useRef(false);
  const cbRef = useRef(onBoundary);
  cbRef.current = onBoundary;

  useEffect(() => {
    firedRef.current = false;
    if (!targetIso) {
      setRemainingMs(null);
      return;
    }
    const target = Date.parse(targetIso);
    const tick = () => {
      const rem = Math.max(0, target - Date.now());
      setRemainingMs(rem);
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        cbRef.current?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [targetIso]);

  return remainingMs;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
