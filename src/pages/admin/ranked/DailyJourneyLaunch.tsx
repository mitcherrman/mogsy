/**
 * JL1 — launch the certified Pantheon/Leona and Volibear/Lee Sin Journeys
 * (the Daily Standard plan of the Daily catalog's own recipes) as normal
 * Ranked Bot matches. Admin-only twice over, exactly like the reference
 * Journey: it renders only behind `AdminRoute`, and the server refuses both
 * presets for non-admins. The shared launch behavior lives in `PresetLaunch`.
 */
import { PresetLaunch } from "./PresetLaunch";

export const PANTHEON_LEONA_JOURNEY_PRESET = "admin.pantheon_leona_journey";
export const VOLIBEAR_LEESIN_JOURNEY_PRESET = "admin.volibear_leesin_journey";

export function PantheonLeonaJourneyLaunch() {
  return (
    <PresetLaunch
      preset={PANTHEON_LEONA_JOURNEY_PRESET}
      testId="pantheon-leona-journey-launch"
      buttonLabel="Play Pantheon/Leona Journey"
      failureMessage="The Pantheon/Leona Journey could not be started. Try again shortly."
    >
      <strong className="text-foreground">Pantheon vs Leona — Standard Journey.</strong>{" "}
      Plays the five-child Daily Standard Journey as an unrated Ranked Bot match
      (admin only); recorded in your own Ranked history.
    </PresetLaunch>
  );
}

export function VolibearLeeSinJourneyLaunch() {
  return (
    <PresetLaunch
      preset={VOLIBEAR_LEESIN_JOURNEY_PRESET}
      testId="volibear-leesin-journey-launch"
      buttonLabel="Play Volibear/Lee Sin Journey"
      failureMessage="The Volibear/Lee Sin Journey could not be started. Try again shortly."
    >
      <strong className="text-foreground">Volibear vs Lee Sin — Standard Journey.</strong>{" "}
      Plays the five-child Daily Standard Journey as an unrated Ranked Bot match
      (admin only); recorded in your own Ranked history.
    </PresetLaunch>
  );
}
