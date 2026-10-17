/**
 * MC-UX2 — the hub's top utility row: Random, and the player's own stats.
 *
 * Random draws one of the modes playable RIGHT NOW (the page decides which and
 * launches it through the ordinary Play path). The stats are the server's
 * summary of this player's own games; when there is no record yet they say so
 * instead of showing zeros dressed up as achievements.
 */
import { BarChart3, CalendarDays, Dice5, Heart, History } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PUBLIC_MODE_TITLES } from "@/lib/public-modes/contracts";
import { relativeDay, type PlayerSummary } from "@/lib/public-modes/summary";

export type SummaryState =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; summary: PlayerSummary | null };

export function RandomButton({ count, busy, onRandom }: { count: number; busy: boolean; onRandom: () => void }) {
  const none = count === 0;
  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <button type="button" className="mc-random" onClick={onRandom} disabled={none || busy}
        data-testid="more-challenges-random"
        aria-describedby="mc-random-note">
        <Dice5 className="h-5 w-5" aria-hidden="true" />
        Random game
      </button>
      <span id="mc-random-note" className="text-center text-[11.5px] text-[color:var(--ranked-muted)] sm:text-right"
        data-testid="more-challenges-random-note">
        {none ? "No game is playable right now." : "Picks a game you can play now"}
      </span>
    </div>
  );
}

function Tile({ icon, label, value, sub, testId }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; testId: string;
}) {
  return (
    <div className="mc-stat" data-testid={testId}>
      <span className="mc-stat-label">{icon}{label}</span>
      <span className="mc-stat-value">{value}</span>
      {sub ? <span className="mc-stat-sub">{sub}</span> : null}
    </div>
  );
}

export function PlayerStats({ summary, now = new Date() }: { summary: SummaryState; now?: Date }) {
  if (summary.state === "loading") {
    return (
      <div className="mc-stats" data-testid="more-challenges-stats" data-state="loading" aria-busy="true">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[66px] rounded-lg" />)}
      </div>
    );
  }
  if (summary.state === "error") {
    return (
      <p className="mc-stats-empty" data-testid="more-challenges-stats" data-state="error">
        <BarChart3 className="h-4 w-4 flex-none" aria-hidden="true" />
        Your stats couldn't be loaded right now. Your games still count.
      </p>
    );
  }
  const s = summary.summary;
  if (!s || s.gamesPlayed === 0) {
    return (
      <p className="mc-stats-empty" data-testid="more-challenges-stats" data-state="empty">
        <BarChart3 className="h-4 w-4 flex-none" aria-hidden="true" />
        Your record starts with your first game. Every bonus game you finish shows up here.
      </p>
    );
  }
  const fav = s.favoriteModeId ? s.modes[s.favoriteModeId] : undefined;
  return (
    <div className="mc-stats" data-testid="more-challenges-stats" data-state="ready" aria-label="Your bonus game stats">
      <Tile testId="mc-stat-played" icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />}
        label="Games played" value={s.gamesPlayed} />
      <Tile testId="mc-stat-favorite" icon={<Heart className="h-3.5 w-3.5" aria-hidden="true" />}
        label="Most played" value={s.favoriteModeId ? PUBLIC_MODE_TITLES[s.favoriteModeId] : "—"}
        sub={fav ? `${fav.played} ${fav.played === 1 ? "game" : "games"}` : undefined} />
      <Tile testId="mc-stat-week" icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />}
        label="This week" value={`${s.gamesThisWeek} ${s.gamesThisWeek === 1 ? "game" : "games"}`}
        sub={s.streakDays > 1 ? `${s.streakDays}-day streak`
          : s.activeDaysThisWeek ? `${s.activeDaysThisWeek} active ${s.activeDaysThisWeek === 1 ? "day" : "days"}` : undefined} />
      <Tile testId="mc-stat-last" icon={<History className="h-3.5 w-3.5" aria-hidden="true" />}
        label="Last played" value={s.lastPlayed ? PUBLIC_MODE_TITLES[s.lastPlayed.modeId] : "—"}
        sub={s.lastPlayed ? relativeDay(s.lastPlayed.at, now) ?? undefined : undefined} />
    </div>
  );
}
