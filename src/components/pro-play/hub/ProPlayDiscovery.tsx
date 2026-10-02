/**
 * Discovery — the part of the hub that does not depend on any match.
 *
 * Kept deliberately small beside the match (PPH2.1): a handful of curated
 * featured graphs (questions, never conclusions — see `graph1/featured.ts`),
 * a three-row glimpse of the Stats Explorer's own default table leading down
 * to it, and the full tools. Search lives in the hub header so it is usable
 * before anything else loads.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowRight, BarChart3, Brain, Library, Radio, Search, Swords, Users } from "lucide-react";

import { FEATURED_GRAPHS, type Graph1FeaturedCard } from "@/graph1/featured";
import { selectionHref } from "@/graph1/featuredHref";
import type { ChampionManifest } from "@/hooks/useChampionAssets";
import { useSfx } from "@/lib/audio/useSfx";
import {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "@/lib/pro-play/routes";
import { getProStats, type ProStatsPlayerRow } from "@/lib/pro-play/statsApi";
import { cn } from "@/lib/utils";
import { ChampionIcon } from "@/pages/esports/live/components";

/** The research search refuses fewer than two characters (backend 400). */
export const MIN_SEARCH_CHARS = 2;

/** Four of the curated cards — enough to show the range; the graphs page
 *  carries the full set. */
export const HUB_FEATURED_COUNT = 4;

/** Rows of the Stats Explorer's default table previewed beside the match. */
export const HUB_STATS_PREVIEW_ROWS = 3;

type ProPlayTool = {
  to: string;
  title: string;
  /** The compact label the hub's tool links use. */
  short: string;
  description: string;
  Icon: React.ElementType;
  analysis?: boolean;
};

/** The full tools. The order is the product hierarchy the hub has always had:
 *  what is happening, the deep pre-match surface, the data, then the game. */
export const PRO_PLAY_TOOLS: ProPlayTool[] = [
  {
    to: PRO_PLAY_LIVE_ROUTE,
    title: "Live & Recent Matches",
    short: "Live & Recent",
    // "Live &" is earned: the ingestion poller runs continuously. It is NOT a
    // promise that something is always on, which is why recency is named too.
    description:
      "Scoreboards, players, objectives and gold from pro games in progress — and the ones that just finished.",
    Icon: Radio,
  },
  {
    to: PRO_PLAY_MATCHUP_ROUTE,
    title: "Matchup Explorer",
    short: "Matchup Explorer",
    description:
      "Deep-dive into team matchups — lanes, players, champion pools, historical performance and mechanics.",
    Icon: Swords,
    analysis: true,
  },
  {
    to: PRO_PLAY_GRAPHS_ROUTE,
    title: "Explore Pro Data",
    short: "Pro Data",
    description:
      "Build graphs from real pro match history — players, teams, champions, picks and bans.",
    Icon: BarChart3,
    analysis: true,
  },
  {
    to: PRO_PLAY_LIVE_ARCHIVE_ROUTE,
    title: "Match Archive",
    short: "Archive",
    description: "Every stored pro game, by league, team, tournament and date.",
    Icon: Library,
  },
  {
    to: PRO_PLAY_QUIZ_ROUTE,
    title: "Pro Play Quiz",
    short: "Quiz",
    description: "Ten questions on champions, players and teams from pro play.",
    Icon: Brain,
  },
];

/* ── search (rendered in the hub header) ────────────────────────────────── */

export function SearchEntry({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [tooShort, setTooShort] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (query.length < MIN_SEARCH_CHARS) {
      setTooShort(true);
      return;
    }
    navigate(`${PRO_PLAY_SEARCH_ROUTE}?q=${encodeURIComponent(query)}`);
  };

  return (
    <form role="search" aria-label="Search Pro Play" onSubmit={submit} className={cn("relative", className)}>
      <label htmlFor="pro-play-hub-search" className="sr-only">
        Search any pro player, team or champion
      </label>
      <div className="flex h-11 items-center rounded-lg border border-border/80 bg-background/60 focus-within:border-[#c9a84c]/60 focus-within:ring-2 focus-within:ring-[#c9a84c]/25 sm:h-10">
        <input
          id="pro-play-hub-search"
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setTooShort(false);
          }}
          placeholder="Search a pro player, team or champion"
          autoComplete="off"
          maxLength={120}
          aria-describedby={tooShort ? "pro-play-hub-search-hint" : undefined}
          className="h-full min-w-0 flex-1 bg-transparent pl-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Search"
          className="flex h-full w-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {tooShort && (
        <p
          id="pro-play-hub-search-hint"
          role="status"
          className="absolute left-0 top-full z-10 mt-1 rounded bg-popover px-2 py-1 text-xs text-muted-foreground shadow"
        >
          Type at least {MIN_SEARCH_CHARS} characters.
        </p>
      )}
    </form>
  );
}

/* ── tools ──────────────────────────────────────────────────────────────── */

export function ProPlayToolsNav({ className, linkClassName }: { className?: string; linkClassName?: string }) {
  const { play } = useSfx();
  return (
    <nav aria-label="Pro Play tools" className={className}>
      {PRO_PLAY_TOOLS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          title={t.description}
          onClick={t.analysis ? () => play("pro-play.analysis.open") : undefined}
          className={linkClassName}
        >
          {t.short}
        </Link>
      ))}
    </nav>
  );
}

