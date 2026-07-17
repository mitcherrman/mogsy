import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { TutorialCombatant } from "../types";
import {
  TANK_LEVEL_TWO_OPTIONS,
  TANK_STARTER,
  TUTORIAL_OPPONENT,
} from "../fixtures";

/**
 * Tutorial-specific match-over view. Deliberately shows NO rating,
 * placement, permanent XP, rewards, or Pro language — the training match
 * mutates nothing outside this page.
 */
export function MatchOverPanel({
  player,
  opponent,
  charges,
  unlockedIds,
}: {
  player: TutorialCombatant;
  opponent: TutorialCombatant;
  charges: Record<string, number>;
  unlockedIds: string[];
}) {
  const kit = [TANK_STARTER, ...TANK_LEVEL_TWO_OPTIONS];
  return (
    <section
      aria-label="Match over"
      data-testid="match-over-panel"
      className="rounded-xl border-2 border-emerald-600/60 bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
        <h2 className="text-lg font-bold" data-testid="victory-heading">
          Victory!
        </h2>
      </div>
      <p className="text-sm">
        {TUTORIAL_OPPONENT.name} is at <strong>0 HP</strong>. You finished with{" "}
        <strong>{player.hp} HP</strong>, <strong>{player.xp} XP</strong>, and{" "}
        <strong>Level {player.level}</strong>.
      </p>
      <div className="flex flex-wrap gap-1.5" data-testid="match-over-kit">
        {kit.map((a) => (
          <Badge
            key={a.id}
            variant={unlockedIds.includes(a.id) ? "outline" : "secondary"}
            className="text-[10px] tabular-nums"
          >
            {a.name} · {charges[a.id] ?? 0} charge{(charges[a.id] ?? 0) === 1 ? "" : "s"} left
          </Badge>
        ))}
      </div>
      <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
        <li>Correct answers deal damage.</li>
        <li>Both players may deal damage in the same round.</li>
        <li>XP unlocks abilities — HP decides the winner.</li>
        <li>Ability charges are limited; armed means committed.</li>
        <li>Zero HP ends the match.</li>
      </ul>
      <p className="text-sm font-medium" data-testid="no-mutation-note">
        This training match did not affect your rating, history, or permanent
        progression.
      </p>
    </section>
  );
}
