/**
 * The Ranked route's chrome row — title, mode label, and the way back.
 *
 * Moved out of `QuizRankedPage`'s local `Frame` when the frame itself became
 * the shared `ArenaShell` (ARENA1 Step 3). The GEOMETRY of the row is the
 * shell's (see `arenaHeaderRowClass`); its CONTENT is Ranked's, which is why
 * it lives here and is handed to the arena as chrome rather than being
 * something the arena knows how to write.
 */
import { Link } from "react-router-dom";
import { arenaHeaderRowClass } from "@/components/ranked-arena/ArenaShell";

export function RankedRouteHeader({ size = "default" }:
{ size?: "default" | "wide" }) {
  return (
    <header className={arenaHeaderRowClass(size)}>
      <div className="flex items-baseline gap-2.5">
        <h1 className="ranked-title text-lg font-bold leading-tight">Ranked Duel</h1>
        <span className="ranked-eyebrow hidden sm:inline">Competitive Mode</span>
      </div>
      <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
    </header>
  );
}