/* ── featured questions ─────────────────────────────────────────────────── */

function CardMark({ card, manifest }: { card: Graph1FeaturedCard; manifest: ChampionManifest | null | undefined }) {
  if (card.focus === "champion") {
    return (
      <ChampionIcon
        championId={card.entityId}
        championName={card.entityLabel}
        manifest={manifest}
        className="h-8 w-8 rounded-md"
      />
    );
  }
  const Icon = card.focus === "team" ? Users : BarChart3;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
      <Icon className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}

/* ── the Stats Explorer glimpse ─────────────────────────────────────────── */

/**
 * The Stats Explorer's DEFAULT request, exactly as it builds it with no URL
 * filters — so the explorer below reads this from the same cache entry rather
 * than fetching twice. If the explorer's defaults change, this only becomes a
 * second request; it never shows different numbers than the table's page 1.
 */
const DEFAULT_PLAYERS_QUERY = {
  year: null,
  league: null,
  patch: null,
  role: null,
  champion: null,
  minGames: null,
  player: null,
  team: null,
  sort: "games",
  dir: "desc" as const,
  page: 1,
  pageSize: 25,
};

/** "Bin (Chen Ze-Bin)" → "Bin": the disambiguator belongs in the table. */
const shortName = (player: string) => player.replace(/\s*\(.*\)\s*$/, "");

function StatsGlimpse() {
  const { data, isError } = useQuery({
    queryKey: ["pro-play-stats", "players", DEFAULT_PLAYERS_QUERY],
    queryFn: ({ signal }) => getProStats("players", DEFAULT_PLAYERS_QUERY, signal),
    staleTime: 5 * 60 * 1000,
  });
  const rows = ((data?.rows ?? []) as ProStatsPlayerRow[]).slice(0, HUB_STATS_PREVIEW_ROWS);
  if (isError || (data && !rows.length)) return null;
  return (
    <div className="hidden xl:block" data-testid="stats-glimpse">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Most games · Player statistics
      </p>
      <div className="relative">
        <table className="w-full table-fixed text-sm">
          <thead className="sr-only">
            <tr>
              <th>Player</th>
              <th className="w-10">Games</th>
              <th className="w-14">Win rate</th>
              <th className="w-12">KDA</th>
            </tr>
          </thead>
          <tbody>
            {(rows.length ? rows : Array.from({ length: HUB_STATS_PREVIEW_ROWS }, () => null)).map((r, i) => (
              <tr key={r?.player ?? i} className="border-b border-border/40 last:border-0">
                <td className="truncate py-1.5 pr-2 font-semibold" title={r?.player}>
                  {r ? shortName(r.player) : " "}
                </td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r?.games ?? ""}</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                  {r?.win_rate != null ? `${(r.win_rate * 100).toFixed(1)}%` : ""}
                </td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">
                  {r?.kda != null ? r.kda.toFixed(2) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* The table visibly continues — it is the top of the one below. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-background" />
      </div>
      <a
        href="#pro-stats"
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
      >
        Full player statistics below
        <ArrowDown className="h-3 w-3" aria-hidden="true" />
      </a>
    </div>
  );
}

/* ── the section ────────────────────────────────────────────────────────── */

export default function ProPlayDiscovery({ manifest }: { manifest?: ChampionManifest | null }) {
  const cards = FEATURED_GRAPHS.slice(0, HUB_FEATURED_COUNT);
  return (
    <section id="discover" aria-labelledby="discover-title" className="space-y-5">
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 id="discover-title" className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#c9a84c]">
            Ask pro play
          </h2>
          <Link to={PRO_PLAY_GRAPHS_ROUTE} className="inline-flex min-h-11 items-center gap-1 text-xs sm:min-h-0 font-medium text-muted-foreground hover:text-foreground hover:underline">
            All graphs
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
        <ul>
          {cards.map((card) => (
            <li key={card.id} className="border-b border-border/40 last:border-0">
              <Link
                to={selectionHref(card)}
                data-testid={`featured-${card.id}`}
                title={card.hook}
                className="flex min-h-12 items-center gap-3 py-1.5 text-sm font-semibold text-foreground/90 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CardMark card={card} manifest={manifest} />
                <span className="min-w-0 flex-1">{card.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <StatsGlimpse />

      {/* Full tools: one quiet line beside the match on desktop, a tap grid
          on phones. One nav either way, so nothing is listed twice. */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Full tools</p>
        <ProPlayToolsNav
          className="grid grid-cols-3 gap-1.5 sm:gap-2 xl:flex xl:flex-wrap xl:gap-x-4 xl:gap-y-1"
          linkClassName="flex min-h-11 items-center justify-center rounded-lg border border-border/70 px-1.5 text-center text-xs font-medium sm:text-sm text-foreground/90 hover:border-border hover:text-foreground xl:min-h-0 xl:justify-start xl:rounded-none xl:border-0 xl:px-0 xl:hover:underline"
        />
      </div>
    </section>
  );
}
