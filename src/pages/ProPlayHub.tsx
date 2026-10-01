import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import ProStatsExplorer from "@/components/pro-play/ProStatsExplorer";
import { HubKicker } from "@/components/pro-play/hub/HubSection";
import MatchCenter from "@/components/pro-play/hub/MatchCenter";
import MatchWorkspace from "@/components/pro-play/hub/MatchWorkspace";
import ProPlayDiscovery, { SearchEntry } from "@/components/pro-play/hub/ProPlayDiscovery";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import { useLiveFeed, useLiveMatch } from "@/lib/live-esports/hooks";
import { nextHubAutoGame } from "@/lib/pro-play/hubSelection";
import { PRO_PLAY_LIVE_GAME_PARAM, PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";

/**
 * Pro Play hub — the landing page behind the academy hub's Pro Play book.
 *
 * MATCH-CENTRED (PPH1, composed for density in PPH2.1). A slim header —
 * back, the area's name, search — and then one selected game drives the page:
 *
 * 1. **Match Center** — one board: the live game if one is on, otherwise the
 *    latest finished one; a rail to switch; the score; objectives and gold.
 * 2. **Match Workspace** — inside that board: the ten players as five
 *    mirrored lane rows. A row opens in place with the players' careers, the
 *    champion pair across pro play and the study destinations.
 * 3. **Discovery** — beside it, match-independent: featured graphs, a glimpse
 *    of the statistics table, the full tools.
 * 4. **Pro Stats** — the statistics table, unchanged. Its URL contract
 *    (`/lol/pro-play?view=…&player=…`, built by `statsExplorerUrl`) is how
 *    every profile's "View in Pro Stats" lands here, so it stays on this page.
 *
 * Nothing on the hub is a placeholder. No Upcoming section: there is no
 * authoritative schedule source yet. No match-specific quiz: the quiz API
 * cannot filter by match.
 *
 * Any gate lives at the DESTINATION, never here. NOT to be confused with
 * /lol/premium, the paid-subscription page.
 */

// Route identity lives in `@/lib/pro-play/routes` so the router can import it
// without pulling this page into the main bundle. Re-exported here because
// this module was their original home and several call sites import from it.
export {
  LEGACY_ESPORTS_LIVE_ROUTE,
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "@/lib/pro-play/routes";

/** The Stats Explorer's own query keys. A hub URL carrying any of them came
 *  from a "View in Pro Stats" link, and the reader wants the table. */
const STATS_EXPLORER_PARAMS = [
  "view",
  "year",
  "league",
  "patch",
  "role",
  "champion",
  "player",
  "team",
  "min_games",
  "sort",
  "dir",
  "page",
];

export const PRO_STATS_ANCHOR = "pro-stats";

export default function ProPlayHub() {
  const [params, setParams] = useSearchParams();

  /* Selection, the match centre's way: `?game=` is an EXPLICIT choice and is
   * never overridden; `autoId` is the hub following the action when nobody
   * has chosen. The hub's auto rule prefers live, then a FINISHED game. */
  const pinnedId = params.get(PRO_PLAY_LIVE_GAME_PARAM);
  const [autoId, setAutoId] = useState<string | null>(null);
  const feed = useLiveFeed();
  const { live, recent, selectable } = feed;

  useEffect(() => {
    if (pinnedId) return;
    const next = nextHubAutoGame(autoId, live, recent);
    if (next !== autoId) setAutoId(next);
  }, [live, recent, autoId, pinnedId]);

  const selectedId = pinnedId ?? autoId;
  const match = useLiveMatch(
    selectedId,
    selectable.find((g) => g.game_id === selectedId),
  );
  const { data: manifest } = useChampionAssets();

  // Picking a match writes the URL — the copyable address is what is shown —
  // and keeps every Stats Explorer parameter already there.
  const select = (gameId: string) => {
    const next = new URLSearchParams(params);
    next.set(PRO_PLAY_LIVE_GAME_PARAM, gameId);
    setParams(next, { replace: true });
  };
  const clearPin = () => {
    const next = new URLSearchParams(params);
    next.delete(PRO_PLAY_LIVE_GAME_PARAM);
    setParams(next, { replace: true });
  };

  // Arriving with Stats Explorer filters means arriving for the table, which
  // now sits below the match area: take the reader to it once, on entry.
  useEffect(() => {
    if (!STATS_EXPLORER_PARAMS.some((k) => params.has(k))) return;
    const el = document.getElementById(PRO_STATS_ANCHOR);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "start" });
    // Entry only: later filter changes happen while the reader is already there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = match.selected;

  return (
    <div className="relative min-h-screen bg-background">
      <SEOHead
        title="Pro Play | Mogzy"
        description="Professional League of Legends — the live or latest pro match, lane-by-lane player and champion context, search, data graphs and statistics drawn from real pro match history."
        path={PRO_PLAY_ROUTE}
      />
      <div className="relative mx-auto w-full max-w-[1400px] space-y-4 px-3 pb-8 sm:px-6 lg:px-0">
        {/* Minimal header: the way back, the area's name, and search — the
            match is the page's introduction. */}
        <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 py-2 sm:min-h-14">
          <Link
            to="/lol"
            aria-label="Back to the Academy"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground sm:min-h-0"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Academy
          </Link>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-wide text-[#e3c66f]">
            <Trophy className="h-4 w-4 text-[#c9a84c]" aria-hidden="true" />
            Pro Play
          </h1>
          <SearchEntry className="order-last w-full sm:order-none sm:w-auto sm:min-w-[18rem] sm:max-w-xl sm:flex-1" />
          <a
            href={`#${PRO_STATS_ANCHOR}`}
            className="ml-auto hidden text-sm font-medium text-muted-foreground hover:text-foreground hover:underline md:inline"
          >
            Player statistics
          </a>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_288px]">
          {/* One media request for the selected game's two teams, shared by
              the score header's crests and profile links. */}
          <ProPlayMediaProvider
            teams={[selected?.teams.blue?.resolved_page, selected?.teams.red?.resolved_page]}
          >
            <MatchCenter
              feed={feed}
              match={match}
              selectedId={selectedId}
              pinnedId={pinnedId}
              onSelect={select}
              onClearPin={clearPin}
              lanes={
                selected && (
                  <MatchWorkspace
                    game={selected}
                    players={match.players.data?.players}
                    loading={match.players.isLoading}
                    failed={match.players.isError}
                    manifest={manifest}
                  />
                )
              }
            />
          </ProPlayMediaProvider>

          <ProPlayDiscovery manifest={manifest} />
        </div>

        {/* The statistics table keeps its own wide layout and its URL
            contract; it is content on this page, not a tool tile. */}
        <section id={PRO_STATS_ANCHOR} aria-label="Pro Stats" className="scroll-mt-4 pt-4">
          <div className="mb-3">
            <HubKicker>Pro Stats</HubKicker>
          </div>
          <ProStatsExplorer />
        </section>
      </div>
    </div>
  );
}
