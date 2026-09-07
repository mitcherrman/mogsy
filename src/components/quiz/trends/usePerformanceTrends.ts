/**
 * PT1.8 — the Trends pane's state, as one hook.
 *
 * It holds the chosen window, the server's capability answer and the report,
 * and it decides nothing: which windows exist, whether there is enough
 * evidence, and which way a category is moving all arrive from the backend and
 * are re-enforced there.
 *
 * TWO REQUESTS, IN THIS ORDER, ON PURPOSE. The capability read is ungated and
 * always runs; the report is only asked for once the server has said the
 * caller may have it. That is what keeps a refusal (a paywall) and a failure
 * (an outage) apart in the pane above — see the error branch there.
 *
 * WHERE THE ANSWERS COME FROM IS A PARAMETER (PT1.9)
 * ──────────────────────────────────────────────────
 * `source` defaults to the real, self-scoped `analyticsApi` and every existing
 * caller keeps it. The master-admin demo preview passes a different one that
 * reads a synthetic account through an admin-gated route, so the owner can put
 * the Free and Premium presentations side by side and judge the split.
 *
 * It is one parameter and not a second hook, because the point of the preview
 * is that it renders through THIS logic: the ordering of the two requests, the
 * "a failed request is not a paywall" rule and the window handling are the
 * behaviour under evaluation, and a copy of them would be a copy that can
 * disagree with what ships.
 */
import { useCallback, useEffect, useState } from "react";
import {
  analyticsApi,
  type AnalyticsCapability,
  type TrendReport,
} from "@/lib/quiz/analyticsApi";

/**
 * Where a Trends pane gets its two answers. The real one is `analyticsApi`;
 * nothing else in the shipped product implements this.
 */
export type TrendsSource = {
  capability: () => Promise<{ capability: AnalyticsCapability }>;
  trends: (windowDays: number) => Promise<TrendReport>;
};

export type TrendsState = {
  capability: AnalyticsCapability | null;
  report: TrendReport | null;
  windowDays: number | null;
  loading: boolean;
  /** A request did not return. NEVER rendered as a paywall. */
  error: string | null;
  setWindow: (days: number) => void;
  reload: () => void;
};

export function usePerformanceTrends(
  enabled: boolean,
  source: TrendsSource = analyticsApi,
): TrendsState {
  const [capability, setCapability] = useState<AnalyticsCapability | null>(null);
  const [report, setReport] = useState<TrendReport | null>(null);
  const [windowDays, setWindowDays] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Mounted only while the pane is open: this is an account-bound read and a
  // reader who never opens Trends should not spend a request on it.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const answer = await source.capability();
        if (cancelled) return;
        setCapability(answer.capability);
        if (!answer.capability.can_view_trends) {
          setReport(null);
          return;
        }
        const first = windowDays ?? answer.capability.trend_windows[0];
        if (first == null) return;
        setWindowDays(first);
        const next = await source.trends(first);
        if (!cancelled) setReport(next);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Trends are unavailable.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `windowDays` is deliberately not a dependency: changing the window is
    // handled by `setWindow` below, which fetches exactly one report. Listing
    // it here would fetch the same report twice on every switch.
    // `source` IS one: the demo preview swaps it when the Free/Premium toggle
    // moves, and that is exactly the moment both answers must be re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, reloadKey, source]);

  const setWindow = useCallback(
    (days: number) => {
      if (!capability?.can_view_trends) return;
      setWindowDays(days);
      setLoading(true);
      setError(null);
      source
        .trends(days)
        .then(setReport)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Trends are unavailable."),
        )
        .finally(() => setLoading(false));
    },
    [capability, source],
  );

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { capability, report, windowDays, loading, error, setWindow, reload };
}
