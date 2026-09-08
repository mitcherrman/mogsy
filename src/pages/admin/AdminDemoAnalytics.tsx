/**
 * PT1.9 — the owner's Free-vs-Premium analytics comparison.
 *
 * ONE SYNTHETIC RECORD, TWO PRESENTATIONS, THE REAL PANE
 * ─────────────────────────────────────────────────────
 * PT1.8's split is provisional and this page exists so it can be judged before
 * it is locked. What it renders is `PerformanceTrendsPane` itself — the pane
 * that ships on `/quiz#trends`, with its own paywall, its own error branch and
 * its own window picker — reading a demo account through an admin-gated route.
 * A mock-up of the pane would have been easier and would have been a mock-up
 * of a component that is not the product.
 *
 * The two presentations are rendered SIDE BY SIDE rather than behind a switch
 * whenever the viewport allows it, because "is the Free half enough?" is a
 * comparison and a comparison read from memory is a worse comparison. On a
 * narrow screen they stack, and the toggle above selects one.
 *
 * IT IS OBVIOUSLY A DEMO, IN EVERY BRANCH
 * ───────────────────────────────────────
 * Every pane carries a dashed rubric banner supplied by the server, and the
 * page carries its own. That is deliberate belt-and-braces: a screenshot of
 * the Premium half is the single most shareable artefact this page produces,
 * and it must not be mistakable for a real player's record.
 *
 * WHO CAN SEE IT
 * ──────────────
 * `master_admin` on the route (see App.tsx), which is the same gate the ADM2
 * user directory uses, and `require_admin` on the server, which is the gate
 * that actually decides. Nothing on a consumer route imports this file.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import PerformanceTrendsPane from "@/components/quiz/trends/PerformanceTrendsPane";
import {
  demoAnalyticsApi,
  demoTrendsSource,
  type DemoPreview,
  type DemoTarget,
} from "@/lib/quiz/demoAnalyticsApi";

const PREVIEW_LABEL: Record<DemoPreview, string> = {
  free: "Preview as Free",
  premium: "Preview as Premium",
};

const PREVIEW_BLURB: Record<DemoPreview, string> = {
  free: "What a Free account sees: the figures over one 7-day window — answers, accuracy, days studied, per category and per mode. No comparison, no direction, no weakness diagnosis.",
  premium: "What a Mogzy Premium account sees: the same rows, plus what they mean over time — 7/30/90, the period before, deltas, direction and recurring weakness.",
};

type Layout = "both" | DemoPreview;

/** The pane, on its own vellum sheet, so it is read in the material it
 *  actually prints on rather than on the admin shell's dark plate. */
function PreviewSheet({
  target,
  preview,
  banner,
}: {
  target: string;
  preview: DemoPreview;
  banner: string;
}) {
  // Rebuilt whenever the target or the presentation changes, and passed as a
  // hook dependency, so the toggle re-reads BOTH answers. Leaving a Premium
  // report on screen under a Free capability is the one wrong thing this page
  // could show.
  const source = useMemo(
    () => demoTrendsSource(target, preview),
    [target, preview],
  );
  return (
    <section
      className="min-w-0 flex-1 rounded-md border border-border/60 bg-card/40 p-3"
      data-testid={`demo-preview-${preview}`}
    >
      <header className="mb-2 space-y-0.5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.16em]">
          {PREVIEW_LABEL[preview]}
        </h2>
        <p className="text-[11px] text-muted-foreground">
          {PREVIEW_BLURB[preview]}
        </p>
      </header>
      {/* `lc-vellum` redefines the palette to the parchment one but paints
          nothing — on the real surface the sheet image behind it does that.
          Here the ground is a flat fill of the same token, because what this
          page needs is the ink at its real contrast, not the torn edge; the
          fill is LIGHTER than the sheet's darkest point under text, which is
          the case those ink values were derived against. Without it the
          parchment ink prints on the admin shell's dark plate and the pane is
          unreadable — which is how this was found. */}
      <div className="lc-vellum rounded-sm bg-background px-3 py-1 text-foreground">
        <PerformanceTrendsPane
          key={`${target}:${preview}`}
          source={source}
          demoNotice={banner}
          /*
           * PT1.11 — the Practice action RENDERS here, and does nothing.
           *
           * PT1.9 withheld the handler entirely, on the grounds that acting on
           * it would configure a real session for the ADMIN's account out of a
           * synthetic account's weaknesses. That risk is real but it lives in
           * the Builder, and this page mounts none: there is no
           * PracticeBuilderPanel on it to receive a preset. Withholding the
           * handler therefore bought no safety and cost the owner the ability
           * to SEE the affordance on the surface built for reviewing it —
           * which is the entire purpose of this page.
           *
           * So the button appears, and the handler is inert by construction.
           */
          onPractiseWeakness={() => {
            /* inert: no Builder is mounted on this page to receive a preset */
          }}
        />
      </div>
    </section>
  );
}

