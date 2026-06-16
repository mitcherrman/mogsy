import { motion } from "framer-motion";
import { BookOpen, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuizCategoryStat } from "@/lib/quiz/api";

function CategoryRow({
  stat,
  progressColor = "bg-primary",
}: {
  stat: QuizCategoryStat;
  progressColor?: string;
}) {
  const accuracy = Math.max(0, Math.min(100, Number(stat.accuracy ?? 0)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{stat.category}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
          {stat.attempts ?? 0} attempt{(stat.attempts ?? 0) !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Progress value={accuracy} className="h-1.5 flex-1" />
        <span className="text-[11px] tabular-nums font-medium w-10 text-right shrink-0">
          {accuracy.toFixed(accuracy % 1 === 0 ? 0 : 1)}%
        </span>
      </div>
    </div>
  );
}

export default function QuizKnowledgeCard({
  categories,
  loading,
  error,
}: {
  categories: QuizCategoryStat[];
  loading?: boolean;
  error?: string | null;
}) {
  if (loading) {
    return <Skeleton className="h-48 w-full rounded-xl" />;
  }

  const hasData = categories.length > 0;

  const topCategories = [...categories]
    .sort((a, b) => (b.attempts ?? 0) - (a.attempts ?? 0))
    .slice(0, 5);

  const weakestCategories = [...categories]
    .filter((c) => (c.attempts ?? 0) > 0)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 }}
    >
      <Card className="bg-gradient-to-br from-card/90 to-card/60 backdrop-blur-sm border-primary/20">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
            <BookOpen className="h-4 w-4" />
            Knowledge Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-0">
          {error && (
            <p className="text-[11px] text-muted-foreground/70 italic">{error}</p>
          )}

          {!hasData && !error && (
            <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-sm text-muted-foreground">
              Play some questions to see your category breakdown.
            </div>
          )}

          {hasData && (
            <>
              {/* Top Categories */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Top Categories
                </div>
                <div className="space-y-3">
                  {topCategories.map((stat) => (
                    <CategoryRow key={stat.category} stat={stat} />
                  ))}
                </div>
              </div>

              {/* Weakest Categories */}
              {weakestCategories.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                    <TrendingDown className="h-3 w-3" />
                    Weakest Categories
                  </div>
                  <div className="space-y-3">
                    {weakestCategories.map((stat) => (
                      <CategoryRow key={stat.category} stat={stat} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
