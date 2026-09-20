/**
 * RFX1 Phase 2B3 visual implementation — THE MATCH OUTRO.
 *
 * The MAJOR closing beat: the duel's emotional full stop, played over the
 * arena it was fought in, for `MATCH_OUTRO_MS` (1200 ms) before the analytical
 * end screen mounts.
 *
 * WHY IT IS AN OVERLAY NOW. The 2B3 placeholder was the focus column's last
 * child — measured at `top: 708` on a 1440x900 desktop and `top: 728` on a
 * 390x844 phone, i.e. the lowest, darkest, least-attended strip of both
 * layouts, rendered quieter than the question above it. A closing beat cannot
 * live there. It uses the arena's overlay seam instead, the same one the
 * medium warnings use.
 *
 * WHY IT IS NOT A SMALL END SCREEN. The screen that arrives 1200 ms later
 * opens with `MATCH COMPLETE`, the result word in Cinzel, the scoreline, the
 * rating delta, the module count and both role mascots. Repeating all of that
 * for 1200 ms would be a thumbnail of the next screen.
 *
 * What the outro does instead is the one thing the end screen structurally
 * CANNOT, because it replaces the arena: it plays the bookend move, over the
 * duel chamber, from the intro's composition to the end screen's —
 *
 *     INTRO   [mascot]     VS      [mascot]
 *     OUTRO   [mascot]   24 - 15   [mascot]     <- here, over the arena
 *     END     [mascot]   24 - 15   [mascot]     <- RankedResultDuel, full screen
 *
 * — so the score lands where the VS was. Nothing else is shown: no rating
 * delta, no module count, no accuracy, no timeline. `MatchOutroView` already
 * excludes most of that deliberately.
 *
 * EVERYTHING IS HANDED IN. The result word is the backend's (`outcome` /
 * `winnerUserId`, never a comparison of two scores) and the scores are the
 * engine's committed `finalScores`. This component decides nothing.
 */
import { NeutralSigil, roleIdentityFor } from "./roleIdentity";
import { RoleMascot } from "@/components/mascot/RoleMascot";
import type { MatchOutroView } from "@/lib/ranked-core/flow/matchOutro";

/**
 * The result word, and its colour.
 *
 * Imported from the end screen's own table rather than restated, so the
 * outro and the screen it hands over to can never disagree about what
 * victory looks like.
 */
import { RESULT_STYLE, type MatchResult } from "./MatchOverFrame";

const RESULT_WORD: Record<MatchResult, string> = {
  victory: "Victory", defeat: "Defeat", draw: "Draw",
};

/** `MatchOutroView.result` speaks the flow's vocabulary; the frame speaks the
 *  presentation's. One mapping, in one place. */
export function outroResultKey(result: MatchOutroView["result"]): MatchResult {
  return result === "win" ? "victory" : result === "loss" ? "defeat" : "draw";
}

function OutroSeat({ roleId, side }: { roleId: string | null; side: "player" | "opponent" }) {
  const identity = roleIdentityFor(roleId);
  const mirrored = side === "opponent";
  return (
    <span className="ranked-match-outro__seat" data-side={side}
      data-role={identity.role ?? "none"}
      data-testid={`match-outro-seat-${side}`}>
      <span aria-hidden className="ranked-match-outro__glow"
        style={{ backgroundImage:
          `radial-gradient(60% 55% at 50% 64%, ${identity.accentSoft}, transparent 74%)` }} />
      {identity.role !== null ? (
        <RoleMascot role={identity.role} art="compact"
          facing={mirrored ? "left" : "right"} fit="cover" loading="eager"
          className="h-full w-full"
          data-testid={`match-outro-mascot-${side}`} />
      ) : (
        <span data-testid={`match-outro-neutral-${side}`}
          className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed"
          style={{ color: identity.accent, borderColor: `${identity.accent}55` }}>
          <span className="h-1/2 w-1/2 opacity-80"><NeutralSigil /></span>
        </span>
      )}
    </span>
  );
}

export function RankedMatchOutro({ outro, reducedMotion = false }: {
  outro: MatchOutroView;
  reducedMotion?: boolean;
}) {
  const resultKey = outroResultKey(outro.result);
  const hasScore = typeof outro.viewerScore === "number"
    && typeof outro.opponentScore === "number";
  /**
   * A FORFEIT SAYS SO. `VICTORY` with no explanation, on a match the opponent
   * walked out of, reads as a bug — and `terminalReason` is already carried
   * on the payload for exactly this.
   */
  const forfeit = outro.terminalReason === "forfeit";
  return (
    <section
      data-testid="ranked-match-outro"
      data-match-outro-id={outro.id}
      data-match-outro-result={outro.result}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      aria-live="polite"
      className="ranked-beat ranked-beat--major ranked-match-outro">
      <span aria-hidden className="ranked-beat__scrim" />
      <div className="ranked-beat__inner">
        <h2 className="ranked-title ranked-beat__title ranked-match-outro__heading"
          data-testid="match-outro-heading">
          Duel Complete
        </h2>
        <span aria-hidden className="ranked-beat__rule" />
        <p className={`ranked-match-outro__result ${RESULT_STYLE[resultKey].heading}`}
          data-testid="match-outro-result">
          {RESULT_WORD[resultKey]}
        </p>
        <div className="ranked-match-outro__board">
          <OutroSeat roleId={outro.viewerRole} side="player" />
          {/* WHERE THE VS WAS. The score does NOT count up: a count-up needs
              ~600 ms to read as one, which is half this beat's entire budget,
              and the end screen prints the same number 1200 ms later — so a
              count-up would be an animation the player watches twice. */}
          {hasScore ? (
            <p className="ranked-match-outro__score" data-testid="match-outro-score">
              <span data-testid="match-outro-score-viewer">{outro.viewerScore}</span>
              <span aria-hidden className="ranked-beat__dash">&mdash;</span>
              <span data-testid="match-outro-score-opponent">{outro.opponentScore}</span>
            </p>
          ) : (
            <span aria-hidden className="ranked-match-outro__score-absent" />
          )}
          <OutroSeat roleId={outro.opponentRole} side="opponent" />
        </div>
        {forfeit && (
          <p className="ranked-beat__meta" data-testid="match-outro-forfeit">
            Opponent forfeit
          </p>
        )}
      </div>
    </section>
  );
}
