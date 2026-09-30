/**
 * JREF2 — launch the owner-approved Zed/Ahri reference Journey as a normal
 * Ranked Bot match (admin preset `admin.zed_ahri_reference_journey`). Admin-only
 * twice over: it renders only behind `AdminRoute`, and the server refuses the
 * preset for non-admins. The shared launch behavior lives in `PresetLaunch`.
 */
import { PresetLaunch } from "./PresetLaunch";

export const REFERENCE_JOURNEY_PRESET = "admin.zed_ahri_reference_journey";

export function ReferenceJourneyLaunch() {
  return (
    <PresetLaunch
      preset={REFERENCE_JOURNEY_PRESET}
      testId="reference-journey-launch"
      buttonLabel="Play Zed/Ahri Reference Journey"
      failureMessage="The reference Journey could not be started. Try again shortly."
    >
      <strong className="text-foreground">Zed vs Ahri — E Damage (reference Journey).</strong>{" "}
      Plays the approved four-child reference Journey as an unrated Ranked Bot match
      (admin only). It never enters Daily, Study Hall or public Ranked; like a Playtest,
      the run is recorded in your own Ranked history.
    </PresetLaunch>
  );
}

export default ReferenceJourneyLaunch;
