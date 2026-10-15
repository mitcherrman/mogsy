/**
 * Owner-playtest launcher: one ordinary queue join naming an admin-only session
 * preset, then the SAME handoff the Ranked lobby makes (`/quiz/ranked` with the
 * match id in router state). No second runtime; the server refuses the preset
 * for every non-admin account (`RANKED_PRESET_NOT_AUTHORIZED`).
 *
 * UGMP — given a `title`, it renders as a Playtests hub card (the presentation
 * every hub mode shares); without one it keeps its compact form (the Journeys
 * panel). Every launch also carries the `admin_playtests` origin hint, so the
 * result screen offers "Back to Playtests" (see `matchOrigin.ts`).
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import * as api from "@/lib/ranked-public/client";
import { ADMIN_PLAYTESTS_ORIGIN_ID } from "@/pages/quiz-ranked/matchOrigin";
import { PlaytestModeCard } from "./PlaytestModeCard";

/** What a hub host may add to a launcher: the card title and the backend's availability. */
export interface HubLaunchProps {
  /** Render as a Playtests hub card under this mode name. */
  title?: string;
  /** The backend reported this preset cannot be served, and why. Disables Play. */
  unavailableReason?: string | null;
}

interface PresetLaunchProps extends HubLaunchProps {
  preset: string;
  testId: string;
  buttonLabel: string;
  failureMessage: string;
  children: ReactNode;
}

export function PresetLaunch({
  preset, testId, buttonLabel, failureMessage, children, title, unavailableReason,
}: PresetLaunchProps) {
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
        navigate("/quiz/ranked", { state: { matchId: status.matchId, origin: ADMIN_PLAYTESTS_ORIGIN_ID } });
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

  if (title) {
    return (
      <PlaytestModeCard
        testId={testId}
        title={title}
        tier="ranked-bot"
        description={children}
        play={{ kind: "button", label: buttonLabel, onClick: () => void launch(), busy: starting, testId: `${testId}-button` }}
        disabledReason={unavailableReason}
        error={error}
      />
    );
  }

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
