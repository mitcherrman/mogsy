import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, Coins, Flame, X } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useChampionAssets, getChampionLoading } from "@/hooks/useChampionAssets";
import {
  fetchChampionNames,
  fetchChampionStats,
  fetchItems,
  getSwipeGame,
  makeItemCostMatchup,
  makeOpinionMatchup,
  makeStatMatchup,
  recordSwipeResult,
  verifyFactualChoice,
  type SwipeMatchup,
  type SwipeRevealAggregates,
} from "@/lib/league-swipe/api";
import { META_REFLEX_NAME } from "@/lib/league-swipe/branding";
import { narrowPoolToForcedPair, parseForcedPair } from "@/lib/league-swipe/devForcedPair";
import { resolveFactualCategory } from "@/lib/league-swipe/factualCategories";

/**
 * One revealed round.
 *
 * `aggregates` is null when the vote write did not land (offline, RPC error, or
 * a game the server does not recognise). That case is deliberately NOT filled
 * in with a synthesised one-vote split: a fabricated community bar is
 * indistinguishable from a real one, which both misleads the player and makes
 * the `league_swipe_games.is_active` kill switch fail OPEN — the game keeps
 * looking healthy while every write is rejected. Correctness still reveals,
 * because it is derived locally from the matchup and does not depend on the
 * write succeeding.
 */
type RevealState = {
  aggregates: SwipeRevealAggregates | null;
  isCorrect: boolean | null;
};

/**
 * Meta Reflex game loop: show two cards → tap one → reveal community split
 * (and correctness for knowledge games) → next. Mobile-first, no clutter.
 */
