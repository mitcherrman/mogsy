import SEOHead from "@/components/SEOHead";
import ProPlayArenaRun from "@/components/pro-play/arena-run/ProPlayArenaRun";
import { useProPlayArenaController } from "@/lib/pro-play/arena";
import { PRO_PLAY_QUIZ_ROUTE, PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import { RankedRouteHeader } from "./quiz-ranked/RankedRouteHeader";

/**
 * Pro Play Quiz — ten questions generated on demand from Pro Play Authority,
 * played in the canonical arena (PPQ2-E).
 *
 * The server owns the session: it picks the family mix, guarantees no repeated
 * question inside one session, freezes each question when it is served, and
 * grades against that frozen copy. This page therefore holds no question bank,
 * no answer key and no scoring logic, and no run state of its own either:
 *
 *  - `useProPlayArenaController` (PPQ2-B) owns transport and timing: start,
 *    the question-bound answer with its identical resends (PPQ0A/PPQ0C),
 *    resync on a typed conflict, restart, and the exactly-once gate;
 *  - `ProPlayArenaRun` (PPQ2-INT) draws it inside `CanonicalArena`: loading,
 *    errors with Try again, the question, the server-graded reveal (PPQ2-D),
 *    Next, and the neutral end panel with Play again / Back to Pro Play.
 *
 * REPORTING. `CanonicalArena` publishes the question on stage (and its answer,
 * only once graded) from the view's report identity. This page used to publish
 * its own snapshot; it must not any more, or two publishers would race for the
 * one report slot. A source guard holds that.
 *
 * The way back is the arena routes' own chrome (`RankedRouteHeader`, fixed
 * beside the HUD hat), so it costs the stage no height. The `h1` is for
 * document structure only: the arena header already names the position.
 */
export default function ProPlayQuiz() {
  const controller = useProPlayArenaController();
  return (
    <>
      <SEOHead
        title="Pro Play Quiz | Mogzy"
        description="Ten questions on champions, players and teams from professional League of Legends."
        path={PRO_PLAY_QUIZ_ROUTE}
      />
      <h1 className="sr-only">Pro Play Quiz</h1>
      <ProPlayArenaRun
        controller={controller}
        exitTo={PRO_PLAY_ROUTE}
        chrome={<RankedRouteHeader back={{ href: PRO_PLAY_ROUTE, label: "Back to Pro Play" }} />}
      />
    </>
  );
}
