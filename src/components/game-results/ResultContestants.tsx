/**
 * THE COMPACT IDENTITY STRIP — who played, integrated into the score.
 *
 * Ranked's end screen used to stand up two FULL combatant columns: a poster-
 * sized role mascot, a name, a level badge, a score tally and an XP meter,
 * each. They are the right object while a match is live — they are what the
 * player has been watching for twelve rounds — and the wrong one once it is
 * over, because the terminal frame already shouts the result and prints the
 * scoreline directly above them. The columns repeated the score a third time
 * and spent several hundred pixels doing it, which pushed everything a player
 * actually finished the match FOR — the discoveries, the modules, the way back
 * in — below the fold.
 *
 * So: one row. Crest, name, score, facing each other across the same centred
 * divider the scoreline uses, at a height the eye crosses rather than scrolls.
 *
 * IT IS NOT A SECOND SCOREBOARD. When the mode already renders a scoreline of
 * its own it passes `showScores={false}` and this strip carries identity only
 * — the same two numbers printed twice, ten pixels apart, is the problem it
 * was built to fix and it must not reintroduce it one component later.
 */
import { RoleCrest, roleIdentityFor } from "@/components/ranked-arena/roleIdentity";
import type { ResultContestant } from "./model";

function Side({ contestant, mirrored, showScore }: {
  contestant: ResultContestant; mirrored: boolean; showScore: boolean;
}) {
  const identity = roleIdentityFor(contestant.roleId ?? null);
  return (
    <div
      data-testid={`result-contestant${mirrored ? "-opponent" : ""}`}
      className={`flex min-w-0 flex-1 items-center gap-2.5 ${
        mirrored ? "flex-row-reverse text-right" : ""}`}
    >
      <RoleCrest identity={identity} mirrored={mirrored} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold leading-tight text-slate-100">
          {contestant.name}
        </div>
        {/* Role, class or "Bot" — whatever the mode already calls this side.
            The crest's own accent, so the two rows read as one identity. */}
        {(contestant.tag ?? identity.label) && (
          <div
            className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: identity.accent }}
          >
            {contestant.tag ?? identity.label}
            {typeof contestant.level === "number" && (
              <span className="text-muted-foreground"> · Lv {contestant.level}</span>
            )}
          </div>
        )}
      </div>
      {showScore && contestant.score !== null && (
        <span
          className={`shrink-0 text-2xl font-black tabular-nums leading-none ${
            contestant.emphasis ? "text-[#f5e6b8]" : "text-slate-300/70"}`}
        >
          {contestant.score}
        </span>
      )}
    </div>
  );
}

export function ResultContestants({
  you, opponent = null, showScores = true,
}: {
  you: ResultContestant;
  opponent?: ResultContestant | null;
  /** False when the mode prints its own scoreline directly above this row. */
  showScores?: boolean;
}) {
  return (
    <section
      aria-label="Duelists"
      data-testid="result-contestants"
      className="ranked-subpanel flex items-center gap-3 px-3 py-2.5"
    >
      <Side contestant={you} mirrored={false} showScore={showScores} />
      {opponent && (
        <>
          <span aria-hidden className="shrink-0 text-xs font-black text-muted-foreground/40">
            VS
          </span>
          <Side contestant={opponent} mirrored showScore={showScores} />
        </>
      )}
    </section>
  );
}
