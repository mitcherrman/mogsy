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
  type ChampionStats,
  type ItemMeta,
  type SwipeMatchup,
  type SwipeRevealAggregates,
} from "@/lib/league-swipe/api";
import { META_REFLEX_NAME } from "@/lib/league-swipe/branding";
import { narrowPoolToForcedPair, parseForcedPair } from "@/lib/league-swipe/devForcedPair";
import { resolveFactualCategory } from "@/lib/league-swipe/factualCategories";
import { newSubmissionId } from "@/lib/league-swipe/submissionId";

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
  /**
   * What the reveal SHOWS. Canonical verdict when there is one, otherwise the
   * older fallback chain (RPC echo, then the local comparison) so a player is
   * never told they were wrong because the verifier was unreachable.
   */
  isCorrect: boolean | null;
  /**
   * Whether a CANONICAL verdict was obtained — i.e. whether this round counted.
   *
   * Distinct from `isCorrect` on purpose. `isCorrect` may still be filled in by
   * the fallback chain so the reveal stays informative, but only a canonical
   * verdict is allowed to move score/streak, so the two can legitimately
   * disagree about whether anything was scored. Rendering that difference is
   * what keeps a frozen streak from looking like a bug.
   */
  judged: boolean;
};

/**
 * Stable empty defaults for the three pool queries. NOT cosmetic.
 *
 * Written inline as `= []`, each of these allocated a fresh array on every
 * render for any query that was disabled or still loading — and every game
 * disables at least two of the three (Stat Duel needs no items, Item Cost Duel
 * needs no champions). That new identity propagated into `nextMatchup`'s
 * `useCallback` deps, which are in turn the auto-advance effect's deps, so the
 * effect tore down and re-armed its `setTimeout` on every render. The countdown
 * bar's own `requestAnimationFrame` caused a render, which re-ran the effect,
 * which cancelled the timer and reset the bar — a ~16ms cycle in which the
 * timeout could never reach its deadline. Auto-advance therefore never fired at
 * all, and the countdown bar never visibly filled. Hoisting the defaults to
 * module scope makes the identities constant and the effect quiet.
 */
