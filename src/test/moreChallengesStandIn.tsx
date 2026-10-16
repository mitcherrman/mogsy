/**
 * PGM1 test stand-in for `/quiz/more-challenges`: one button that does what a
 * More Challenges card's Play does for the run's current bonus stage — go back
 * to the Daily page carrying the continue intent. Lets the Daily's own suites
 * drive the full main result → catalog → Play → stage round trip without
 * mounting the catalog page (which `MoreChallengesPage.test` covers).
 */
import { useNavigate } from "react-router-dom";
import { DAILY_CONTINUE_STATE } from "@/lib/daily-challenge/run/entry";

export const MORE_CHALLENGES_STAND_IN = "more-challenges-stand-in";

export function MoreChallengesStandIn() {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid={MORE_CHALLENGES_STAND_IN}
      onClick={() => navigate("/quiz/daily-challenge", { state: DAILY_CONTINUE_STATE })}>
      Play
    </button>
  );
}
