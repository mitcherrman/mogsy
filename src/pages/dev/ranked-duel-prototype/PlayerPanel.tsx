import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles, Crosshair, Lock, Hourglass, CheckCircle2 } from "lucide-react";
import { MOCK_PLAYERS, PlayerId, getDuelClass, LEVEL_THRESHOLDS } from "./fixtures";
import { MatchPlayerState, RoundPlayerState, isSubmissionComplete } from "./duelMachine";

const CLASS_ICON = {
  tank: Shield,
  mage: Sparkles,
  marksman: Crosshair,
} as const;

/**
 * XP progress toward the NEXT level, as a 0–100 percent. Returns 100 when the
 * player is at the top fixture threshold (ultimate tier stays "future").
 */
const xpProgress = (xp: number, level: number): number => {
  const cur = LEVEL_THRESHOLDS[level - 1] ?? 0;
  const next = LEVEL_THRESHOLDS[level];
  if (next === undefined) return 100;
  return Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100));
};

/**
 * Player-facing duel panel. Deliberately shows only NEUTRAL round status —
 * never the actual answer choice or ability choice — until reveal.
 */
export function PlayerPanel({
  player,
  match,
  round,
  side,
}: {
  player: PlayerId;
  match: MatchPlayerState;
  round: RoundPlayerState;
  side: "left" | "right";
}) {
  const cls = getDuelClass(match.classId);
  const Icon = CLASS_ICON[match.classId];
  const identity = MOCK_PLAYERS[player];
  const hpPct = Math.round((match.hp / match.maxHp) * 100);
  const answered = round.answerIndex !== null;
  const complete = isSubmissionComplete(round);

  return (
    <section
      aria-label={`${identity.name} panel`}
      className={`rounded-xl border-2 bg-card p-4 space-y-3 ${
        side === "left" ? "border-primary/50" : "border-destructive/50"
      }`}
    >
      <header className="flex items-center gap-2 min-w-0">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            side === "left" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="font-bold leading-tight truncate">{identity.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {cls.name} · {identity.tag}
          </div>
        </div>
        <Badge variant="outline" className="ml-auto shrink-0 tabular-nums">
          Lv {match.level}
        </Badge>
      </header>

      {/* HP is the score: big, high-contrast bar. */}
      <div>
        <div className="flex justify-between text-xs font-semibold mb-1">
          <span>HP</span>
          <span className="tabular-nums">
            {match.hp} / {match.maxHp}
          </span>
        </div>
        <div
          role="meter"
          aria-label={`${identity.name} HP`}
          aria-valuenow={match.hp}
          aria-valuemin={0}
          aria-valuemax={match.maxHp}
          className="h-4 rounded-full bg-muted overflow-hidden border border-border"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${
              hpPct > 50 ? "bg-emerald-500" : hpPct > 25 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${hpPct}%` }}
          />
        </div>
      </div>

      {/* XP reads as quiet progression, not a second score. */}
      <div>
        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
          <span>XP</span>
          <span className="tabular-nums">{match.xp} xp</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-400/70 transition-all duration-700 motion-reduce:transition-none"
            style={{ width: `${xpProgress(match.xp, match.level)}%` }}
          />
        </div>
      </div>

      {/* Neutral hidden-information statuses only. */}
      <div className="flex flex-wrap gap-1.5" data-testid={`${player}-status`}>
        {complete ? (
          <Badge className="gap-1 bg-emerald-600 text-white hover:bg-emerald-600">
            <CheckCircle2 className="h-3 w-3" aria-hidden /> Submission complete
          </Badge>
        ) : (
          <>
            <Badge variant={answered ? "default" : "secondary"} className="gap-1">
              {answered ? <Lock className="h-3 w-3" aria-hidden /> : <Hourglass className="h-3 w-3" aria-hidden />}
              {answered ? "Answer locked" : "Thinking…"}
            </Badge>
            <Badge variant={round.abilityLocked ? "default" : "secondary"} className="gap-1">
              {round.abilityLocked ? <Lock className="h-3 w-3" aria-hidden /> : null}
              {round.abilityLocked ? "Ability locked" : "Choosing ability"}
            </Badge>
          </>
        )}
      </div>
    </section>
  );
}
