import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit, Swords, Trophy, Target, Flame, Medal, MessageSquareQuote,
  Lock, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  quizApi,
  resolveQuizAssetUrl,
  type QuizAchievement,
  type QuizCategoryStat,
} from "@/lib/quiz/api";
import { fetchMyRecentResults, type SwipeOwnResult } from "@/lib/league-swipe/api";
import type { ProfileTheme } from "@/lib/profile-themes";

type ThemeStyles = ProfileTheme["styles"];

function fmtPct(n?: number) {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(Math.abs(n - Math.round(n)) < 0.05 ? 0 : 1)}%`;
}

function prettyEntity(slug: string) {
  return slug
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SectionCard({
  title,
  icon: Icon,
  themeStyles,
  children,
  delay = 0,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  themeStyles: ThemeStyles;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={cn("rounded-xl border bg-card p-4", themeStyles.cardBg)}
    >
      <h2 className={cn("text-sm font-bold mb-3 flex items-center gap-1.5", themeStyles.headingColor || "text-foreground")}>
        <Icon className={cn("h-3.5 w-3.5", themeStyles.iconAccent || "text-primary")} />
        {title}
      </h2>
      {children}
    </motion.div>
  );
}

function StatTile({
  label,
  value,
  sub,
  highlight,
  themeStyles,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  highlight?: "gold" | "red";
  themeStyles: ThemeStyles;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 min-w-0",
        highlight === "gold"
          ? "border-[#c9a84c]/40 bg-[#c9a84c]/5"
          : highlight === "red"
            ? "border-red-400/30 bg-red-400/5"
            : cn(themeStyles.innerBorder || "border-border/50", themeStyles.innerBg || "bg-background/40"),
      )}
    >
      <div className={cn("text-[10px] uppercase tracking-wider truncate", themeStyles.mutedColor || "text-muted-foreground")}>
        {label}
      </div>
      <div className={cn("text-sm font-bold truncate", themeStyles.textColor || "text-foreground")}>{value}</div>
      {sub && (
        <div className={cn("text-[10px] truncate", themeStyles.mutedColor || "text-muted-foreground")}>{sub}</div>
      )}
    </div>
  );
}

/**
 * Lean public League profile: competitive stat showcase, badge shelf,
 * recent takes, strengths/weaknesses, and a challenge CTA. All data comes
 * from the existing quiz API and League Swipe tables — no schema changes.
 * Swipe history is RLS-scoped to the viewer, so "recent takes" only shows
 * real data on your own profile; other profiles get a clean placeholder.
 */
export default function LeaguePublicProfile({
  userId,
  displayName,
  isOwnProfile,
  themeStyles,
}: {
  userId: string | null;
  displayName: string;
  isOwnProfile: boolean;
  themeStyles: ThemeStyles;
}) {
  const navigate = useNavigate();

  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ["quiz-progress", userId],
    queryFn: () => quizApi.getProgress(userId!),
    enabled: !!userId,
  });

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ["quiz-categories", userId],
    queryFn: () => quizApi.getCategories(userId!),
    enabled: !!userId,
  });

  const { data: achievementsData, isLoading: achievementsLoading } = useQuery({
    queryKey: ["quiz-achievements", userId],
    queryFn: () => quizApi.getAchievements(userId!),
    enabled: !!userId,
  });

  const { data: recentTakes } = useQuery({
    queryKey: ["swipe-recent-results"],
    queryFn: () => fetchMyRecentResults(5),
    enabled: isOwnProfile,
  });

  const achievements: QuizAchievement[] =
    achievementsData?.achievements ??
    [...(achievementsData?.unlocked ?? []), ...(achievementsData?.locked ?? [])];
  const unlocked = achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlocked_at || "").localeCompare(a.unlocked_at || ""));

  const categories: QuizCategoryStat[] = (categoriesData?.categories ?? []).filter(
    (c) => (c.attempts ?? 0) > 0,
  );
  const best = categories.length
    ? categories.reduce((a, b) => (b.accuracy > a.accuracy ? b : a))
    : null;
  const worst = categories.length > 1
    ? categories.reduce((a, b) => (b.accuracy < a.accuracy ? b : a))
    : null;

  const rankObj = (progress?.rank && typeof progress.rank === "object" ? progress.rank : null) as any;
  const rankName =
    progress?.rank_name ||
    rankObj?.rank_name ||
    (typeof progress?.rank === "string" ? progress.rank : null) ||
    "Unranked";
  const rankIcon =
    resolveQuizAssetUrl(progress?.rank_icon) ||
    resolveQuizAssetUrl(rankObj?.icon_path) ||
    resolveQuizAssetUrl(rankObj?.small_icon_path);
  const hasQuizHistory = (progress?.attempts ?? 0) > 0;
  const loading = progressLoading || categoriesLoading;

  return (
    <div className="space-y-5">
      {/* Competitive stat showcase */}
      <SectionCard title="League Quiz Record" icon={BrainCircuit} themeStyles={themeStyles} delay={0.08}>
        {loading ? (
          <Skeleton className="h-24 w-full rounded-lg" />
        ) : hasQuizHistory ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              {rankIcon && (
                <img
                  src={rankIcon}
                  alt={`${rankName} rank`}
                  className="h-14 w-14 sm:h-16 sm:w-16 object-contain drop-shadow-[0_0_14px_rgba(201,168,76,0.4)]"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <div className="min-w-0">
                <div className={cn("text-lg font-extrabold leading-tight", themeStyles.nameColor || "text-foreground")}>
                  {rankName}
                </div>
                <div className={cn("text-xs", themeStyles.mutedColor || "text-muted-foreground")}>
                  {(progress?.xp ?? 0).toLocaleString()} XP · {progress?.attempts ?? 0} answered
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile label="Accuracy" value={fmtPct(progress?.accuracy)} themeStyles={themeStyles} />
              <StatTile
                label="Best Streak"
                value={
                  <span className="inline-flex items-center gap-1">
                    <Flame className="h-3.5 w-3.5 text-orange-400" />
                    {progress?.best_streak ?? 0}
                  </span>
                }
                themeStyles={themeStyles}
              />
              <StatTile
                label="Best Category"
                value={best ? best.category : "—"}
                sub={best ? fmtPct(best.accuracy) : undefined}
                highlight="gold"
                themeStyles={themeStyles}
              />
              <StatTile
                label="Weakest Category"
                value={worst ? worst.category : "—"}
                sub={worst ? fmtPct(worst.accuracy) : undefined}
                highlight="red"
                themeStyles={themeStyles}
              />
            </div>
          </>
        ) : (
          <p className={cn("text-sm", themeStyles.textColor || "text-foreground/80")}>
            {isOwnProfile
              ? "No quiz record yet — play the League Quiz to start climbing the ranks."
              : `${displayName} hasn't played the League Quiz yet.`}
          </p>
        )}
      </SectionCard>

      {/* Badge shelf */}
      <SectionCard title="Badges" icon={Medal} themeStyles={themeStyles} delay={0.12}>
        {achievementsLoading ? (
          <Skeleton className="h-16 w-full rounded-lg" />
        ) : unlocked.length > 0 ? (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {unlocked.slice(0, 12).map((a) => {
                const icon = resolveQuizAssetUrl(a.icon_path);
                const label = a.title || a.name || "Badge";
                return (
                  <div
                    key={String(a.id ?? a.key ?? label)}
                    title={`${label}${a.description ? ` — ${a.description}` : ""}`}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border p-2 min-w-0",
                      "border-[#c9a84c]/30 bg-[#c9a84c]/5",
                    )}
                  >
                    {icon ? (
                      <img src={icon} alt={label} className="h-8 w-8 object-contain" />
                    ) : (
                      <Trophy className="h-8 w-8 text-[#c9a84c]" />
                    )}
                    <span className={cn("text-[9px] leading-tight text-center line-clamp-2", themeStyles.mutedColor || "text-muted-foreground")}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className={cn("text-[10px] mt-2", themeStyles.mutedColor || "text-muted-foreground")}>
              {unlocked.length}/{achievements.length} unlocked
            </p>
          </>
        ) : (
          <p className={cn("text-sm flex items-center gap-1.5", themeStyles.mutedColor || "text-muted-foreground")}>
            <Lock className="h-3.5 w-3.5" />
            No badges earned yet.
          </p>
        )}
      </SectionCard>

      {/* Recent takes */}
      <SectionCard title="Recent League Takes" icon={MessageSquareQuote} themeStyles={themeStyles} delay={0.16}>
        {isOwnProfile && (recentTakes?.length ?? 0) > 0 ? (
          <div className="space-y-2">
            {(recentTakes as SwipeOwnResult[]).map((r, i) => (
              <div
                key={`${r.created_at}-${i}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                  themeStyles.innerBorder || "border-border/50",
                  themeStyles.innerBg || "bg-background/40",
                )}
              >
                <span className={cn("text-xs min-w-0 truncate", themeStyles.textColor || "text-foreground")}>
                  Picked <span className="font-semibold">{prettyEntity(r.selected_entity)}</span> over{" "}
                  <span className="font-semibold">{prettyEntity(r.other_entity)}</span>
                </span>
                {r.is_correct !== null &&
                  (r.is_correct ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  ))}
              </div>
            ))}
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate("/league-swipe/stats")}>
              View all swipe stats
            </Button>
          </div>
        ) : (
          <p className={cn("text-sm", themeStyles.mutedColor || "text-muted-foreground")}>
            {isOwnProfile
              ? "No takes yet — play League Swipe to put your opinions on record."
              : `${displayName}'s League takes aren't public yet. Public takes are coming soon.`}
          </p>
        )}
      </SectionCard>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={cn("rounded-xl border bg-card p-4 text-center space-y-3", themeStyles.cardBg)}
      >
        <p className={cn("text-sm font-semibold", themeStyles.textColor || "text-foreground")}>
          {isOwnProfile
            ? "Keep climbing — sharpen your League knowledge."
            : `Think you know League better than ${displayName}?`}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={() => navigate("/quiz")}>
            <BrainCircuit className="h-3.5 w-3.5 mr-1" />
            {isOwnProfile ? "Play League Quiz" : "Challenge with a Quiz"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate("/league-swipe")}>
            <Swords className="h-3.5 w-3.5 mr-1" /> League Swipe
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate("/lol")}>
            <Trophy className="h-3.5 w-3.5 mr-1" /> League Hub
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
