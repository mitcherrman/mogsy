import { motion } from "framer-motion";
import { Swords, TrendingUp, TrendingDown, Shield, ArrowRight, Flame, Trophy, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { progressAttempts, resolveQuizAssetUrl, type QuizProgress } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";

/**
 * Ranked Quiz hero — the primary card at the top of the Quiz Hub. Ranked 1v1
 * knowledge matches are the flagship experience, so this carries the
 * strongest (gold/rank) treatment on the page. It also absorbs the player's
 * compact progress summary (streaks, rounded accuracy, answered, and — once
 * placed — XP progress toward the next rank), so no second large progress
 * panel repeats this information below.
 *
 * Placement honesty: until placements are complete the player is UNRANKED —
 * we deliberately show the unranked emblem and placement progress, never a
 * provisional Bronze bar (the progress endpoint may already carry a default
 * rank object, which would read as a finalized rank).
 */
export default function QuizRankedQueueCard({
  progress,
  ranked,
  onPlay,
  disabled,
}: {
  progress: QuizProgress | null;
  ranked: RankedState;
  onPlay: () => void;
  disabled?: boolean;
}) {
  // Backend may return `rank` / `next_rank` as nested objects instead of strings.
  type RankLike = {
    rank_name?: string;
    next_rank_name?: string;
    large_icon_path?: string;
    icon_path?: string;
    progress_percent?: number;
  };
  const rankObj =
    progress?.rank && typeof progress.rank === "object" ? (progress.rank as RankLike) : null;
  const nextRankObj =
    progress?.next_rank && typeof progress.next_rank === "object"
      ? (progress.next_rank as RankLike)
      : null;
  const rankName =
    progress?.rank_name ||
    rankObj?.rank_name ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";
  const nextRank =
    progress?.next_rank_name ||
    rankObj?.next_rank_name ||
    nextRankObj?.rank_name ||
    (typeof progress?.next_rank === "string" ? progress.next_rank : null);
  // Unplaced players always see the unranked emblem — never a provisional
  // rank icon that suggests a finalized rank.
  const iconUrl = ranked.isPlaced
    ? resolveQuizAssetUrl(progress?.rank_icon) ||
      resolveQuizAssetUrl(rankObj?.large_icon_path) ||
      resolveQuizAssetUrl(rankObj?.icon_path) ||
      resolveQuizAssetUrl("assets/ranks/unranked.png")
    : resolveQuizAssetUrl("assets/ranks/unranked.png");

  const placementTotal = 5;
  const placementDone = Math.max(0, placementTotal - ranked.placementMatchesRemaining);

  const answered = progressAttempts(progress);
  const rankPct = Math.max(
    0,
    Math.min(100, Math.round(Number(progress?.progress_percent ?? rankObj?.progress_percent ?? 0))),
  );
  const accuracy =
    progress?.accuracy === undefined || progress?.accuracy === null || Number.isNaN(Number(progress.accuracy))
      ? null
      : Math.round(Number(progress.accuracy));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card
        data-testid="ranked-hero"
        className="relative overflow-hidden border-[#c9a84c]/50 bg-gradient-to-br from-[#0d1020]/95 via-[#050d1a]/95 to-[#000]/95 backdrop-blur-sm"
        style={{
          boxShadow:
            "0 0 0 1px rgba(201,168,76,0.28) inset, 0 0 36px rgba(201,168,76,0.18), 0 0 28px rgba(80,170,220,0.16), 0 12px 34px rgba(0,0,0,0.75)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f0d78c] to-transparent opacity-90"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(90% 70% at 0% 100%, rgba(80,170,220,0.12) 0%, transparent 60%), radial-gradient(70% 50% at 100% 0%, rgba(201,168,76,0.12) 0%, transparent 55%)",
          }}
        />
        <CardContent className="relative p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-5">
            <div
              className="relative shrink-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(201,168,76,0.28) 0%, rgba(80,170,220,0.18) 45%, transparent 70%)",
              }}
            >
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={ranked.isPlaced ? `${rankName} rank` : "Unranked"}
                  className="h-16 w-16 sm:h-24 sm:w-24 object-contain drop-shadow-[0_0_20px_rgba(201,168,76,0.55)]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-16 w-16 sm:h-24 sm:w-24 items-center justify-center rounded-full border border-[#c9a84c]/40 bg-[#c9a84c]/10">
                  <Shield className="h-9 w-9 sm:h-12 sm:w-12 text-[#f0d78c]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* flex-wrap: on narrow widths the badge drops to its own row
                  instead of ellipsizing the primary title. */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.26em] text-[#f0d78c]">
                    Ranked Quiz
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                    {ranked.isPlaced ? rankName : "Placement Series"}
                  </h3>
                </div>
                {ranked.isPlaced ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-cyan-400/50 bg-cyan-400/10 text-[10px] font-semibold uppercase tracking-wider text-cyan-200"
                  >
                    <Swords className="mr-1 h-3 w-3" />
                    Ranked Queue
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-400/60 bg-amber-400/15 text-[10px] font-bold uppercase tracking-wider text-amber-200 shadow-[0_0_10px_-2px_rgba(251,191,36,0.45)]"
                  >
                    Unranked
                  </Badge>
                )}
              </div>

              <p className="mt-1 text-xs sm:text-[13px] leading-snug text-foreground/85">
                Face other players in synchronized 1v1 League knowledge matches.
              </p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">
                Shared questions · HP combat · XP and ranks
              </p>

              {!ranked.isPlaced ? (
                <div className="mt-2 sm:mt-3 rounded-md border border-amber-400/25 bg-amber-400/5 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                    <span className="font-bold text-amber-200">
                      Placement {placementDone}/{placementTotal}
                    </span>
                    <span className="text-muted-foreground">
                      {ranked.placementMatchesRemaining} placement
                      {ranked.placementMatchesRemaining === 1 ? " match" : " matches"} remaining
                    </span>
                  </div>
                  <Progress
                    value={(placementDone / placementTotal) * 100}
                    className="mt-1 h-1.5"
                  />
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Complete your placement matches to establish your starting rank.
                  </p>
                </div>
              ) : (
                <div className="mt-2 sm:mt-3">
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Queue a ranked set — winning answers raise your rank, missed answers cost XP.
                  </p>
                  {nextRank && (
                    <div className="mt-1.5" data-testid="rank-progress">
                      <Progress value={rankPct} className="h-1.5" />
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {rankPct}% to {nextRank}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Compact progress summary — absorbed from the old standalone
                  Current Progress card so the hero is the single source of
                  ranked status on the page. */}
              <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="hero-stat-strip">
                <HeroStat icon={Flame} label="Current streak" value={progress?.current_streak ?? 0} />
                <HeroStat icon={Trophy} label="Best streak" value={progress?.best_streak ?? 0} />
                <HeroStat icon={Target} label="Accuracy" value={accuracy === null ? "—" : `${accuracy}%`} />
                <HeroStat icon={Shield} label="Answered" value={answered} />
              </div>

              <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-1.5">
                <div className="rounded-md border border-emerald-400/40 bg-emerald-500/10 px-2 py-1">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-emerald-300/90">
                    <TrendingUp className="h-2.5 w-2.5" />
                    Win
                  </div>
                  <div className="text-sm font-extrabold tabular-nums text-emerald-200">
                    +{ranked.estimatedGain}
                    <span className="ml-0.5 text-[10px] font-medium opacity-70">XP</span>
                  </div>
                </div>
                <div className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-rose-300/90">
                    <TrendingDown className="h-2.5 w-2.5" />
                    Loss
                  </div>
                  <div className="text-sm font-extrabold tabular-nums text-rose-200">
                    −{ranked.estimatedLoss}
                    <span className="ml-0.5 text-[10px] font-medium opacity-70">XP</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <Link to="/profile">View full profile</Link>
            </Button>
            <Button
              onClick={onPlay}
              disabled={disabled}
              className="min-h-11 bg-gradient-to-r from-[#c9a84c] to-[#a8862f] px-5 font-bold text-[#1a1530] shadow-[0_0_22px_-4px_rgba(201,168,76,0.7)] hover:from-[#d4b35c] hover:to-[#b8923f]"
            >
              {ranked.isPlaced ? "Queue Ranked" : "Play Placement"}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function HeroStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2 py-1">
      <Icon className="h-3 w-3 shrink-0 text-cyan-300/80" />
      <div className="min-w-0 leading-tight">
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate text-xs font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
