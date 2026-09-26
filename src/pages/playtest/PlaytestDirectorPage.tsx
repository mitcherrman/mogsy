/**
 * PLAY1 — `/admin/playtest-director`, inside the admin shell (AdminRoute).
 * Linked from Admin › Leaguecraft › Ranked › Playtests, which stays the home.
 */
import { PlaytestDirectorConsole } from "@/features/playtest-director/director/PlaytestDirectorConsole";

export default function PlaytestDirectorPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 p-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Leaguecraft · Ranked · Playtests</p>
        <h1 className="text-xl font-semibold">Playtest Director</h1>
      </div>
      <PlaytestDirectorConsole />
    </div>
  );
}
