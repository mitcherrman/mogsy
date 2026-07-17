/**
 * /quiz/daily — production Daily Score Attack surface.
 *
 * Thin wrapper over the shared implementation (core game logic lives in
 * src/pages/dev/daily-score-attack/ and is shared with the diagnostic
 * /dev/daily-score-attack route rather than duplicated; extracting it to a
 * feature directory is deferred cleanup). Production mode drops the
 * prototype banner, adds entry/results ad slots, and emits dsa_* analytics.
 */

import DailyScoreAttackPage from "./dev/daily-score-attack/DailyScoreAttackPage";

export default function QuizDailyScoreAttack() {
  return <DailyScoreAttackPage production />;
}