export default function LeagueSwipeGame() {
  const { gameSlug } = useParams<{ gameSlug: string }>();
  const [searchParams] = useSearchParams();
  const search = searchParams.toString();
  const game = getSwipeGame(gameSlug);
  const { user } = useAuth();
  const { data: championAssets } = useChampionAssets();

  // Anonymous session so votes attribute to a stable user id (same as LolHub).
  useEffect(() => {
    if (!user) supabase.auth.signInAnonymously();
  }, [user]);

  const { data: championNames = [] } = useQuery({
    queryKey: ["league-swipe", "champion-names"],
    queryFn: fetchChampionNames,
    staleTime: 60 * 60 * 1000,
    enabled: game?.mode === "opinion",
  });
  const { data: championStats = [] } = useQuery({
    queryKey: ["league-swipe", "champion-stats"],
    queryFn: fetchChampionStats,
    staleTime: 60 * 60 * 1000,
    enabled: game?.slug === "higher-base-stat",
  });
  const { data: items = [] } = useQuery({
    queryKey: ["league-swipe", "items"],
    queryFn: fetchItems,
    staleTime: 60 * 60 * 1000,
    enabled: game?.entityType === "item",
  });

  const [matchup, setMatchup] = useState<SwipeMatchup | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [pending, setPending] = useState(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rounds, setRounds] = useState(0);
  const shownAt = useRef(Date.now());
  // Session-scoped anti-repeat: exact matchups already shown, plus a short
  // cooldown window so the same entity doesn't headline back-to-back rounds.
  const seenPairs = useRef<Set<string>>(new Set());
  const recentEntities = useRef<string[]>([]);
  const RECENT_ENTITY_WINDOW = 6;

  const nextMatchup = useCallback(() => {
    if (!game) return;

    // Dev-only deterministic override (see lib/league-swipe/devForcedPair).
    // Compiled out of production builds entirely. When active it only narrows
    // the POOL — the matchup is still built by the same builders below, and the
    // vote still goes through the ordinary session and RPC.
    const forced = parseForcedPair(search);

    const generate = (): SwipeMatchup | null => {
      if (game.mode === "opinion" && championNames.length >= 2) {
        const pool = narrowPoolToForcedPair(championNames, forced, (n) => n) ?? championNames;
        return makeOpinionMatchup(game, pool);
      }
      if (game.slug === "higher-base-stat" && championStats.length >= 2) {
        const pool =
          narrowPoolToForcedPair(championStats, forced, (s) => s.champion_name) ?? championStats;
        return makeStatMatchup(game, pool);
      }
      if (game.slug === "item-cost-duel" && items.length >= 2) {
        const pool = narrowPoolToForcedPair(items, forced, (i) => i.item_name) ?? items;
        return makeItemCostMatchup(game, pool);
      }
      return null;
    };
    const pairKey = (m: SwipeMatchup) =>
      [m.left.id, m.right.id].sort().join("|") + "|" + String(m.context?.stat ?? "");

    let m: SwipeMatchup | null = null;

    if (forced) {
      // Forcing means forcing: skip the anti-repeat entirely. Verifying revote
      // semantics requires dealing the SAME pair on consecutive rounds, which
      // is exactly what `seenPairs` is designed to prevent. Leaving the loop in
      // place would make it degrade through 30 attempts to the same answer, so
      // short-circuiting is both clearer and honest about the intent.
      m = generate();
    } else {
      // Prefer a matchup that is both unseen and entity-fresh; degrade to just
      // unseen, then to anything, so small pools can never stall the loop.
      let fallback: SwipeMatchup | null = null;
      for (let attempt = 0; attempt < 30 && !m; attempt++) {
        const candidate = generate();
        if (!candidate) break;
        fallback = candidate;
        if (seenPairs.current.has(pairKey(candidate))) continue;
        const entityFresh =
          !recentEntities.current.includes(candidate.left.id) &&
          !recentEntities.current.includes(candidate.right.id);
        if (entityFresh || attempt >= 20) m = candidate;
      }
      m = m ?? fallback;
    }
    if (m) {
      seenPairs.current.add(pairKey(m));
      recentEntities.current = [m.left.id, m.right.id, ...recentEntities.current].slice(
        0,
        RECENT_ENTITY_WINDOW,
      );
      setMatchup(m);
      setSelectedId(null);
      setReveal(null);
      shownAt.current = Date.now();
    }
  }, [game, championNames, championStats, items, search]);

  // Deal the first matchup once data is ready.
  useEffect(() => {
    if (!matchup) nextMatchup();
  }, [matchup, nextMatchup]);

  // Auto-advance after the reveal so the loop keeps flowing. Knowledge games
  // get a little longer to read the values/explanation. The countdown bar is
  // a width transition kicked off one frame after the reveal mounts; manual
  // "Next" or unmount clears everything via the effect cleanup.
  const autoAdvanceMs = game?.mode === "knowledge" ? 3500 : 2500;
  const [countdownOn, setCountdownOn] = useState(false);
  useEffect(() => {
    if (!reveal) return;
    const raf = requestAnimationFrame(() => setCountdownOn(true));
    const timer = setTimeout(nextMatchup, autoAdvanceMs);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      setCountdownOn(false);
    };
  }, [reveal, nextMatchup, autoAdvanceMs]);

  const handleChoose = useCallback(
    async (side: "left" | "right") => {
      if (!game || !matchup || selectedId || pending) return;
      const chosen = matchup[side];
      const other = side === "left" ? matchup.right : matchup.left;
      setSelectedId(chosen.id);
      setPending(true);

      const isCorrect = matchup.correctId ? chosen.id === matchup.correctId : null;
      if (game.mode === "knowledge") {
        setRounds((r) => r + 1);
        if (isCorrect) {
          setScore((s) => s + 1);
          setStreak((s) => s + 1);
        } else {
          setStreak(0);
        }
      }

      const agg = await recordSwipeResult({
        gameSlug: game.slug,
        selected: chosen.id,
        other: other.id,
        correct: matchup.correctId,
        selectedValue: chosen.value,
        otherValue: other.value,
        responseTimeMs: Date.now() - shownAt.current,
        context: matchup.context,
      });
      // Factual categories get their verdict from the backend, which re-derives
      // it from canonical Mogzy data. The local comparison above is only a
      // fallback for the reveal — it is never what gets persisted, and it is
      // computed from the same pool the server served, so the two agree.
      //
      // A null `verified_correct` means the server declined to judge (entity
      // retired from the pool, or values converged after a patch). That is NOT
      // "wrong" — fall back to the local reading rather than telling a player
      // they were incorrect because the data moved.
      let verdict: boolean | null = agg?.isCorrect ?? isCorrect;
      if (game.mode === "knowledge") {
        // The evaluator depends on the FACT, not the game: Stat Duel is one game
        // over several facts and its slug is not a category at all. Passing the
        // slug 404s and silently falls back to the browser's own comparison,
        // which is the failure this feature exists to remove. See
        // lib/league-swipe/factualCategories.
        //
        // A null category means no canonical evaluator exists for this variant
        // (base MR). Keep the local reading rather than claiming a verdict.
        const categoryId = resolveFactualCategory(
          game.slug,
          typeof matchup.context?.stat === "string" ? matchup.context.stat : null,
        );
        if (categoryId) {
          const server = await verifyFactualChoice(categoryId, chosen.id, other.id);
          if (server?.verified_correct != null) verdict = server.verified_correct;
        }
      }

      // A failed write reveals with NO community data rather than a synthesised
      // split — see RevealState.
      setReveal({ aggregates: agg, isCorrect: verdict });
      setPending(false);
    },
    [game, matchup, selectedId, pending],
  );

  if (!game) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">
        Game not found.{" "}
        <Link to="/league-swipe" className="text-[#c9a84c] hover:underline">
          Back to {META_REFLEX_NAME}
        </Link>
      </div>
    );
  }

  const revealed = reveal !== null;
  const isCorrect = matchup?.correctId && selectedId ? selectedId === matchup.correctId : null;
  const aggregates = reveal?.aggregates ?? null;
  /** True once revealed but the vote write did not land, so there is nothing to show. */
  const communityUnavailable = revealed && aggregates === null;

  // Map canonical A/B aggregate counts back onto left/right cards. Returns null
  // when there is genuinely nothing to report, so callers render an honest gap
  // instead of a confident 0%.
  const pctFor = (id: string): number | null => {
    if (!aggregates || aggregates.totalVotes === 0) return null;
    const votes = id === aggregates.entityA ? aggregates.votesA : aggregates.votesB;
    return Math.round((votes / aggregates.totalVotes) * 100);
  };
  const selectedPct = selectedId ? pctFor(selectedId) : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <SEOHead
        title={`${game.title} | ${META_REFLEX_NAME} | Mogzy LoL`}
        description={game.description}
        path={`/league-swipe/${game.slug}`}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <Link
          to="/league-swipe"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          <ArrowLeft className="h-4 w-4" /> {META_REFLEX_NAME}
        </Link>
        {game.mode === "knowledge" && (
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold text-[#f0d78c]">
              {score}/{rounds}
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-[#ff9147]">
              <Flame className="h-4 w-4" /> {streak}
            </span>
          </div>
        )}
      </div>

      {/* Prompt */}
      <h1 className="text-center text-lg md:text-2xl font-bold text-foreground mb-5">
        {matchup?.prompt ?? game.prompt}
      </h1>

      {/* Cards */}
      {!matchup ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading matchup…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-5">
          {(["left", "right"] as const).map((side) => {
            const entity = matchup[side];
            const isSelected = selectedId === entity.id;
            const isCorrectCard = revealed && matchup.correctId === entity.id;
            const isWrongPick = revealed && isSelected && matchup.correctId && !isCorrectCard;
            const art =
              game.entityType === "champion" ? getChampionLoading(championAssets, entity.id) : null;
            return (
              <button
                key={`${entity.id}-${side}`}
                onClick={() => handleChoose(side)}
                disabled={revealed || pending}
                className={[
                  "group relative overflow-hidden rounded-2xl border text-left transition-all",
                  "bg-gradient-to-br from-[#0a1428]/90 via-[#091428]/90 to-[#0a0a1a]/90 backdrop-blur-sm",
                  !revealed ? "hover:scale-[1.02] active:scale-[0.98] hover:border-[#c9a84c]/60 cursor-pointer" : "",
                  isCorrectCard
                    ? "border-emerald-400/80 shadow-[0_0_24px_rgba(52,211,153,0.25)]"
                    : isWrongPick
                    ? "border-[#ff4655]/80 shadow-[0_0_24px_rgba(255,70,85,0.2)]"
                    : isSelected
                    ? "border-[#c9a84c] shadow-[0_0_24px_rgba(201,168,76,0.25)]"
                    : "border-border",
                ].join(" ")}
              >
                {/* Art / placeholder */}
                <div className="relative aspect-[3/4] w-full bg-[#0a1428]">
                  {art ? (
                    <img
                      src={art}
                      alt={entity.label}
                      className="absolute inset-0 h-full w-full object-cover object-top"
                      draggable={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                      <div className="rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10 p-4">
                        <Coins className="h-8 w-8 text-[#c9a84c]" />
                      </div>
                      <div className="text-center text-base md:text-lg font-bold text-foreground leading-tight">
                        {entity.label}
                      </div>
                      {entity.sublabel && (
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {entity.sublabel}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 to-transparent" />
                  {/* Name strip (champion cards) */}
                  {art && (
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <div className="text-sm md:text-base font-bold text-white drop-shadow">{entity.label}</div>
                    </div>
                  )}
                  {/* Reveal badges */}
                  {revealed && (isSelected || isCorrectCard) && (
                    <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
                      {isSelected && (
                        <span className="rounded-full bg-[#c9a84c] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#1a1530]">
                          Your pick
                        </span>
                      )}
                      {isCorrectCard && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                          <Check className="h-3 w-3" /> Correct
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {/* Value + vote share footer */}
                <div className="px-3 py-2.5 min-h-[3rem]">
                  {revealed ? (
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-bold text-[#f0d78c]">
                        {pctFor(entity.id) === null ? "—" : `${pctFor(entity.id)}%`}
                      </span>
                      {entity.value !== undefined && (
                        <span className="font-semibold text-foreground tabular-nums">
                          {entity.value.toLocaleString()}
                          {matchup.valueUnit ?? ""}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center">Tap to choose</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Reveal panel */}
      {revealed && matchup && reveal && (
        <div className="mt-5 rounded-2xl border border-border bg-gradient-to-br from-[#0a1428]/90 to-[#0a0a1a]/90 backdrop-blur-sm p-4 md:p-5">
          {game.mode === "knowledge" ? (
            <div className="flex items-center gap-2 mb-2">
              {/* Server verdict when the write landed, local derivation otherwise. */}
              {reveal.isCorrect ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Check className="h-5 w-5" /> Correct!
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#ff4655] font-bold">
                  <X className="h-5 w-5" /> Incorrect
                </span>
              )}
            </div>
          ) : (
            <div className="mb-2 font-bold text-foreground">
              You chose <span className="text-[#f0d78c]">{selectedId}</span>
              {aggregates?.ratingChange != null && (
                <span className="ml-2 text-xs font-semibold text-emerald-400">
                  +{aggregates.ratingChange} rating
                </span>
              )}
            </div>
          )}

          {matchup.explanation && (
            <p className="text-sm text-muted-foreground mb-3">{matchup.explanation}</p>
          )}

          {/* Community split bar (left card share vs right card share). Shown
              only when the vote actually landed — never synthesised. */}
          {communityUnavailable ? (
            <div
              data-testid="swipe-community-unavailable"
              className="rounded-lg border border-border/70 bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground"
            >
              Community results aren’t available right now — your vote wasn’t counted. The
              answer above is still correct.
            </div>
          ) : (
            <>
              <div className="mb-1.5 flex justify-between text-xs font-semibold text-muted-foreground">
                <span>
                  {matchup.left.label} · {pctFor(matchup.left.id)}%
                </span>
                <span>
                  {matchup.right.label} · {pctFor(matchup.right.id)}%
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10 flex">
                <div
                  className="h-full bg-gradient-to-r from-[#c9a84c] to-[#f0d78c] transition-all duration-700"
                  style={{ width: `${pctFor(matchup.left.id) ?? 0}%` }}
                />
                <div
                  className="h-full bg-[#3a7bd5] transition-all duration-700"
                  style={{ width: `${pctFor(matchup.right.id) ?? 0}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {(aggregates?.totalVotes ?? 0).toLocaleString()} vote
                {aggregates?.totalVotes === 1 ? "" : "s"} on this matchup
                {(aggregates?.totalVotes ?? 0) > 1 && selectedPct !== null && (
                  <> — you sided with {selectedPct}% of players.</>
                )}
              </div>
            </>
          )}

          <button
            onClick={nextMatchup}
            className="relative overflow-hidden mt-4 w-full inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-4 py-2.5 text-sm font-bold text-[#1a1530] hover:from-[#d4b35c] hover:to-[#b8923f] transition-colors"
          >
            Next matchup <ArrowRight className="h-4 w-4" />
            {/* Auto-advance countdown */}
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-1 bg-[#1a1530]/35"
              style={{
                width: countdownOn ? "100%" : "0%",
                transitionProperty: "width",
                transitionTimingFunction: "linear",
                transitionDuration: countdownOn ? `${autoAdvanceMs}ms` : "0ms",
              }}
            />
          </button>
        </div>
      )}
    </div>
  );
}
