/**
 * /quiz/daily — production Daily Score Attack surface.
 *
 * Thin wrapper over the shared implementation (core game logic lives in
 * src/pages/dev/daily-score-attack/ and is shared with the diagnostic
 * /dev/daily-score-attack route rather than duplicated; extracting it to a
 * feature directory is deferred cleanup). Production mode drops the
 * prototype banner, adds entry/results ad slots, and emits dsa_* analytics.
 */

import { useSurfaceEvent } from "@/lib/analytics";

import DailyScoreAttackPage from "./dev/daily-score-attack/DailyScoreAttackPage";

export default function QuizDailyScoreAttack() {
  // FUNNEL1B2 — canonical DSA entry, emitted from the PRODUCTION route wrapper
  // rather than from the shared implementation, so the /dev prototype stays out
  // of the funnel exactly as it stays out of the dsa_* diagnostics below it.
  //
  // The existing `dsa_entry_viewed` and its eleven siblings are untouched and
  // remain diagnostic: they describe the run, this describes the visit.
  useSurfaceEvent("dsa_opened");

  return <DailyScoreAttackPage production />;
}
