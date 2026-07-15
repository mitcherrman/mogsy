// ---------------------------------------------------------------------------
// Participant join: match id + player id + participant token.
//
// The token is entered as a password field, kept in React state only (no
// localStorage, no sessionStorage, no URL parameter, no logging), and is not
// echoed back after joining. "Leave match" clears it from memory.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StaffDuelCredentials } from "./useStaffDuelSession";

interface Props {
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
  credentials: StaffDuelCredentials | null;
  onJoin: (credentials: StaffDuelCredentials) => void;
  onLeave: () => void;
}

export function ParticipantJoinPanel({
  baseUrl,
  onBaseUrlChange,
  credentials,
  onJoin,
  onLeave,
}: Props) {
  const [matchId, setMatchId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    if (!matchId.trim() || !playerId.trim() || !token.trim()) {
      setError("Match ID, player ID, and participant token are all required.");
      return;
    }
    setError(null);
    onJoin({
      baseUrl,
      matchId: matchId.trim(),
      playerId: playerId.trim(),
      playerToken: token.trim(),
    });
    setToken(""); // the session owns the token from here; stop holding a copy
  };

  const leave = () => {
    setToken("");
    onLeave();
  };

  if (credentials) {
    return (
      <section
        data-testid="participant-joined"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4"
      >
        <div className="text-sm">
          <p className="font-medium" data-testid="sd-joined-as">
            Playing as {credentials.playerId}
          </p>
          <p className="text-xs text-muted-foreground">
            Match {credentials.matchId} · token held in memory only (not shown, not stored)
          </p>
        </div>
        <Button variant="outline" size="sm" data-testid="sd-leave" onClick={leave}>
          Leave match &amp; clear credentials
        </Button>
      </section>
    );
  }

  return (
    <section
      data-testid="participant-join"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">2 · Join as a participant</h2>
        <p className="text-xs text-muted-foreground">
          Paste the join package values you were sent. Each player joins from their own browser.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sd-join-base">Backend base URL</Label>
          <Input
            id="sd-join-base"
            data-testid="sd-join-base"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-join-match">Match ID</Label>
          <Input
            id="sd-join-match"
            data-testid="sd-join-match"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-join-player">Player ID</Label>
          <Input
            id="sd-join-player"
            data-testid="sd-join-player"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-join-token">Participant token</Label>
          <Input
            id="sd-join-token"
            data-testid="sd-join-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <p data-testid="sd-join-error" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button data-testid="sd-join" onClick={join}>
        Join match
      </Button>
    </section>
  );
}
