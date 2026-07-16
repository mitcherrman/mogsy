import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BrainCircuit, Trophy, FileText, Sparkles, FlaskConical, ArrowRight, Target, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import QuizProfileCard from "@/components/quiz/QuizProfileCard";
import { quizApi, type QuizCategoryStat, type QuizHistoryEntry } from "@/lib/quiz/api";
import { ensureBackendAuthToken } from "@/lib/backend-auth";
import { deriveProfileStats } from "@/lib/profile/view-model";
import type { ProfileConfig } from "@/hooks/useProfileConfig";

/** Lower-priority destinations, one compact row — no duplicates of the primary CTA. */
const RESOURCE_LINKS = [
  { to: "/lol", label: "League Hub", icon: Sparkles },
  { to: "/lol/tier-list", label: "Tier List", icon: Trophy },
  { to: "/lol/docs", label: "League Docs", icon: FileText },
  { to: "/lol/history", label: "Quiz History", icon: History },
];

function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1)}%`;
}

function formatHistoryDate(iso?: string): string {
  if (!iso) return "";
  // Backend timestamps are UTC without a zone suffix.
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function historyModeLabel(entry: QuizHistoryEntry): string {
  if (entry.mode === "daily") return "Daily Challenge";
  return entry.category ? `Quiz · ${entry.category}` : "Quiz";
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
 * state-aware activity/history panel, category knowledge breakdown, a compact
 * Combat Lab card, and one low-priority resources row. All data comes from
 * the existing quiz API — no schema changes.
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

  // Stored session history (JWT-scoped to the current session). Failures fall
  // back to `null`, which the view model treats as "no detailed history" —
  // never as "no activity".
  const { data: historyEntries } = useQuery({
    queryKey: ["quiz-history", userId],
    queryFn: async (): Promise<QuizHistoryEntry[] | null> => {
      try {
        const token = await ensureBackendAuthToken();
        if (!token) return null;
        const res = await quizApi.getHistory();
        return res?.results ?? null;
      } catch {
        return null;
      }
    },
    enabled: config.showQuizProgress,
  });

  const achievements =
    achievementsData?.achievements ??
    [...(achievementsData?.unlocked ?? []), ...(achievementsData?.locked ?? [])];
  const categories = categoriesData?.categories ?? [];
  const stats = deriveProfileStats(progress ?? null, categories, historyEntries ?? null);

  const primaryQuizLabel = stats.hasAnyQuizActivity ? "Continue League Quiz" : "Start League Quiz";

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 sm:space-y-4">
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

      {/* Activity / history — state-aware, one primary action */}
      {config.showQuizProgress && !progressLoading && (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-3">
          {stats.activityState === "none" && (
            <>
              <p className="text-sm text-foreground font-medium text-center">
                No quiz activity yet — answer your first question to start ranking up.
              </p>
              <div className="flex flex-wrap justify-center items-center gap-2">
                <Button asChild size="sm" variant="hero">
                  <Link to="/quiz">
                    Start League Quiz <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/combat-lab">Try Combat Lab</Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="text-xs">
                  <Link to="/lol">Explore League Hub</Link>
                </Button>
              </div>
            </>
          )}

          {stats.activityState === "aggregate-only" && (
            <>
              <p className="text-sm text-foreground text-center">
                Your overall quiz progress is saved, but detailed history is not
                available for earlier results.
              </p>
              <div className="flex justify-center">
                <Button asChild size="sm" variant="hero">
                  <Link to="/quiz">
                    {primaryQuizLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}

          {stats.activityState === "detailed" && (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <History className="h-4 w-4 text-primary" />
                  Recent Activity
                </h3>
                <Link to="/lol/history" className="text-xs font-semibold text-primary hover:underline">
                  View all
                </Link>
              </div>
              <ul className="space-y-1.5">
                {stats.recentHistory.slice(0, 3).map((h) => (
                  <li
                    key={h.session_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate">{historyModeLabel(h)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatHistoryDate(h.completed_at || h.started_at || h.date)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-bold text-foreground tabular-nums">
                        {h.score}/{h.total_questions}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">{fmtPct(h.accuracy)}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-center">
                <Button asChild size="sm" variant="hero">
                  <Link to="/quiz">
                    {primaryQuizLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Category knowledge */}
      {config.showCategoryKnowledge &&
        (categoriesLoading ? (
          <Skeleton className="h-24 w-full rounded-2xl" />
        ) : (
          <CategoryKnowledge categories={categories} />
        ))}

      {/* Combat Lab — single compact card, value-focused copy */}
      {config.showCombatLab && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-emerald-400" />
              Combat Lab
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Test champion builds and matchup scenarios.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to="/combat-lab">
              Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* Compact resources row */}
      {config.showQuickActions && (
        <div className="rounded-2xl border border-border bg-card px-3 py-2.5 sm:px-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Explore
          </span>
          {RESOURCE_LINKS.map(({ to, label, icon: Icon }) => (
            <Link
              key={label}
              to={to}
              className="inline-flex items-center gap-1 py-1 text-xs font-medium text-foreground/80 hover:text-primary transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-primary/70" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}
