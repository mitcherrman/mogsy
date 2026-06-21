import { motion } from "framer-motion";
import { Swords, TrendingUp, TrendingDown, Shield, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { resolveQuizAssetUrl, type QuizProgress } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";

/**
 * Featured Ranked Quiz mode hero card. Visually the competitive mode of League
 * Quiz. Backend support is mocked through the `RankedState` for now.
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
  const rankObj = (progress?.rank && typeof progress.rank === "object" ? progress.rank : null) as any;
  const rankName =
    progress?.rank_name ||
    rankObj?.rank_name ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";
  const iconUrl =
    resolveQuizAssetUrl(progress?.rank_icon) ||
    resolveQuizAssetUrl(rankObj?.large_icon_path) ||
    resolveQuizAssetUrl(rankObj?.icon_path) ||
    resolveQuizAssetUrl("assets/ranks/unranked.png");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
    >
      <Card
        className="relative overflow-hidden border-cyan-400/30 bg-gradient-to-br from-[#06121f]/90 via-[#0a1428]/90 to-[#0a0a1a]/90 backdrop-blur-sm"
        style={{
          boxShadow:
            "0 0 0 1px rgba(80,170,220,0.18) inset, 0 0 28px rgba(80,170,220,0.20), 0 8px 28px rgba(0,0,0,0.55)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-70"
        />
        <CardContent className="relative p-5">
          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${rankName} rank`}
                  className="h-16 w-16 object-contain drop-shadow-[0_0_14px_rgba(80,170,220,0.45)]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10">
                  <Shield className="h-8 w-8 text-cyan-200" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                    Featured · Ranked
                  </div>
                  <h3 className="truncate text-lg font-bold tracking-tight text-foreground">
                    {ranked.isPlaced ? rankName : "Placement Series"}
                  </h3>
                </div>
                <Badge
                  variant="outline"
                  className="shrink-0 border-cyan-400/40 bg-cyan-400/10 text-[10px] font-semibold text-cyan-200"
                >
                  <Swords className="mr-1 h-3 w-3" />
                  {ranked.isPlaced ? "Ranked Queue" : "Placement"}
                </Badge>
              </div>

              {!ranked.isPlaced ? (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {ranked.placementMatchesRemaining} placement
                  {ranked.placementMatchesRemaining === 1 ? " match" : " matches"} remaining
                  before your rank is locked in.
                </p>
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  Queue a ranked set — winning answers raise your rank, missed answers cost XP.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                  <TrendingUp className="h-3 w-3" />+{ranked.estimatedGain} XP / win
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                  <TrendingDown className="h-3 w-3" />−{ranked.estimatedLoss} XP / loss
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end">
            <Button
              size="sm"
              onClick={onPlay}
              disabled={disabled}
              className="bg-gradient-to-r from-cyan-500 to-sky-600 text-foreground hover:from-cyan-400 hover:to-sky-500"
            >
              {ranked.isPlaced ? "Queue Ranked" : "Play Placement"}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}