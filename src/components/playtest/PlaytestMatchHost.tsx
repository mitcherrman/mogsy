/**
 * RB3 — the guided playtest, assembled.
 *
 * This file is the WHOLE orchestration layer, and its job is deliberately
 * small: decide whether an informational page or the match is on screen, and
 * hold the match while a page is up.
 *
 *     intro ─► create the bot match with preset "playtest"
 *           ─► QuizRankedMatch  (canonical arena, canonical renderers)
 *           ─► interstitial     (match HELD; no clock runs)
 *           ─► QuizRankedMatch  (…)
 *           ─► MatchOverFrame   (canonical result — RB2's, unreplaced)
 *           ─► outro
 *
 * WHAT IT DOES NOT DO, on purpose: render a question, choose a question, score
 * anything, hold a copy of the gameplay sequence, or wrap the arena in a
 * playtest-flavoured shell. Gameplay is `QuizRankedMatch` with two optional
 * props — a hold and a post-result callback — and nothing else about it moves.
 *
 * The match is created HERE rather than from the lobby's Ranked entry, which
 * is what keeps the playtest from hijacking anything: pressing Match with Bot
 * still starts an ordinary bot match, because it sends no preset.
 */
import { useCallback, useRef, useState } from "react";
import { QuizRankedMatch } from "@/pages/quiz-ranked/QuizRankedMatch";
import { PlaytestInterstitialView } from "./PlaytestInterstitial";
import { usePlaytestSession } from "@/lib/playtest/usePlaytestSession";
import * as api from "@/lib/ranked-public/client";

export const PLAYTEST_PRESET = "playtest";

export function PlaytestMatchHost({
  viewerUserId,
  chrome,
  /** Where the outro's action goes. The lobby, by default. */
  onExit = () => { window.location.assign("/quiz"); },
  /** Test seam: an already-live playtest match to resume into. */
  initialMatchId = null,
}: {
  viewerUserId: string;
  chrome?: React.ReactNode;
  onExit?: () => void;
  initialMatchId?: string | null;
}) {
  const [matchId, setMatchId] = useState<string | null>(initialMatchId);
  const [completedSegments, setCompletedSegments] = useState<number | null>(null);
  const [matchOver, setMatchOver] = useState(false);
  const [starting, setStarting] = useState(false);
  /**
   * The double-press guard, and it is a REF because `starting` is not enough:
   * two clicks in the same frame both read the pre-click render's state and
   * both send a join. A ref is written synchronously, so the second press sees
   * the first one's decision and creates no second match.
   */
  const startingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const session = usePlaytestSession({ matchId, completedSegments, matchOver });

  /**
   * Begin. The ONE creation call, and it is the ordinary queue join with a
   * preset named — there is no playtest match endpoint. `starting` makes a
   * double press create one match, not two.
   */
  const begin = useCallback(async () => {
    if (startingRef.current || matchId) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const status = await api.joinQueue(null, undefined,
        { matchWithBot: true, preset: PLAYTEST_PRESET });
      if (status.matchId) {
        setMatchId(status.matchId);
        session.advance();
      } else {
        setError("The playtest could not be started. Try again shortly.");
      }
    } catch (e) {
      setError(api.isFatal(e) ? (e as Error).message
        : "The playtest could not be started. Try again shortly.");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [matchId, session]);

  if (session.stage === "intro" && session.page) {
    return (
      <div data-testid="playtest-host" data-stage="intro">
        {chrome}
        <PlaytestInterstitialView page={session.page} onAdvance={() => void begin()}>
          {error && (
            <p data-testid="playtest-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </PlaytestInterstitialView>
      </div>
    );
  }

  if (session.stage === "outro" && session.page) {
    // AFTER the canonical result screen, never instead of it: the player
    // pressed Continue on their own Ranked completion to get here.
    return (
      <div data-testid="playtest-host" data-stage="outro">
        {chrome}
        <PlaytestInterstitialView page={session.page} onAdvance={onExit} />
      </div>
    );
  }

  if (!matchId) {
    return <div data-testid="playtest-host" data-stage="starting">{chrome}</div>;
  }

  return (
    <div data-testid="playtest-host" data-stage={session.stage}>
      {/* THE MATCH, always mounted while one exists.
          Kept mounted UNDER an interstitial rather than swapped out for it:
          unmounting would drop the arena's whole state — the settlement
          ledger, the timeline, the mascots — and rebuild it on the far side,
          which is the visible "the match restarted" a guided session must not
          have. Hidden with `hidden`, so it costs no layout and reads as
          absent to assistive tech while a page is up. */}
      <div hidden={session.stage === "interstitial"}>
        <QuizRankedMatch
          matchId={matchId}
          viewerUserId={viewerUserId}
          chrome={chrome}
          /* RB3.2 — this host CREATED the match a moment ago (see `begin`
             below), so it is the most certainly-fresh entry there is. It has
             no transcript to rebuild and must not ask the server for one. */
          entry="fresh"
          paused={session.paused}
          onSessionComplete={session.advance}
          onProgress={(segments, over) => {
            setCompletedSegments(segments);
            setMatchOver(over);
          }}
        />
      </div>
      {session.stage === "interstitial" && session.page && (
        <PlaytestInterstitialView page={session.page} onAdvance={session.advance} />
      )}
    </div>
  );
}
