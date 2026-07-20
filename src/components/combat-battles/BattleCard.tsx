import { Link } from "react-router-dom";
import { Swords } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import ChampionPortrait from "./ChampionPortrait";
import StatusBadge from "./StatusBadge";
import Countdown from "./Countdown";
import { nextBoundary } from "@/lib/combat-battles/lifecycle";
import type { BattleListItem } from "@/lib/combat-battles/types";

export default function BattleCard({
  battle,
  onBoundary,
}: {
  battle: BattleListItem;
  onBoundary?: () => void;
}) {
  const boundary = nextBoundary(battle.status, {
    open_at: battle.open_at,
    lock_at: battle.lock_at,
    reveal_at: battle.reveal_at,
  });
  return (
    <Link
      to={`/lol/combat-battles/${battle.slug}`}
      className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${battle.title}: ${battle.left_champion ?? "left"} versus ${battle.right_champion ?? "right"}`}
    >
      <Card className="h-full border-primary/30 bg-card/70 backdrop-blur-sm transition-colors hover:border-primary">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold">{battle.title}</h3>
            <StatusBadge status={battle.status} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <ChampionPortrait champion={battle.left_champion} />
            <Swords className="h-5 w-5 text-muted-foreground" aria-hidden />
            <ChampionPortrait champion={battle.right_champion} />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{battle.left_champion ?? "—"}</span>
            <span className="text-xs text-muted-foreground">vs</span>
            <span className="font-medium">{battle.right_champion ?? "—"}</span>
          </div>
          {boundary && (
            <Countdown label={boundary.label} targetIso={boundary.at} onBoundary={onBoundary} />
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
