/**
 * JREF2 — launch the owner-approved Zed/Ahri reference Journey as a normal
 * Ranked Bot match.
 *
 * One button, one ordinary queue join naming the admin-only session preset
 * (`admin.zed_ahri_reference_journey`), then the SAME handoff the Ranked lobby
 * makes: `/quiz/ranked` with the match id in router state. There is no Journey
 * player here and no second runtime — the server freezes a one-module Journey
 * format and the normal Ranked Bot shell plays it.
 *
 * Admin-only twice over: this renders only inside the admin area (behind
 * `AdminRoute`), and the server refuses the preset for every non-admin
 * account (`RANKED_PRESET_NOT_AUTHORIZED`).
 */
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/ranked-public/client";

export const REFERENCE_JOURNEY_PRESET = "admin.zed_ahri_reference_journey";

export function ReferenceJourneyLaunch() {
  const navigate = useNavigate();
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const status = await api.joinQueue(null, undefined, {
        matchWithBot: true,
        preset: REFERENCE_JOURNEY_PRESET,
      });
      if (status.matchId) {
        navigate("/quiz/ranked", { state: { matchId: status.matchId } });
        return;
      }
      setError("The reference Journey could not be started. Try again shortly.");
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "The reference Journey could not be started. Try again shortly.",
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [navigate]);

  return (
    <div className="space-y-2" data-testid="reference-journey-launch">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Zed vs Ahri — E Damage (reference Journey).</strong>{" "}
        Plays the approved four-child reference Journey as an unrated Ranked Bot match
        (admin only). It never enters Daily, Study Hall or public Ranked; like a Playtest,
        the run is recorded in your own Ranked history.
      </p>
      <Button
        size="sm"
        onClick={() => void launch()}
        disabled={starting}
        data-testid="reference-journey-launch-button"
      >
        {starting ? "Starting…" : "Play Zed/Ahri Reference Journey"}
      </Button>
      {error && (
        <p className="text-xs text-destructive" data-testid="reference-journey-launch-error">
          {error}
        </p>
      )}
    </div>
  );
}

export default ReferenceJourneyLaunch;
