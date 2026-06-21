import { motion } from "framer-motion";
import { BookOpen, TrendingUp, TrendingDown, Layers, HelpCircle, Sparkles, Compass } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { QuizCategoryStat } from "@/lib/quiz/api";

function EmptyStat({
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
      <Icon className="h-3.5 w-3.5 shrink-0 text-primary/80" />
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{value}</div>
      </div>
    </div>
  );
}

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
  totalCategoriesAvailable,
  totalQuestionsAvailable,
  newCategories,
  recommendedCategory,
}: {
  categories: QuizCategoryStat[];
  loading?: boolean;
  error?: string | null;
  totalCategoriesAvailable?: number;
  totalQuestionsAvailable?: number;
  newCategories?: string[];
  recommendedCategory?: string;
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
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <EmptyStat
                  icon={Layers}
                  label="Categories"
                  value={
                    typeof totalCategoriesAvailable === "number"
                      ? totalCategoriesAvailable.toLocaleString()
                      : "—"
                  }
                />
                <EmptyStat
                  icon={HelpCircle}
                  label="Questions"
                  value={
                    typeof totalQuestionsAvailable === "number"
                      ? totalQuestionsAvailable.toLocaleString()
                      : "—"
                  }
                />
              </div>
              {newCategories && newCategories.length > 0 && (
                <div className="rounded-md border border-[#c9a84c]/30 bg-[#c9a84c]/5 p-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#c9a84c]/90">
                    <Sparkles className="h-3 w-3" />
                    New Categories
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {newCategories.slice(0, 6).map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-[#c9a84c]/30 bg-background/40 px-2 py-0.5 text-[10px] font-medium text-[#f5e9c8]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {recommendedCategory && (
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
                  <Compass className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Recommended Start
                    </div>
                    <div className="truncate text-sm font-semibold">{recommendedCategory}</div>
                  </div>
                </div>
              )}
              <p className="text-center text-[11px] text-muted-foreground/80">
                Play a few questions to unlock your personal category breakdown.
              </p>
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
