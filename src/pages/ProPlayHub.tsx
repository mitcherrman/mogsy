import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Trophy } from "lucide-react";

import SEOHead from "@/components/SEOHead";
import ProStatsExplorer from "@/components/pro-play/ProStatsExplorer";
import { HubKicker } from "@/components/pro-play/hub/HubSection";
import MatchCenter from "@/components/pro-play/hub/MatchCenter";
import MatchWorkspace from "@/components/pro-play/hub/MatchWorkspace";
import ProPlayDiscovery from "@/components/pro-play/hub/ProPlayDiscovery";
import { ProPlayMediaProvider } from "@/components/pro-play/media/ProPlayMediaProvider";
import { useChampionAssets } from "@/hooks/useChampionAssets";
import { useLiveFeed, useLiveMatch } from "@/lib/live-esports/hooks";
import { nextHubAutoGame } from "@/lib/pro-play/hubSelection";
import { PRO_PLAY_LIVE_GAME_PARAM, PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";

/**
 * Pro Play hub — the landing page behind the academy hub's Pro Play book.
 *
 * MATCH-CENTRED (PPH1). One selected game drives the top of the page:
 *
 * 1. **Match Center** — the live game if one is on, otherwise the latest
 *    finished one, with a rail to switch and a link to the full match centre.
 * 2. **Match Workspace** — that game's ten players, lane by lane, joined to
 *    the public profiles, statistics, the champion-pair graph and the study
 *    destinations.
 * 3. **Discovery** — match-independent: search, featured graphs, full tools.
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
      {/* A faint gold wash behind the top of the page: the area's colour, on
          the page rather than on every card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(201,168,76,0.12),transparent_65%)]"
      />
      <div className="relative mx-auto w-full max-w-6xl space-y-10 px-4 py-6 sm:py-8">
        <div>
          <Link
            to="/lol"
            className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the Academy
          </Link>

          <header className="flex items-center gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#c9a84c]/40 bg-[#c9a84c]/10 shadow-[0_0_30px_-8px_rgba(201,168,76,0.5)]"
              aria-hidden="true"
            >
              <Trophy className="h-6 w-6 text-[#c9a84c]" />
            </span>
            <div className="min-w-0">
              <HubKicker>Mogzy Academy</HubKicker>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Pro Play</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Professional League of Legends — drawn from real pro match history.
              </p>
            </div>
          </header>
        </div>

        {/* One media request for the selected game's two teams, shared by the
            scoreboard and the workspace's team links. */}
        <ProPlayMediaProvider
          teams={[selected?.teams.blue?.resolved_page, selected?.teams.red?.resolved_page]}
        >
          <div className="space-y-10">
            <MatchCenter
              feed={feed}
              match={match}
              selectedId={selectedId}
              pinnedId={pinnedId}
              onSelect={select}
              onClearPin={clearPin}
            />
            {selected && (
              <MatchWorkspace
                game={selected}
                players={match.players.data?.players}
                loading={match.players.isLoading}
                failed={match.players.isError}
                manifest={manifest}
              />
            )}
          </div>
        </ProPlayMediaProvider>

        <ProPlayDiscovery />

        {/* The statistics table keeps its own wide layout and its URL
            contract; it is content on this page, not a tool tile. */}
        <section id={PRO_STATS_ANCHOR} aria-label="Pro Stats" className="scroll-mt-20 pb-6">
          <div className="mb-3">
            <HubKicker>Pro Stats</HubKicker>
          </div>
          <ProStatsExplorer />
        </section>
      </div>
    </div>
  );
}
