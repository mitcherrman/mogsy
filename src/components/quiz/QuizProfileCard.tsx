import { motion } from "framer-motion";
import { Shield, Flame, Trophy, Target, ChevronRight, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveQuizAssetUrl, type QuizProgress } from "@/lib/quiz/api";

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
}: {
  progress: QuizProgress | null;
  loading?: boolean;
  error?: string | null;
  recentXpGain?: number | null;
}) {
  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />;
  }

  const hasProgress = !!progress && (progress.attempts ?? 0) > 0;
  // Backend may return `rank` / `next_rank` as nested objects instead of strings.
  const rankObj = (progress?.rank && typeof progress.rank === "object" ? progress.rank : null) as any;
  const nextRankObj = (progress?.next_rank && typeof progress.next_rank === "object" ? progress.next_rank : null) as any;
  const rankName =
    progress?.rank_name ||
    rankObj?.rank_name ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";
  const nextRank =
    progress?.next_rank_name ||
    rankObj?.next_rank_name ||
    nextRankObj?.rank_name ||
    nextRankObj?.next_rank_name ||
    (typeof progress?.next_rank === "string" ? progress.next_rank : null);
  const iconUrl =
    resolveQuizAssetUrl(progress?.rank_icon) ||
    resolveQuizAssetUrl(rankObj?.large_icon_path) ||
    resolveQuizAssetUrl(rankObj?.icon_path) ||
    resolveQuizAssetUrl(rankObj?.small_icon_path) ||
    resolveQuizAssetUrl("assets/ranks/unranked.png");
  const xp = progress?.xp ?? rankObj?.progress_xp ?? 0;
  const pct = Math.max(
    0,
    Math.min(100, Number(progress?.progress_percent ?? rankObj?.progress_percent ?? 0)),
  );
  const xpToNext =
    Number(
      progress?.xp_to_next ??
        rankObj?.xp_to_next ??
        nextRankObj?.xp_required ??
        0,
    ) || 0;
  const nextIconUrl =
    resolveQuizAssetUrl(progress?.next_rank_icon) ||
    resolveQuizAssetUrl(nextRankObj?.large_icon_path) ||
    resolveQuizAssetUrl(nextRankObj?.icon_path) ||
    resolveQuizAssetUrl(nextRankObj?.small_icon_path) ||
    null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm border-primary/20">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-4">
            <motion.div
              key={`rank-${rankName}`}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative shrink-0"
            >
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${rankName} rank`}
                  className="h-24 w-24 md:h-28 md:w-28 object-contain drop-shadow-[0_0_22px_hsl(var(--primary)/0.55)]"
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
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">
                    {hasProgress
                      ? `${rankName}${nextRank ? ` → ${nextRank}` : ""}`
                      : "Play your first question to rank up"}
                  </span>
                  <span className="shrink-0 font-mono">{fmtPct(pct)}</span>
                </div>
                {nextRank && (xpToNext > 0 || hasProgress) && (
                  <div className="mt-1 text-[10px] text-muted-foreground/80">
                    {xpToNext > 0 ? (
                      <>
                        <span className="font-semibold text-primary/90">
                          {xpToNext.toLocaleString()} XP
                        </span>{" "}
                        until {nextRank}
                      </>
                    ) : (
                      <>Next: {nextRank}</>
                    )}
                  </div>
                )}
              </div>
            </div>
            {nextIconUrl && (
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
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat icon={Flame} label="Streak" value={progress?.current_streak ?? 0} />
            <Stat icon={Trophy} label="Best" value={progress?.best_streak ?? 0} />
            <Stat icon={Target} label="Accuracy" value={fmtPct(progress?.accuracy)} />
            <Stat icon={Shield} label="Answered" value={progress?.attempts ?? 0} />
          </div>

          {error && (
            <p className="text-[10px] text-muted-foreground/70 italic">{error}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}