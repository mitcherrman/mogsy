import { motion } from "framer-motion";
import { Shield, Flame, Trophy, Target, ChevronRight, Sparkles, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { progressAttempts, resolveQuizAssetUrl, type QuizProgress, type QuizAchievement } from "@/lib/quiz/api";
import RankCrown from "@/components/ranked/RankCrown";
import { parseRankTier } from "@/lib/progression/tiers";
import { academyTierLabel, parseAcademyProgression } from "@/lib/progression/academy";

function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(Math.abs(n - Math.round(n)) < 0.05 ? 0 : 2)}%`;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/40 px-2.5 py-2">
      <Icon className="h-3.5 w-3.5 text-primary/80 shrink-0" />
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

export default function QuizProfileCard({
  progress,
  loading,
  error,
  recentXpGain,
  achievements,
  onViewAchievements,
}: {
  progress: QuizProgress | null;
  loading?: boolean;
  error?: string | null;
  recentXpGain?: number | null;
  achievements?: QuizAchievement[];
  onViewAchievements?: () => void;
}) {
  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  const answered = progressAttempts(progress);
  const hasProgress = !!progress && answered > 0;
  // Backend may return `rank` / `next_rank` as nested objects instead of strings.
  const rankObj = (progress?.rank && typeof progress.rank === "object" ? progress.rank : null) as any;
  const nextRankObj = (progress?.next_rank && typeof progress.next_rank === "object" ? progress.next_rank : null) as any;
  // RE1 Phase 2/2B: the backend's derived five-tier Academy standing.
  //
  // `academyTier` drives the crown and title; `academyProgression` drives the
  // bar and the next-tier label and additionally requires a coherent interval.
  // Both return null for a missing field, an older backend, or any token
  // outside the five-tier vocabulary, and every legacy value below is computed
  // regardless — so a null in both leaves this card rendering exactly what it
  // rendered before RE1.
  const academyTier = parseRankTier(progress?.academy_tier);
  const academyProgression = parseAcademyProgression(progress);
  const legacyRankName =
    progress?.rank_name ||
    rankObj?.rank_name ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";
  const rankName = academyTier ? academyTierLabel(academyTier) : legacyRankName;
  const legacyNextRank =
    progress?.next_rank_name ||
    rankObj?.next_rank_name ||
    nextRankObj?.rank_name ||
    nextRankObj?.next_rank_name ||
    (typeof progress?.next_rank === "string" ? progress.next_rank : null);
  // Once the Academy path is active, NOTHING legacy may reach the supporting
  // copy: an "Academy Gold" title above "50% to Platinum" was the exact
  // contradiction Phase 2B exists to remove. At Challenger there is no next
  // tier at all, which the max-tier copy below handles.
  const nextRank = academyTier
    ? (academyProgression?.nextTier ? academyTierLabel(academyProgression.nextTier) : null)
    : legacyNextRank;
  const isAcademyMaxTier = !!academyProgression?.isMaxTier;
  const iconUrl =
    resolveQuizAssetUrl(progress?.rank_icon) ||
    resolveQuizAssetUrl(rankObj?.large_icon_path) ||
    resolveQuizAssetUrl(rankObj?.icon_path) ||
    resolveQuizAssetUrl(rankObj?.small_icon_path) ||
    resolveQuizAssetUrl("assets/ranks/unranked.png");
  const xp = progress?.xp ?? progress?.total_xp ?? rankObj?.progress_xp ?? 0;
  const legacyPct = Math.max(
    0,
    Math.min(100, Number(progress?.progress_percent ?? rankObj?.progress_percent ?? 0)),
  );
  const legacyXpToNext =
    Number(
      progress?.xp_to_next ??
        rankObj?.xp_to_next ??
        nextRankObj?.xp_required ??
        0,
    ) || 0;
  // Academy percentages are computed server-side from the approved
  // thresholds; they are read, never recomputed here.
  const pct = academyProgression ? academyProgression.progressPercent : legacyPct;
  const xpToNext = academyProgression ? academyProgression.xpToNext : legacyXpToNext;
  const legacyNextIconUrl =
    resolveQuizAssetUrl(progress?.next_rank_icon) ||
    resolveQuizAssetUrl(nextRankObj?.large_icon_path) ||
    resolveQuizAssetUrl(nextRankObj?.icon_path) ||
    resolveQuizAssetUrl(nextRankObj?.small_icon_path) ||
    null;
  const nextIconUrl = academyTier ? null : legacyNextIconUrl;

  /**
   * The one progress summary line. The Academy branches never fall through to
   * the legacy wording: on the Academy path with no usable interval there is
   * simply nothing truthful to say about the next tier, so the line is left
   * empty rather than repeating the title or borrowing the legacy ladder.
   * The final branch is the pre-RE1 behaviour, unchanged.
   */
  const summaryText = !hasProgress
    ? "Play your first question to rank up"
    : isAcademyMaxTier
      ? `${rankName} — max tier reached`
      : nextRank
        ? `${Math.round(pct)}% to ${nextRank}`
        : academyTier
          ? null
          : rankName;

  // Achievement summary derived from the (optionally provided) achievements list.
  const totalAch = achievements?.length ?? 0;
  const unlockedAch = (achievements || []).filter((a) => a?.unlocked).length;
  const achPct = totalAch > 0 ? Math.round((unlockedAch / totalAch) * 100) : 0;
  const nextClosestAchievement = (() => {
    const locked = (achievements || []).filter((a) => !a?.unlocked);
    if (locked.length === 0) return null;
    const withProgress = locked
      .map((a) => {
        const goal = Number(a.goal ?? 0);
        const prog = Number(a.progress ?? 0);
        const pct = goal > 0 ? Math.min(100, (prog / goal) * 100) : 0;
        return { a, pct, goal, prog };
      })
      .filter((r) => r.goal > 0 && r.pct > 0)
      .sort((a, b) => b.pct - a.pct);
    if (withProgress.length === 0) return { a: locked[0], pct: 0, goal: 0, prog: 0 };
    return withProgress[0];
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm border-primary/20">
        <CardContent className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          <div className="flex items-center gap-4">
            <motion.div
              key={`rank-${rankName}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative shrink-0"
            >
              {academyTier ? (
                /* Mogzy crown for the five-tier Academy track. RankCrown falls
                   back to the legacy crest by itself if the crown art fails. */
                <RankCrown
                  rankName={academyTier}
                  fallbackSrc={iconUrl}
                  alt={`${rankName} crown`}
                  size="hero"
                  className="drop-shadow-[0_0_22px_hsl(var(--primary)/0.55)]"
                />
              ) : iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${rankName} rank`}
                  className="h-20 w-20 md:h-28 md:w-28 object-contain drop-shadow-[0_0_22px_hsl(var(--primary)/0.55)]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="h-24 w-24 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Shield className="h-12 w-12 text-primary" />
                </div>
              )}
            </motion.div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg md:text-xl font-bold leading-tight tracking-wide">{rankName}</h2>
                {hasProgress && (
                  <Badge variant="secondary" className="text-[10px]">
                    {xp.toLocaleString()} XP
                  </Badge>
                )}
                {typeof recentXpGain === "number" && recentXpGain > 0 && (
                  <motion.span
                    key={`gain-${recentXpGain}`}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                  >
                    <Sparkles className="h-2.5 w-2.5" />+{recentXpGain} XP
                  </motion.span>
                )}
              </div>
              <div className="mt-1">
                <Progress value={pct} className="h-2 transition-all" />
                {/* One concise progress summary — no duplicated rank/percent wording. */}
                <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{summaryText}</span>
                  {hasProgress && !isAcademyMaxTier && nextRank && xpToNext > 0 && (
                    <span className="shrink-0">
                      <span className="font-semibold text-primary/90">{xpToNext.toLocaleString()} XP</span> left
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Next-tier preview. On the Academy path this is the next Mogzy
                crown — never a legacy crest — and Challenger has none. */}
            {academyProgression?.nextTier ? (
              <div className="hidden shrink-0 flex-col items-center sm:flex">
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                <RankCrown
                  rankName={academyProgression.nextTier}
                  alt={`${nextRank} crown`}
                  size="row"
                  className="opacity-70 grayscale"
                />
                <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                  {nextRank}
                </span>
              </div>
            ) : nextIconUrl ? (
              <div className="hidden shrink-0 flex-col items-center sm:flex">
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                <img
                  src={nextIconUrl}
                  alt={`${nextRank ?? "Next"} rank`}
                  className="h-14 w-14 object-contain opacity-70 grayscale"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                {nextRank && (
                  <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                    {nextRank}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <Stat icon={Flame} label="Streak" value={progress?.current_streak ?? 0} />
            <Stat icon={Trophy} label="Best" value={progress?.best_streak ?? 0} />
            <Stat icon={Target} label="Accuracy" value={fmtPct(progress?.accuracy)} />
            <Stat icon={Shield} label="Answered" value={answered} />
          </div>

          {totalAch > 0 && (
            <div className="rounded-md border border-[#c9a84c]/25 bg-[#c9a84c]/5 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#c9a84c]/90">
                  <Trophy className="h-3 w-3" />
                  Achievements
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold tabular-nums text-[#f5e9c8]">
                    {unlockedAch}/{totalAch}
                    <span className="ml-1 font-mono text-muted-foreground">{achPct}%</span>
                  </span>
                  {onViewAchievements && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onViewAchievements}
                      className="h-6 px-2 text-[10px] uppercase tracking-wider text-primary/90 hover:text-primary"
                    >
                      View
                      <ChevronRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <Progress value={achPct} className="mt-1 h-1" />
              {nextClosestAchievement?.a && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Lock className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">
                    Next:&nbsp;
                    <span className="font-semibold text-foreground/90">
                      {nextClosestAchievement.a.title || nextClosestAchievement.a.name || "Achievement"}
                    </span>
                    {nextClosestAchievement.goal > 0 && (
                      <span className="ml-1 font-mono opacity-80">
                        {nextClosestAchievement.prog}/{nextClosestAchievement.goal}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-[10px] text-muted-foreground/70 italic">{error}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}