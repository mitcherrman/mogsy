/** MG-P3 — owner playtest launcher for the admin-only `admin.match` preset. */
import { PresetLaunch } from "./PresetLaunch";

export const MATCH_GRID_PRESET = "admin.match";

export function MatchGridLaunch() {
  return (
    <PresetLaunch
      preset={MATCH_GRID_PRESET}
      testId="match-grid-launch"
      buttonLabel="Play Match Grid"
      failureMessage="Match Grid could not be started. Try again shortly."
    >
      Seat runes under their rune trees across three boards in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}

export default MatchGridLaunch;
