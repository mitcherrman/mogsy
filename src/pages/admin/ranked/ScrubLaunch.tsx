/** SCRUB-S2 — owner playtest launcher for the admin-only `admin.scrub` preset (the Chronoscope). */
import { PresetLaunch } from "./PresetLaunch";

export const SCRUB_PRESET = "admin.scrub";

export function ScrubLaunch() {
  return (
    <PresetLaunch
      preset={SCRUB_PRESET}
      testId="scrub-launch"
      buttonLabel="Play Chronoscope"
      failureMessage="The Chronoscope could not be started. Try again shortly."
    >
      Find the first wave where a lane state becomes true, three studies, in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}

export default ScrubLaunch;