export default function AdminDemoAnalytics() {
  const [targets, setTargets] = useState<DemoTarget[] | null>(null);
  const [banner, setBanner] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("both");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    demoAnalyticsApi
      .targets()
      .then((body) => {
        if (cancelled) return;
        setTargets(body.targets);
        setBanner(body.banner);
        setSelected((current) => current ?? body.targets[0]?.user_id ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unavailable.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const target = useMemo(
    () => targets?.find((t) => t.user_id === selected) ?? null,
    [targets, selected],
  );

  const shown: DemoPreview[] =
    layout === "both" ? ["free", "premium"] : [layout];

  return (
    <div className="space-y-4" data-testid="admin-demo-analytics">
      <SEOHead
        title="Mogzy Admin · Demo analytics"
        description="Compare the Free and Premium presentations of Performance Trends against a synthetic record."
        path="/admin/demo-analytics"
        noindex
      />

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">Demo analytics</h1>
          <span
            className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive"
            data-testid="demo-page-badge"
          >
            Synthetic data
          </span>
        </div>
        <p className="max-w-3xl text-[12px] text-muted-foreground">
          The same fabricated study record, read by the shipped analytics and
          rendered twice — as a Free account sees it and as a Premium account
          sees it. Both halves come out of one call to{" "}
          <code className="text-[11px]">trend_report()</code> and one
          server-side projection, so the two tiers cannot disagree about a
          figure. Nothing on this page is a real player, nothing here changes
          any entitlement, and no request on it writes anything.
        </p>
        {banner && (
          <p
            className="flex max-w-3xl items-start gap-1.5 rounded-sm border border-dashed border-destructive/60 px-2 py-1.5 text-[11px] text-destructive"
            data-testid="demo-page-banner"
          >
            <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" aria-hidden />
            {banner}
          </p>
        )}
      </header>

      {loading && !targets && (
        <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading demo identities…
        </p>
      )}

      {error && (
        <div className="space-y-2" data-testid="demo-error">
          <p className="text-[12px] text-destructive">{error}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
        </div>
      )}

      {targets && targets.length === 0 && (
        <p className="text-[12px] text-muted-foreground" data-testid="demo-empty">
          This deployment registers no demo identities.
        </p>
      )}

      {targets && targets.length > 0 && (
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Demo identity
            </span>
            <select
              data-testid="demo-target-select"
              className="h-8 rounded-sm border border-border bg-background px-2 text-[12px]"
              value={selected ?? ""}
              onChange={(event) => setSelected(event.target.value)}
            >
              {targets.map((entry) => (
                <option key={entry.user_id} value={entry.user_id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Presentation
            </span>
            <div
              role="group"
              aria-label="Presentation"
              className="flex items-center gap-1"
              data-testid="demo-preview-toggle"
            >
              {(["both", "free", "premium"] as Layout[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  data-testid={`demo-layout-${option}`}
                  aria-pressed={layout === option}
                  onClick={() => setLayout(option)}
                  className={
                    "rounded-sm border px-2 py-1 text-[11px] font-semibold capitalize " +
                    (layout === option
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground")
                  }
                >
                  {option === "both" ? "Side by side" : option}
                </button>
              ))}
            </div>
          </div>

          {target && (
            <p
              className="max-w-md text-[11px] text-muted-foreground"
              data-testid="demo-target-note"
            >
              <span className="font-mono">{target.user_id}</span> ·{" "}
              {target.is_seeded ? (
                <>
                  {target.seeded.attempts} synthetic answers over{" "}
                  {target.seeded.sessions} practice runs
                </>
              ) : (
                <span className="text-destructive">
                  not seeded on this deployment — run
                  scripts/seed_demo_analytics.py --apply
                </span>
              )}
              . {target.note}
            </p>
          )}
        </div>
      )}

      {target && target.is_seeded && (
        <div className="flex flex-col gap-4 lg:flex-row">
          {shown.map((preview) => (
            <PreviewSheet
              key={preview}
              target={target.user_id}
              preview={preview}
              banner={banner}
            />
          ))}
        </div>
      )}
    </div>
  );
}
