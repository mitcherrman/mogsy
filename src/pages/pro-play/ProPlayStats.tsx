import { Link } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import ProStatsExplorer from "@/components/pro-play/ProStatsExplorer";
import { PRO_PLAY_ROUTE, PRO_PLAY_STATS_ROUTE } from "@/lib/pro-play/routes";

/**
 * Pro Stats — the statistics table on its own route (PP-IA2).
 *
 * The explorer itself is unchanged. It used to sit at the bottom of the hub,
 * sharing the hub's query string: its "Clear all" reset the URL to `?view=…`
 * and dropped the selected match, and its season leaderboards read as part of
 * the match above them. Here it owns its URL outright, so every filter stays
 * copyable and nothing on this page can change a Match Center selection.
 */
export default function ProPlayStats() {
  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title="Pro Stats | Mogzy"
        description="Professional League of Legends statistics — players, teams and champions by season, league, patch and role, drawn from real pro match history."
        path={PRO_PLAY_STATS_ROUTE}
      />
      <div className="relative mx-auto w-full max-w-[1400px] space-y-4 px-3 pb-8 sm:px-6 lg:px-0">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 py-2 sm:min-h-14 sm:gap-x-5">
          <Link
            to={PRO_PLAY_ROUTE}
            aria-label="Back to Pro Play"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Pro Play
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-wide text-[#e3c66f]">
            <Trophy className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" />
            Pro Stats
          </h1>
        </header>
        <section id="pro-stats" aria-label="Pro Stats">
          <ProStatsExplorer />
        </section>
      </div>
    </div>
  );
}
