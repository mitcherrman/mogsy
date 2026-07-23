// Public battle index — lifecycle-grouped cards. Server-provided effective
// status is authoritative; the client only groups and counts down for display.
import { useEffect } from "react";
import { Swords } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import ArenaScoreCard from "@/components/combat-battles/ArenaScoreCard";
import BattleCard from "@/components/combat-battles/BattleCard";
import { useBattleList } from "@/hooks/useCombatBattles";
import { MogzyMascot } from "@/components/mascot/MogzyMascot";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/combat-battles/lifecycle";
import type { BattleListItem, PublicBattleStatus } from "@/lib/combat-battles/types";

const GROUP_TITLES: Record<PublicBattleStatus, string> = {
  open: "Open for predictions",
  scheduled: "Upcoming",
  locked: "Locked — awaiting reveal",
  revealed: "Revealed results",
  void: "Voided",
};

export default function CombatBattlesIndex() {
  const { data: battles, isLoading, isError, refetch } = useBattleList();
  useEffect(() => {
    document.title = "Combat Sim Battles · Mogzy";
  }, []);

  const groups = new Map<PublicBattleStatus, BattleListItem[]>();
  for (const s of STATUS_ORDER) groups.set(s, []);
  for (const b of battles ?? []) {
    const arr = groups.get(b.status);
    if (arr) arr.push(b);
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Swords className="h-7 w-7 text-primary" aria-hidden />
            Combat Sim Battles
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Back a champion, then see how a deterministic damage comparison actually resolves.
            Predictions are free and earn Arena Score.
          </p>
        </div>
        <ArenaScoreCard className="md:w-72" />
      </header>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading battles">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-lg" />)}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <MogzyMascot pose="awkwardSmile" decorative className="h-24 w-24" />
            <p className="font-medium">We couldn't load battles right now.</p>
            <button onClick={() => refetch()} className="text-sm font-medium text-primary underline">
              Try again
            </button>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (battles?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No battles have been published yet. Check back soon.
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && (battles?.length ?? 0) > 0 && (
        <div className="space-y-8">
          {STATUS_ORDER.map((status) => {
            const items = groups.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <section key={status} aria-labelledby={`group-${status}`}>
                <h2 id={`group-${status}`} className="mb-3 text-lg font-semibold">
                  {GROUP_TITLES[status]}{" "}
                  <span className="text-sm font-normal text-muted-foreground">({items.length})</span>
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((b) => (
                    <BattleCard key={b.battle_id} battle={b} onBoundary={() => refetch()} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
