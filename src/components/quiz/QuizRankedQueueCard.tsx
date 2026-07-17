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
        className="relative overflow-hidden border-cyan-400/40 bg-gradient-to-br from-[#02080f]/95 via-[#050d1a]/95 to-[#000]/95 backdrop-blur-sm"
        style={{
          boxShadow:
            "0 0 0 1px rgba(80,170,220,0.22) inset, 0 0 32px rgba(80,170,220,0.22), 0 10px 30px rgba(0,0,0,0.7)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent opacity-70"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 60% at 0% 100%, rgba(80,170,220,0.12) 0%, transparent 60%)",
          }}
        />
        <CardContent className="relative p-3 sm:p-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className="relative shrink-0 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(80,170,220,0.30) 0%, transparent 70%)",
              }}
            >
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={`${rankName} rank`}
                  className="h-14 w-14 sm:h-20 sm:w-20 object-contain drop-shadow-[0_0_18px_rgba(80,170,220,0.6)]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="flex h-14 w-14 sm:h-20 sm:w-20 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-400/10">
                  <Shield className="h-8 w-8 sm:h-10 sm:w-10 text-cyan-200" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {/* flex-wrap: on narrow widths the badge drops to its own row
                  instead of ellipsizing the primary title. */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
                    Featured · Ranked
                  </div>
                  <h3 className="text-lg font-bold tracking-tight text-foreground">
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
                    <Swords className="mr-1 h-3 w-3" />
                    Placement {RANKED_PLACEMENT_FORMAT(ranked)}
                  </Badge>
                )}
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

          <div className="mt-2 sm:mt-3 flex items-center justify-end">
            <Button
              size="sm"
              onClick={onPlay}
              disabled={disabled}
              className="bg-gradient-to-r from-cyan-500 to-sky-700 font-semibold text-foreground shadow-[0_0_18px_-4px_rgba(56,189,248,0.6)] hover:from-cyan-400 hover:to-sky-600"
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

function RANKED_PLACEMENT_FORMAT(ranked: RankedState): string {
  const total = 5;
  const done = Math.max(0, total - ranked.placementMatchesRemaining);
  return `${done}/${total}`;
}