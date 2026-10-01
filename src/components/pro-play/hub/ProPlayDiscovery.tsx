/**
 * Discovery — the part of the hub that does not depend on any match.
 *
 * Three ways in, each an existing destination: search (the public research
 * search, with its disambiguation), the curated featured graphs (questions,
 * never conclusions — see `graph1/featured.ts`), and the full tools. The Pro
 * Stats table follows this section on the hub itself and is not repeated
 * here.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, Brain, Library, Radio, Search, Swords } from "lucide-react";

import FeaturedGraphs from "@/components/graph1/FeaturedGraphs";
import HexPanelLink from "@/components/lol/HexPanelLink";
import { Button } from "@/components/ui/button";
import { FEATURED_GRAPHS } from "@/graph1/featured";
import { selectionHref } from "@/graph1/featuredHref";
import { useSfx } from "@/lib/audio/useSfx";
import {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ARCHIVE_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_MATCHUP_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_SEARCH_ROUTE,
} from "@/lib/pro-play/routes";

import HubSection, { HubKicker } from "./HubSection";

/** The research search refuses fewer than two characters (backend 400). */
export const MIN_SEARCH_CHARS = 2;

/** Six of the twelve curated cards — enough to show the range; the graphs
 *  page carries the full set. */
const HUB_FEATURED_COUNT = 6;

type ProPlayTool = {
  to: string;
  title: string;
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
    // "Live &" is earned: the ingestion poller runs continuously. It is NOT a
    // promise that something is always on, which is why recency is named too.
    description:
      "Scoreboards, players, objectives and gold from pro games in progress — and the ones that just finished.",
    Icon: Radio,
  },
  {
    to: PRO_PLAY_MATCHUP_ROUTE,
    title: "Matchup Explorer",
    description:
      "Deep-dive into team matchups — lanes, players, champion pools, historical performance and mechanics.",
    Icon: Swords,
    analysis: true,
  },
  {
    to: PRO_PLAY_GRAPHS_ROUTE,
    title: "Explore Pro Data",
    description:
      "Build graphs from real pro match history — players, teams, champions, picks and bans.",
    Icon: BarChart3,
    analysis: true,
  },
  {
    to: PRO_PLAY_LIVE_ARCHIVE_ROUTE,
    title: "Match Archive",
    description: "Every stored pro game, by league, team, tournament and date.",
    Icon: Library,
  },
  {
    to: PRO_PLAY_QUIZ_ROUTE,
    title: "Pro Play Quiz",
    description: "Ten questions on champions, players and teams from pro play.",
    Icon: Brain,
  },
];

function SearchEntry() {
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
    <form
      role="search"
      aria-label="Search Pro Play"
      onSubmit={submit}
      className="rounded-2xl border border-[#c9a84c]/30 bg-gradient-to-br from-[#c9a84c]/[0.08] to-transparent p-4 sm:p-5"
    >
      <label htmlFor="pro-play-hub-search" className="block">
        <HubKicker>Search</HubKicker>
        <span className="mt-1 block text-lg font-semibold">
          Find any pro player, team or champion
        </span>
      </label>
      <div className="mt-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="pro-play-hub-search"
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setTooShort(false);
            }}
            placeholder="Faker, Gen.G, Azir…"
            autoComplete="off"
            maxLength={120}
            aria-describedby={tooShort ? "pro-play-hub-search-hint" : undefined}
            className="h-11 w-full rounded-lg border border-border bg-background/70 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-[#c9a84c]/70 focus:ring-2 focus:ring-[#c9a84c]/30"
          />
        </div>
        <Button type="submit" className="h-11 bg-[#c9a84c] px-4 text-black hover:bg-[#d8ba62]">
          Search
        </Button>
      </div>
      {tooShort && (
        <p id="pro-play-hub-search-hint" role="status" className="mt-2 text-xs text-muted-foreground">
          Type at least {MIN_SEARCH_CHARS} characters.
        </p>
      )}
    </form>
  );
}

export default function ProPlayDiscovery() {
  const { play } = useSfx();
  return (
    <HubSection
      id="discover"
      kicker="Discover"
      title="Explore pro play"
      description="Not about one match — search the whole pro scene, start from a question, or open a full tool."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-4">
          <SearchEntry />
          <div>
            <FeaturedGraphs
              hrefFor={selectionHref}
              cards={FEATURED_GRAPHS.slice(0, HUB_FEATURED_COUNT)}
            />
            <Link
              to={PRO_PLAY_GRAPHS_ROUTE}
              className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#c9a84c] hover:underline"
            >
              All graphs and the builder
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <nav aria-label="Pro Play tools" className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Full tools
          </p>
          {PRO_PLAY_TOOLS.map((t) => (
            <HexPanelLink
              key={t.to}
              to={t.to}
              title={t.title}
              description={t.description}
              Icon={t.Icon}
              accent="gold"
              compact
              onClick={t.analysis ? () => play("pro-play.analysis.open") : undefined}
            />
          ))}
        </nav>
      </div>
    </HubSection>
  );
}
