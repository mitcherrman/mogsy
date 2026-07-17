import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Brain, Check, Crown, Scale, Timer, Trophy, X, Zap } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import {
  fetchMyRecentResults,
  fetchSwipeStats,
  fetchTopRatings,
  getSwipeGame,
  LEAGUE_SWIPE_GAMES,
  type SwipeMatchupStat,
} from "@/lib/league-swipe/api";

const OPINION_GAMES = LEAGUE_SWIPE_GAMES.filter((g) => g.mode === "opinion");

/**
 * Read-only League Swipe analytics: global totals, per-game activity,
 * opinion-game rating boards, knowledge accuracy, and matchup highlights.
 */
export default function LeagueSwipeStats() {
  const { data: stats, isLoading, isError } = useQuery({
    queryKey: ["league-swipe", "stats"],
    queryFn: fetchSwipeStats,
    staleTime: 60_000,
  });
  const { data: myResults = [] } = useQuery({
    queryKey: ["league-swipe", "my-results"],
    queryFn: () => fetchMyRecentResults(10),
    staleTime: 60_000,
  });
  const ratingBoards = useQuery({
    queryKey: ["league-swipe", "top-ratings"],
    queryFn: async () =>
      Promise.all(OPINION_GAMES.map(async (g) => ({ game: g, rows: await fetchTopRatings(g.slug, 10) }))),
    staleTime: 60_000,
  });

  const t = stats?.totals;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <SEOHead
        title="League Swipe Stats | Community Rankings & Accuracy | Mogzy"
        description="Community stats for League Swipe: top-rated champions, knowledge accuracy, most contested matchups, and biggest blowouts."
        path="/league-swipe/stats"
      />

      <div className="flex items-center justify-between mb-4">
        <Link
          to="/league-swipe"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          <ArrowLeft className="h-4 w-4" /> League Swipe
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#c9a84c]">
            <BarChart3 className="h-4 w-4" />
            <span className="text-[10px] uppercase tracking-[0.25em] font-bold">League Swipe</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Community Stats</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every swipe counts — here's what the community has decided so far.
          </p>
        </div>
        <Link
          to="/league-swipe"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-4 py-2.5 text-sm font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f] transition-colors"
        >
          <Zap className="h-4 w-4" /> Play League Swipe
        </Link>
      </div>

      {/* Quick links to jump straight into a game */}
      <div className="mb-8 flex flex-wrap gap-2">
        {LEAGUE_SWIPE_GAMES.map((g) => (
          <Link
            key={g.slug}
            to={`/league-swipe/${g.slug}`}
            className="inline-flex items-center gap-1 rounded-full border border-[#c9a84c]/30 bg-[#c9a84c]/8 px-3 py-1.5 text-xs font-semibold text-[#f5e9c8]/90 hover:bg-[#c9a84c]/20 hover:border-[#c9a84c]/50 transition-colors"
          >
            {g.title}
          </Link>
        ))}
      </div>

      {isLoading && <div className="py-8 text-center text-sm text-muted-foreground">Loading stats…</div>}
      {!isLoading && (isError || !stats) && (
        <div className="mb-6 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Global totals aren't available yet. Play a few matchups and check back!
        </div>
      )}
      {stats && (
        <>
          {/* Global totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
            <StatTile label="Total swipes" value={fmt(t?.swipes)} Icon={Zap} />
            <StatTile label="Opinion votes" value={fmt(t?.opinionVotes)} Icon={Trophy} />
            <StatTile label="Knowledge answers" value={fmt(t?.knowledgeAnswers)} Icon={Brain} />
            <StatTile label="Accuracy" value={t?.accuracy != null ? `${t.accuracy}%` : "—"} Icon={Check} />
            <StatTile
              label="Avg response"
              value={t?.avgResponseMs != null ? `${(t.avgResponseMs / 1000).toFixed(1)}s` : "—"}
              Icon={Timer}
            />
            <StatTile label="Unique matchups" value={fmt(t?.uniqueMatchups)} Icon={Scale} />
          </div>

          {/* Per-game activity */}
          <Section title="Per-game activity" Icon={BarChart3}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stats.perGame.map((g) => (
                <Link
                  key={g.slug}
                  to={`/league-swipe/${g.slug}`}
                  className="flex items-center justify-between rounded-xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 px-4 py-3 hover:border-[#c9a84c]/50 transition-colors"
                >
                  <div>
                    <div className="text-sm font-bold text-foreground">{g.title}</div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {g.mode}
                      {g.mode === "knowledge" && g.accuracy != null && <> · {g.accuracy}% community accuracy</>}
                    </div>
                  </div>
                  <div className="text-lg font-bold text-[#f0d78c] tabular-nums">{fmt(g.swipes)}</div>
                </Link>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* Opinion rating boards — reads public ratings table directly */}
      <Section title="Community rankings" Icon={Crown}>
        {isEarlyData(ratingBoards.data) && (
          <p className="-mt-1 mb-3 text-xs italic text-muted-foreground">
            Early community rankings — more votes will make this smarter.
          </p>
        )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(ratingBoards.data ?? []).map(({ game, rows }) => (
                <div
                  key={game.slug}
                  className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 p-4"
                >
                  <h3 className="text-sm font-bold text-foreground mb-3">{game.title}</h3>
                  {rows.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">No votes yet.</div>
                  ) : (
                    <ol className="space-y-1.5">
                      {rows.map((r, i) => {
                        const winRate = r.vote_count > 0 ? Math.round((r.win_count / r.vote_count) * 100) : 0;
                        return (
                          <li key={r.entity_id} className="flex items-center gap-2 text-sm">
                            <span className="w-5 text-right font-bold text-muted-foreground tabular-nums">
                              {i + 1}
                            </span>
                            <span className="flex-1 font-semibold text-foreground truncate">{r.entity_id}</span>
                            <span className="text-[11px] text-muted-foreground tabular-nums">
                              {winRate}% · {r.vote_count} vote{r.vote_count === 1 ? "" : "s"}
                            </span>
                            <span className="w-12 text-right font-bold text-[#f0d78c] tabular-nums">{r.rating}</span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              ))}
            </div>
      </Section>

      {/* Matchup highlights */}
      {stats && (
        <Section title="Matchup highlights" Icon={Scale}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MatchupList title="Most voted" rows={stats.mostVoted} />
            <MatchupList title="Closest calls" rows={stats.closest} />
            <MatchupList title="Biggest blowouts" rows={stats.blowouts} />
          </div>
        </Section>
      )}

      {/* Knowledge corner — "your answers" reads own rows and always renders */}
      <Section title="Knowledge duels" Icon={Brain}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 p-4">
              <h3 className="text-sm font-bold text-foreground mb-3">Most missed matchups</h3>
              {stats.mostMissed.length === 0 ? (
                <div className="text-xs text-muted-foreground py-4 text-center">Nothing missed yet.</div>
              ) : (
                <ul className="space-y-2">
                  {stats.mostMissed.map((m, i) => (
                      <li key={i} className="text-sm">
                        <div className="font-semibold text-foreground">
                          {m.entityA} vs {m.entityB}
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {m.missCount} miss{m.missCount === 1 ? "" : "es"}
                          </span>
                        </div>
                        {m.correct && (
                          <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <Check className="h-3.5 w-3.5" /> Answer: {m.correct}
                          </div>
                        )}
                      </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Your recent answers</h3>
                {myResults.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    Play a knowledge duel to see your history here.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {myResults.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {r.is_correct ? (
                          <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                        ) : (
                          <X className="h-4 w-4 shrink-0 text-[#ff4655]" />
                        )}
                        <span className="flex-1 truncate text-foreground">
                          {r.selected_entity} <span className="text-muted-foreground">vs {r.other_entity}</span>
                        </span>
                        {r.response_time_ms != null && (
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {(r.response_time_ms / 1000).toFixed(1)}s
                          </span>
                        )}
                      </li>
                    ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function fmt(n?: number | null): string {
  return n != null ? n.toLocaleString() : "—";
}

/** Rankings are "early" until the boards have a reasonable vote base. */
function isEarlyData(boards?: Array<{ rows: Array<{ vote_count: number }> }>): boolean {
  if (!boards) return false;
  const totalVotes = boards.reduce(
    (sum, b) => sum + b.rows.reduce((s, r) => s + r.vote_count, 0),
    0,
  );
  return totalVotes > 0 && totalVotes < 50;
}

function StatTile({ label, value, Icon }: { label: string; value: string; Icon: React.ElementType }) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-[#1e3a5f]/60 to-[#0a1428]/90 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-[#c9a84c]" /> {label}
      </div>
      <div className="mt-1 text-xl font-bold text-foreground tabular-nums">{value}</div>
    </div>
  );
}

function Section({ title, Icon, children }: { title: string; Icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-[#c9a84c]" />
        <h2 className="text-base md:text-lg font-bold text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MatchupList({ title, rows }: { title: string; rows: SwipeMatchupStat[] }) {
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 p-4">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#c9a84c]/25 bg-[#c9a84c]/5 px-3 py-6 text-center">
          <Scale className="h-5 w-5 text-[#c9a84c]/60" />
          <p className="text-xs text-muted-foreground">
            Unlocks once a matchup collects 5 votes.
          </p>
          <Link
            to="/league-swipe"
            className="text-xs font-semibold text-[#f0d78c] hover:underline"
          >
            Play more games to generate this data →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((m, i) => {
            const pctA = m.total > 0 ? Math.round((m.votesA / m.total) * 100) : 0;
            return (
              <li key={i}>
                <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
                  <span className="truncate">{m.entityA} · {pctA}%</span>
                  <span className="truncate">{m.entityB} · {100 - pctA}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 flex">
                  <div className="h-full bg-gradient-to-r from-[#c9a84c] to-[#f0d78c]" style={{ width: `${pctA}%` }} />
                  <div className="h-full bg-[#3a7bd5]" style={{ width: `${100 - pctA}%` }} />
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="rounded-full bg-[#c9a84c]/15 px-1.5 py-0.5 font-semibold text-[#f0d78c]">
                    {getSwipeGame(m.game)?.title ?? m.gameTitle ?? m.game}
                  </span>
                  <span>{m.total} vote{m.total === 1 ? "" : "s"}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
