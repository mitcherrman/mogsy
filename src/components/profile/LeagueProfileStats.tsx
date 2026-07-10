import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Swords, Trophy, FileText, Sparkles, FlaskConical, ArrowRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import QuizProfileCard from "@/components/quiz/QuizProfileCard";
import { quizApi, type QuizCategoryStat } from "@/lib/quiz/api";
import type { ProfileConfig } from "@/hooks/useProfileConfig";

const QUICK_ACTIONS = [
  { to: "/quiz", label: "Continue League Quiz", icon: BrainCircuit },
  { to: "/combat-lab", label: "Open Combat Lab", icon: Swords },
  { to: "/lol", label: "Explore League Hub", icon: Sparkles },
  { to: "/lol/tier-list", label: "View Tier List", icon: Trophy },
  { to: "/lol/docs", label: "League Docs", icon: FileText },
];

const EMPTY_STATE_CTAS = [
  { to: "/quiz", label: "Start with the League Quiz" },
  { to: "/combat-lab", label: "Try Combat Lab" },
  { to: "/quiz", label: "Learn item build paths" },
  { to: "/quiz", label: "Test champion cooldown knowledge" },
];

function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1)}%`;
}

function CategoryKnowledge({ categories }: { categories: QuizCategoryStat[] }) {
  const played = categories.filter((c) => (c.attempts ?? 0) > 0);
  if (played.length === 0) return null;
  const best = played.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
          <Target className="h-4 w-4 text-primary" />
          Game Knowledge by Category
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-[#c9a84c] font-semibold">
          Best: {best.category}
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {played
          .slice()
          .sort((a, b) => b.accuracy - a.accuracy)
          .map((c) => (
            <div
              key={c.category}
              className={`rounded-lg border px-3 py-2 ${
                c.category === best.category
                  ? "border-[#c9a84c]/40 bg-[#c9a84c]/5"
                  : "border-border/50 bg-background/40"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                {c.category}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-foreground">{fmtPct(c.accuracy)}</span>
                <span className="text-[10px] text-muted-foreground">{c.attempts} answered</span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

/**
 * League-focused stats block for the profile page: quiz rank/XP/streak,
 * category knowledge breakdown, Combat Lab card, and quick League CTAs.
 * All data comes from the existing quiz API — no schema changes.
 */
export default function LeagueProfileStats({ userId, config }: { userId: string; config: ProfileConfig }) {
  const { data: progress, isLoading: progressLoading, error: progressError } = useQuery({
    queryKey: ["quiz-progress", userId],
    queryFn: () => quizApi.getProgress(userId),
    enabled: config.showQuizProgress,
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["quiz-categories", userId],
    queryFn: () => quizApi.getCategories(userId),
    enabled: config.showCategoryKnowledge,
  });

  const { data: achievementsData } = useQuery({
    queryKey: ["quiz-achievements", userId],
    queryFn: () => quizApi.getAchievements(userId),
    enabled: config.showQuizProgress,
  });

  const achievements =
    achievementsData?.achievements ??
    [...(achievementsData?.unlocked ?? []), ...(achievementsData?.locked ?? [])];
  const categories = categoriesData?.categories ?? [];
  const hasQuizHistory = (progress?.attempts ?? 0) > 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 sm:space-y-6">
      {/* League Quiz Progress */}
      {config.showQuizProgress && (
        <div>
          <h2 className="text-sm sm:text-base font-bold text-foreground mb-2 flex items-center gap-1.5">
            <BrainCircuit className="h-4 w-4 text-primary" />
            League Quiz Progress
          </h2>
          <QuizProfileCard
            progress={progress ?? null}
            loading={progressLoading}
            error={progressError ? "Quiz progress unavailable right now." : null}
            achievements={achievements}
          />
        </div>
      )}

      {/* Empty state — new League player */}
      {config.showQuizProgress && !progressLoading && !hasQuizHistory && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-center space-y-3">
          <p className="text-sm text-foreground font-medium">
            No quiz history yet — start building your League game knowledge.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {EMPTY_STATE_CTAS.map((cta) => (
              <Button key={cta.label} asChild size="sm" variant="outline" className="text-xs">
                <Link to={cta.to}>{cta.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Category knowledge */}
      {config.showCategoryKnowledge &&
        (categoriesLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (
          <CategoryKnowledge categories={categories} />
        ))}

      {/* Combat Lab */}
      {config.showCombatLab && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-emerald-400" />
              Combat Lab
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Simulate matchups and theorycraft builds. Saved combat setups are coming soon.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/combat-lab">
              Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Quick actions */}
      {config.showQuickActions && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-bold text-foreground mb-3">What's next in Mogsy League</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
              <Button key={label} asChild variant="secondary" size="sm" className="justify-start text-xs">
                <Link to={to}>
                  <Icon className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  {label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