const NO_CHAMPION_NAMES: string[] = [];
const NO_CHAMPION_STATS: ChampionStats[] = [];
const NO_ITEMS: ItemMeta[] = [];

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

  const { data: championNames = NO_CHAMPION_NAMES } = useQuery({
    queryKey: ["league-swipe", "champion-names"],
    queryFn: fetchChampionNames,
    staleTime: 60 * 60 * 1000,
    enabled: game?.mode === "opinion",
  });
  const { data: championStats = NO_CHAMPION_STATS } = useQuery({
    queryKey: ["league-swipe", "champion-stats"],
    queryFn: fetchChampionStats,
    staleTime: 60 * 60 * 1000,
    enabled: game?.slug === "higher-base-stat",
  });
  const { data: items = NO_ITEMS } = useQuery({
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
  /**
   * Identity of the attempt currently on screen — one DEALT matchup maps to one
   * logical submission, and the RPC dedupes on it.
   *
   * Minted when a matchup is dealt, NOT when a card is tapped. That boundary is
   * what makes each of these behave correctly:
   *
   *   * Double tap / multi-touch — two `handleChoose` calls can slip past the
   *     `selectedId`/`pending` guard, because both read state from a closure
   *     that has not re-rendered yet. Minting per tap would give them two ids
   *     and two rows; minting per deal gives them one id, and the RPC's
   *     short-circuit collapses the second into the first's outcome.
   *   * Retry of a failed write — the ref is untouched by a failure, so the
   *     retry re-submits under the same identity instead of counting twice.
   *   * Next matchup / auto-advance — `nextMatchup` is the only place a new id
   *     is minted, so a new question is always a new attempt.
   *   * The same pair dealt again later (including dev `forcePair`, which deals
   *     one pair over and over on purpose) — that is a fresh deal, so it is a
   *     fresh attempt with a fresh id. The identity is the ATTEMPT, never the
   *     entity pair.
   */
  const submissionId = useRef<string | null>(null);
  /**
   * The attempt whose canonical verdict has already been applied to score/streak.
   *
   * Same identity as the submission id, and for the same reason: the tap guard
   * (`selectedId`/`pending`) is a state read from a closure, so a sub-frame
   * double-fire can slip two `handleChoose` calls past it. The RPC's
   * `client_submission_id` short-circuit collapses those into one stored vote;
   * this ref is the local equivalent for the scoreboard, so one dealt matchup can
   * never move the streak twice.
   */
  const scoredAttempt = useRef<string | null>(null);
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
      // A dealt matchup is a new question, so it is a new attempt. Minted only
      // here, and only once the matchup is actually committed — a generate()
      // that came back null must not burn the current attempt's identity.
      submissionId.current = newSubmissionId();
    }
  }, [game, championNames, championStats, items, search]);

  // Deal the first matchup once data is ready.
  useEffect(() => {
    if (!matchup) nextMatchup();
  }, [matchup, nextMatchup]);

  // Auto-advance after the reveal so the loop keeps flowing. The countdown bar
  // is a width transition kicked off one frame after the reveal mounts; manual
  // "Next" or unmount clears everything via the effect cleanup.
  //
  // The knowledge beat used to be 3500ms, sized for a reveal that appeared the
  // instant a card was tapped. It no longer does: the reveal now waits for the
  // canonical verdict, so the round trip is already spent before this timer
  // starts and the old hold read as a stall on top of a stall. 1500ms is the
  // top of the requested 1.0–1.5s band — the longest beat that still feels
  // rapid-fire, because a factual reveal has the most to read (both values, the
  // explanation, and the community split).
  const autoAdvanceMs = game?.mode === "knowledge" ? 1500 : 2500;
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

      // CAPTURED, never re-read from the ref inside a retry. Auto-advance
      // rotates `submissionId` a couple of seconds after the reveal, so a retry
      // that re-read it would submit this answer under the NEXT question's
      // identity — inventing an attempt rather than repeating one. Any future
      // retry/offline-queue path must carry this local value through.
      if (!submissionId.current) submissionId.current = newSubmissionId();
      const attemptId = submissionId.current;

      const agg = await recordSwipeResult({
        gameSlug: game.slug,
        selected: chosen.id,
        other: other.id,
        correct: matchup.correctId,
        selectedValue: chosen.value,
        otherValue: other.value,
        responseTimeMs: Date.now() - shownAt.current,
        context: matchup.context,
        clientSubmissionId: attemptId,
      });
      // THE CANONICAL VERDICT — the only thing allowed to move score/streak.
      //
      // Deliberately seeded to null rather than to the local comparison. Score
      // and streak used to be written synchronously from that comparison the
      // instant a card was tapped, before this request was even sent, so a round
      // the backend went on to call `Incorrect` had already banked a point and
      // extended the streak. Keeping the local reading out of this variable
      // entirely is what makes that unrepresentable: there is no path by which
      // the browser's own opinion reaches the scoreboard.
      //
      // Stays null when the answer is UNJUDGED, which is three distinct cases —
      // no evaluator exists for the variant (base MR), the verifier was
      // unreachable, or the server declined (entity retired, values converged
      // after a patch). None of them is evidence of a wrong answer, so none of
      // them scores.
      let canonicalVerdict: boolean | null = null;
      if (game.mode === "knowledge") {
        // The evaluator depends on the FACT, not the game: Stat Duel is one game
        // over several facts and its slug is not a category at all. Passing the
        // slug 404s and silently falls back to the browser's own comparison,
        // which is the failure this feature exists to remove. See
        // lib/league-swipe/factualCategories.
        const categoryId = resolveFactualCategory(
          game.slug,
          typeof matchup.context?.stat === "string" ? matchup.context.stat : null,
        );
        if (categoryId) {
          const server = await verifyFactualChoice(categoryId, chosen.id, other.id);
          canonicalVerdict = server?.verified_correct ?? null;
        }

        // Scored here, AFTER the verdict lands and BEFORE the reveal renders, so
        // the scoreboard and the badge are two readings of one decision rather
        // than a race between an optimistic guess and the truth. Opinion games
        // never reach this block: they have no factual truth, so they can neither
        // extend nor break the factual streak.
        if (canonicalVerdict !== null && scoredAttempt.current !== attemptId) {
          scoredAttempt.current = attemptId;
          // `rounds` counts SCORED rounds, so `score/rounds` stays a true
          // accuracy. Counting an unjudged round in the denominator would be
          // scoring it wrong by arithmetic while claiming not to judge it.
          setRounds((r) => r + 1);
          if (canonicalVerdict) {
            setScore((s) => s + 1);
            setStreak((s) => s + 1);
          } else {
            setStreak(0);
          }
        }
      }

      // What the reveal SHOWS, which is a weaker claim than what it SCORES.
      // Unchanged fallback chain: canonical verdict, then the RPC's echo, then
      // the local comparison — so an unreachable verifier still reveals the
      // answer instead of accusing the player. `judged` carries the difference
      // through to the panel.
      const localReading = matchup.correctId ? chosen.id === matchup.correctId : null;
      const shownVerdict = canonicalVerdict ?? agg?.isCorrect ?? localReading;

      // A failed write reveals with NO community data rather than a synthesised
      // split — see RevealState.
      setReveal({
        aggregates: agg,
        isCorrect: shownVerdict,
        judged: canonicalVerdict !== null,
      });
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
            {/* Both counters read the canonical verdict only — see handleChoose.
                `rounds` is SCORED rounds, not rounds played. */}
            <span data-testid="swipe-score" className="font-semibold text-[#f0d78c]">
              {score}/{rounds}
            </span>
            <span
              data-testid="swipe-streak"
              className="inline-flex items-center gap-1 font-semibold text-[#ff9147]"
            >
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
              {/* Canonical verdict when there is one, local derivation otherwise. */}
              {reveal.isCorrect ? (
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
                  <Check className="h-5 w-5" /> Correct!
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[#ff4655] font-bold">
                  <X className="h-5 w-5" /> Incorrect
                </span>
              )}
              {/* Says out loud that the streak did not move, and why. Without
                  this the answer above reads as a scored round and a stalled
                  counter reads as a broken one. */}
              {!reveal.judged && (
                <span
                  data-testid="swipe-round-unscored"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Not scored — no canonical verdict for this matchup
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
