/**
 * JEXT — launch the internal long/depth Ashe vs Jinx playtest Journey (admin
 * preset `admin.ashe_jinx_extended_journey`) as a normal Ranked Bot match.
 * Admin-only twice over, like the other Journey launches: it renders only behind
 * `AdminRoute`, and the server refuses the preset for non-admins. The shared
 * launch behavior lives in `PresetLaunch`. The child count comes from the
 * server's payload; nothing here assumes it.
 */
import { PresetLaunch } from "./PresetLaunch";

export const ASHE_JINX_EXTENDED_JOURNEY_PRESET = "admin.ashe_jinx_extended_journey";

export function AsheJinxExtendedJourneyLaunch() {
  return (
    <PresetLaunch
      preset={ASHE_JINX_EXTENDED_JOURNEY_PRESET}
      testId="ashe-jinx-extended-journey-launch"
      buttonLabel="Play Ashe vs Jinx — Extended Journey"
      failureMessage="The Extended Journey could not be started. Try again shortly."
    >
      <strong className="text-foreground">Ashe vs Jinx — Extended Journey.</strong>{" "}
      Internal long/depth playtest: eleven children (not the five-child Journeys above),
      with a Pickaxe and a level-6 transition, as an unrated Ranked Bot match (admin
      only). It never enters Daily, Library or public Ranked; recorded in your own
      Ranked history.
    </PresetLaunch>
  );
}

export default AsheJinxExtendedJourneyLaunch;
