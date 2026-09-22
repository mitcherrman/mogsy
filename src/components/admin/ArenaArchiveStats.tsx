// ---------------------------------------------------------------------------
// Arena archive counters — the retired voting product's row counts.
//
// Formerly AdminStats, the counter strip on the legacy dashboard and then on
// Admin Overview, where it presented Match & Rank era numbers (leagues,
// matches, preset items, image clicks) as if they were the platform's. FUNNEL1C
// moved it here, under Arena, and dropped its "Users" counter: that counted
// every non-bot `profiles` row, which includes one row per guest session, and
// the honest current numbers now live on Overview and in Analytics.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type CounterKey = "bots" | "leagues" | "matches" | "presetItems" | "imageClicks";
type Counts = Record<CounterKey, number | null>;

const LABELS: Array<[CounterKey, string]> = [
  ["leagues", "Leagues"],
  ["matches", "Matches"],
  ["presetItems", "Preset items"],
  ["imageClicks", "Image clicks"],
  ["bots", "League bots"],
];

export default function ArenaArchiveStats() {
  const [counts, setCounts] = useState<Counts>({
    bots: null,
    leagues: null,
    matches: null,
    presetItems: null,
    imageClicks: null,
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_bot", true),
      supabase.from("leagues").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
      supabase.from("preset_items").select("id", { count: "exact", head: true }),
      supabase.from("image_clicks").select("id", { count: "exact", head: true }),
    ]).then(([bots, leagues, matches, items, clicks]) => {
      if (cancelled) return;
      setCounts({
        bots: bots.count ?? null,
        leagues: leagues.count ?? null,
        matches: matches.count ?? null,
        presetItems: items.count ?? null,
        imageClicks: clicks.count ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5" data-testid="arena-archive-stats">
      {LABELS.map(([key, label]) => (
        <div key={key} className="rounded-md border border-border bg-muted/20 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="text-base font-semibold tabular-nums">{counts[key] ?? "…"}</dd>
        </div>
      ))}
    </dl>
  );
}
