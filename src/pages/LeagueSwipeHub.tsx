import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Brain, Flame, Heart, Coins } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { useChampionAssets, getChampionLoading } from "@/hooks/useChampionAssets";
import { LEAGUE_SWIPE_GAMES, type SwipeGameConfig } from "@/lib/league-swipe/api";

const GAME_ICONS: Record<string, React.ElementType> = {
  "favorite-champion": Heart,
  "most-annoying-champion": Flame,
  "higher-base-stat": Brain,
  "item-cost-duel": Coins,
};

/** Hub listing the League Swipe games — opinion votes and knowledge duels. */
export default function LeagueSwipeHub() {
  const { data: championAssets } = useChampionAssets();

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <SEOHead
        title="League Swipe | Quick LoL Opinion & Knowledge Duels | Mogsy"
        description="Fast head-to-head League of Legends games: vote your favorite champions, call out the most annoying ones, and duel over stats and item costs."
        path="/league-swipe"
      />

      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-[0.25em] text-[#c9a84c] font-bold">Mogsy League</div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">League Swipe</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xl">
          Two options. One tap. Vote your opinions or test your knowledge, then see how the
          community split on every matchup.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {LEAGUE_SWIPE_GAMES.map((game) => (
          <GameCard
            key={game.slug}
            game={game}
            art={getChampionLoading(championAssets, game.artChampion)}
          />
        ))}
      </div>

      {/* Stats portal */}
      <Link
        to="/league-swipe/stats"
        className="group mt-4 flex items-center gap-4 rounded-2xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 backdrop-blur-sm p-5 hover:border-[#c9a84c]/50 transition-all hover:scale-[1.01]"
      >
        <div className="rounded-lg bg-black/40 border border-white/10 p-3">
          <BarChart3 className="h-5 w-5 text-[#c9a84c]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            Community Stats
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-[#c9a84c] transition-all" />
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Top-rated champions, closest calls, biggest blowouts, and community accuracy.
          </p>
        </div>
      </Link>
    </div>
  );
}

function GameCard({ game, art }: { game: SwipeGameConfig; art: string | null }) {
  const Icon = GAME_ICONS[game.slug] ?? Flame;
  return (
    <Link
      to={`/league-swipe/${game.slug}`}
      className="group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm hover:border-[#c9a84c]/50 transition-all hover:scale-[1.01]"
    >
      {art && (
        <div className="absolute inset-y-0 right-0 w-2/5 opacity-40 group-hover:opacity-55 transition-opacity">
          <img src={art} alt="" aria-hidden className="h-full w-full object-cover object-top" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0a1428] to-transparent" />
        </div>
      )}
      <div className="relative p-5 pr-24">
        <div className="flex items-center gap-2 mb-2">
          <div className="rounded-lg bg-black/40 border border-white/10 p-2">
            <Icon className="h-5 w-5 text-[#c9a84c]" />
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              game.mode === "opinion"
                ? "bg-[#3a7bd5]/20 text-[#7db3f5]"
                : "bg-emerald-500/15 text-emerald-400"
            }`}
          >
            {game.mode === "opinion" ? "Opinion" : "Knowledge"}
          </span>
        </div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          {game.title}
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-[#c9a84c] transition-all" />
        </h2>
        <p className="text-xs text-muted-foreground mt-1">{game.description}</p>
      </div>
    </Link>
  );
}
