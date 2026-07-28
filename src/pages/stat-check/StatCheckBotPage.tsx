/**
 * Public bot route (/quiz/stat-check/bot).
 *
 * Deliberately a thin wrapper: it mounts the SAME StatCheckPage the dev route
 * mounts, with no online controller, so the engine, category generation, item
 * system, reveal choreography, pacing and layouts are the established ones by
 * construction — there is no second copy of the game to drift.
 *
 * The only difference is the production shell (`surface="public"`), which drops
 * the dev-facing header chrome.
 */
import StatCheckPage from "../dev/stat-check/StatCheckPage";

export default function StatCheckBotPage() {
  return <StatCheckPage surface="public" />;
}
