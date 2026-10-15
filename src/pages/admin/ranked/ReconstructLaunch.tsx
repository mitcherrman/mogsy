/** GM1-R1 — owner playtest launcher for the admin-only `admin.reconstruct` preset. */
import { PresetLaunch, type HubLaunchProps } from "./PresetLaunch";

export const RECONSTRUCT_PRESET = "admin.reconstruct";

export function ReconstructLaunch(hub: HubLaunchProps = {}) {
  return (
    <PresetLaunch
      {...hub}
      preset={RECONSTRUCT_PRESET}
      testId="reconstruct-launch"
      buttonLabel="Play Reconstruct"
      failureMessage="Reconstruct could not be started. Try again shortly."
    >
      Rebuild three legendary items from their recipe parts in an unrated Ranked Bot playtest.
    </PresetLaunch>
  );
}

export default ReconstructLaunch;
