/**
 * Owner-playtest launcher: one ordinary queue join naming an admin-only session
 * preset, then the SAME handoff the Ranked lobby makes (`/quiz/ranked` with the
 * match id in router state). No second runtime; the server refuses the preset
 * for every non-admin account (`RANKED_PRESET_NOT_AUTHORIZED`).
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/ranked-public/client";

interface PresetLaunchProps {
  preset: string;
  testId: string;
  buttonLabel: string;
  failureMessage: string;
  children: ReactNode;
}

export function PresetLaunch({ preset, testId, buttonLabel, failureMessage, children }: PresetLaunchProps) {
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
      const status = await api.joinQueue(null, undefined, { matchWithBot: true, preset });
      if (status.matchId) {
        navigate("/quiz/ranked", { state: { matchId: status.matchId } });
        return;
      }
      setError(failureMessage);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : failureMessage);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [navigate, preset, failureMessage]);

  return (
    <div className="space-y-2" data-testid={testId}>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{children}</p>
      <Button size="sm" onClick={() => void launch()} disabled={starting} data-testid={`${testId}-button`}>
        {starting ? "Starting…" : buttonLabel}
      </Button>
      {error && (
        <p className="text-xs text-destructive" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

export default PresetLaunch;
