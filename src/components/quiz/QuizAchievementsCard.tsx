import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, Lock, Sparkles, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { resolveQuizAssetUrl, type QuizAchievement } from "@/lib/quiz/api";

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return null;
  }
}

function getTitle(a: QuizAchievement): string {
  return a.title || a.name || String(a.key || a.id || "Achievement");
}

function AchievementTile({ a }: { a: QuizAchievement }) {
  const unlocked = !!a.unlocked;
  const title = getTitle(a);
  const iconUrl = resolveQuizAssetUrl(a.icon_path);
  const unlockedAt = formatDate(a.unlocked_at);
  const xpReward = Number((a as any).xp_reward ?? (a as any).xp ?? 0) || null;
  const hasProgress =
    !unlocked &&
    typeof a.progress === "number" &&
    typeof a.goal === "number" &&
    a.goal > 0;
  const progressPct = hasProgress
    ? Math.max(0, Math.min(100, Math.round(((a.progress || 0) / (a.goal || 1)) * 100)))
    : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={[
        "group relative overflow-hidden rounded-lg border p-3 transition-all",
        unlocked
          ? "border-[#c9a84c]/50 bg-gradient-to-br from-[#1a1530]/80 via-[#0a1428]/80 to-[#0a0a1a]/80 shadow-[0_0_18px_-6px_rgba(201,168,76,0.55)] hover:shadow-[0_0_24px_-4px_rgba(201,168,76,0.7)]"
          : "border-border/40 bg-background/30 opacity-70 grayscale hover:opacity-90",
      ].join(" ")}
    >
      {unlocked && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c] to-transparent opacity-80" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={[
            "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border",
            unlocked
              ? "border-[#c9a84c]/60 bg-[#1a1530]/60 shadow-[inset_0_0_10px_rgba(201,168,76,0.25)]"
              : "border-border/40 bg-background/40",
          ].join(" ")}
        >
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              className="h-8 w-8 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : unlocked ? (
            <Trophy className="h-5 w-5 text-[#c9a84c]" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={[
                "truncate text-sm font-semibold",
                unlocked ? "text-[#f5e9c8]" : "text-foreground/80",
              ].join(" ")}
            >
              {title}
            </span>
            {unlocked ? (
              <Trophy className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]" />
            ) : (
              <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </div>
          {a.description && (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {a.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {unlocked ? (
              <Badge
                variant="outline"
                className="border-[#c9a84c]/40 bg-[#c9a84c]/10 text-[10px] font-medium text-[#f5e9c8]"
              >
                Unlocked
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                Locked
              </Badge>
            )}
            {unlockedAt && (
              <span className="text-[10px] text-muted-foreground">{unlockedAt}</span>
            )}
            {hasProgress && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {a.progress}/{a.goal} · {progressPct}%
              </span>
            )}
            {xpReward && (
              <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0 text-[10px] font-semibold text-emerald-300">
                <Zap className="h-2.5 w-2.5" />+{xpReward} XP
              </span>
            )}
          </div>
          {hasProgress && (
            <Progress value={progressPct} className="mt-1.5 h-1" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

export interface QuizAchievementsCardProps {
  achievements: QuizAchievement[];
  loading?: boolean;
  error?: string | null;
  /** Diagnostics variant: more compact, no header chrome. */
  compact?: boolean;
  /** When true, hide the in-card header (title shown elsewhere, e.g. collapsible trigger). */
  hideHeader?: boolean;
}

export default function QuizAchievementsCard({
  achievements,
  loading,
  error,
  compact,
  hideHeader,
}: QuizAchievementsCardProps) {
  const { unlocked, locked } = useMemo(() => {
    const u: QuizAchievement[] = [];
    const l: QuizAchievement[] = [];
    for (const a of achievements || []) {
      if (a?.unlocked) u.push(a);
      else l.push(a);
    }
    return { unlocked: u, locked: l };
  }, [achievements]);

  const total = (achievements || []).length;
  const unlockedCount = unlocked.length;

  const body = (
    <>
      {loading ? (
        <div className={compact ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
          {Array.from({ length: compact ? 4 : 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-xs text-muted-foreground">
          {error}
        </div>
      ) : total === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background/30 p-4 text-center text-xs text-muted-foreground">
          No achievements available yet. Answer questions to start unlocking them.
        </div>
      ) : (
        <div className="space-y-4">
          {unlocked.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#c9a84c]">
                <Sparkles className="h-3 w-3" />
                Unlocked · {unlocked.length}
              </div>
              <div className={compact ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
                {unlocked.map((a, i) => (
                  <AchievementTile key={String(a.id ?? a.key ?? `u-${i}`)} a={a} />
                ))}
              </div>
            </div>
          )}
          {locked.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Lock className="h-3 w-3" />
                Locked · {locked.length}
              </div>
              <div className={compact ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"}>
                {locked.map((a, i) => (
                  <AchievementTile key={String(a.id ?? a.key ?? `l-${i}`)} a={a} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (compact) return <div>{body}</div>;

  if (hideHeader) {
    return (
      <Card className="border-[#c9a84c]/25 bg-[#0a1428]/70 backdrop-blur-sm">
        <CardContent className="pt-4">{body}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-[#c9a84c]/25 bg-[#0a1428]/70 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#c9a84c]">
          <Trophy className="h-4 w-4" />
          Achievements
        </CardTitle>
        {total > 0 && !loading && (
          <span className="text-[11px] text-muted-foreground">
            {unlockedCount} / {total}
          </span>
        )}
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}