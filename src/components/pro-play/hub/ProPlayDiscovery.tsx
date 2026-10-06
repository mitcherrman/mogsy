/**
 * Explore — the part of the hub that does not depend on any match.
 *
 * PP-IA2: it sits BELOW the Match Center under its own heading ("Explore pro
 * history — not about the match above"), never beside it. Beside the board,
 * all-time prompts and a calendar-year leaderboard read as context for the
 * selected game. It holds a handful of curated featured graphs (questions,
 * never conclusions — see `graph1/featured.ts`), the way into the Pro Stats
 * table (its own route now) and the full tools. The "Most games" leaderboard
 * glimpse is gone from the hub: that table is Pro Stats itself. Search lives
 * in the hub header so it is usable before anything else loads.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Brain, Library, Radio, Search, Swords, Table2, Users } from "lucide-react";

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
  PRO_PLAY_STATS_ROUTE,
} from "@/lib/pro-play/routes";
import { cn } from "@/lib/utils";
import { ChampionIcon } from "@/pages/esports/live/components";

/** The research search refuses fewer than two characters (backend 400). */
export const MIN_SEARCH_CHARS = 2;

/** Four of the curated cards — enough to show the range; the graphs page
 *  carries the full set. */
export const HUB_FEATURED_COUNT = 4;

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

/* ── the section ────────────────────────────────────────────────────────── */

export default function ProPlayDiscovery({ manifest }: { manifest?: ChampionManifest | null }) {
  const cards = FEATURED_GRAPHS.slice(0, HUB_FEATURED_COUNT);
  return (
    <section
      id="discover"
      aria-labelledby="discover-title"
      className="space-y-4 border-t border-border/60 pt-5"
      data-testid="explore-band"
    >
      <div>
        <h2 id="discover-title" className="text-sm font-bold uppercase tracking-[0.12em] text-[#c9a84c]">
          Explore pro history
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground" data-testid="explore-scope">
          Not about the match above — all-time and season questions, tables and tools across pro play.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ask pro play</h3>
            <Link to={PRO_PLAY_GRAPHS_ROUTE} className="inline-flex min-h-11 items-center gap-1 text-xs sm:min-h-0 font-medium text-muted-foreground hover:text-foreground hover:underline">
              All graphs
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
          <ul className="grid sm:grid-cols-2 sm:gap-x-5">
            {cards.map((card) => (
              <li key={card.id} className="border-b border-border/40">
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

        <div className="space-y-4">
          <Link
            to={PRO_PLAY_STATS_ROUTE}
            data-testid="pro-stats-entry"
            className="flex min-h-12 items-center gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm font-semibold text-foreground/90 hover:border-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Table2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              Pro Stats
              <span className="block text-xs font-normal text-muted-foreground">
                Players, teams and champions by season, league, patch and role
              </span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>

          {/* Full tools: a quiet wrapping line on desktop, a tap grid on
              phones. One nav either way, so nothing is listed twice. */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Full tools</p>
            <ProPlayToolsNav
              className="grid grid-cols-3 gap-1.5 sm:gap-2 lg:flex lg:flex-wrap lg:gap-x-4 lg:gap-y-1"
              linkClassName="flex min-h-11 items-center justify-center rounded-lg border border-border/70 px-1.5 text-center text-xs font-medium sm:text-sm text-foreground/90 hover:border-border hover:text-foreground lg:min-h-0 lg:justify-start lg:rounded-none lg:border-0 lg:px-0 lg:hover:underline"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
