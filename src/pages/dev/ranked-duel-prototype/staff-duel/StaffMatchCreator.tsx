// ---------------------------------------------------------------------------
// Staff-only match creation panel (X-Admin-Key).
//
// Security posture:
//   * the admin key lives in component state only — never stored, never in a
//     URL, never logged, never copied into the player join package, and it is
//     cleared from state as soon as a match is created;
//   * participant tokens are masked by default and revealed only on explicit
//     click;
//   * the copy control emits {matchId, playerId, participantToken} — the admin
//     key is structurally absent from it.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CLASS_OPTIONS,
  EXPERIMENT_OPTIONS,
  StaffMatchCreated,
} from "./rankedDuelTypes";
import { createStaffMatch, describeError } from "./rankedDuelClient";

interface Props {
  baseUrl: string;
  onBaseUrlChange: (value: string) => void;
}

const maskToken = (token: string): string => `${"•".repeat(12)}${token.slice(-4)}`;

export function StaffMatchCreator({ baseUrl, onBaseUrlChange }: Props) {
  const [adminKey, setAdminKey] = useState("");
  const [matchId, setMatchId] = useState("staff-demo-001");
  const [playerOneId, setPlayerOneId] = useState("player-one");
  const [playerTwoId, setPlayerTwoId] = useState("player-two");
  const [playerOneClass, setPlayerOneClass] = useState("tank");
  const [playerTwoClass, setPlayerTwoClass] = useState("mage");
  const [arm, setArm] = useState<string>(EXPERIMENT_OPTIONS[0]);

  const [created, setCreated] = useState<StaffMatchCreated | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createStaffMatch({
        baseUrl,
        adminKey,
        matchId,
        playerOneId,
        playerTwoId,
        playerOneClass,
        playerTwoClass,
        experimentArm: arm,
      });
      setCreated(result);
      setRevealed({});
      setAdminKey(""); // never keep the admin key around after use
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const copyJoinPackage = async (playerId: string, playerToken: string) => {
    if (!created) return;
    // Admin key deliberately absent.
    const pkg = JSON.stringify(
      { matchId: created.matchId, playerId, participantToken: playerToken },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(pkg);
      setCopied(playerId);
    } catch {
      setError("Clipboard unavailable — reveal the token and copy it manually.");
    }
  };

  return (
    <section
      data-testid="staff-match-creator"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">1 · Staff match creation</h2>
        <p className="text-xs text-muted-foreground">
          Requires the backend admin key. The key is held in memory only, is cleared after a
          successful creation, and is never included in a player join package.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="sd-base-url">Backend base URL</Label>
          <Input
            id="sd-base-url"
            data-testid="sd-base-url"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-admin-key">Admin key (X-Admin-Key)</Label>
          <Input
            id="sd-admin-key"
            data-testid="sd-admin-key"
            type="password"
            autoComplete="off"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-match-id">Match ID</Label>
          <Input
            id="sd-match-id"
            data-testid="sd-create-match-id"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-arm">Experiment arm</Label>
          <select
            id="sd-arm"
            data-testid="sd-arm"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={arm}
            onChange={(e) => setArm(e.target.value)}
          >
            {EXPERIMENT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-p1-id">Player One ID</Label>
          <Input
            id="sd-p1-id"
            data-testid="sd-p1-id"
            value={playerOneId}
            onChange={(e) => setPlayerOneId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-p2-id">Player Two ID</Label>
          <Input
            id="sd-p2-id"
            data-testid="sd-p2-id"
            value={playerTwoId}
            onChange={(e) => setPlayerTwoId(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-p1-class">Player One class</Label>
          <select
            id="sd-p1-class"
            data-testid="sd-p1-class"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={playerOneClass}
            onChange={(e) => setPlayerOneClass(e.target.value)}
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="sd-p2-class">Player Two class</Label>
          <select
            id="sd-p2-class"
            data-testid="sd-p2-class"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={playerTwoClass}
            onChange={(e) => setPlayerTwoClass(e.target.value)}
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button data-testid="sd-create-match" onClick={create} disabled={busy}>
        {busy ? "Creating…" : "Create staff match"}
      </Button>

      {error && (
        <p data-testid="sd-create-error" className="text-sm text-destructive break-words">
          {error}
        </p>
      )}

      {created && (
        <div data-testid="sd-created" className="space-y-3 rounded-md border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">Match {created.matchId}</Badge>
            {Object.entries(created.experiment).map(([key, value]) => (
              <Badge key={key} variant="outline" data-testid={`sd-experiment-${key}`}>
                {key}: {String(value)}
              </Badge>
            ))}
          </div>
          <ul className="text-xs text-muted-foreground">
            {created.players.map((p) => (
              <li key={p.playerId} data-testid={`sd-created-player-${p.playerId}`}>
                {p.playerId} · {p.classId} · starting HP {p.startingHp}
              </li>
            ))}
          </ul>

          {created.participants.map((participant) => {
            const isRevealed = revealed[participant.playerId] ?? false;
            return (
              <div
                key={participant.playerId}
                data-testid={`sd-participant-${participant.playerId}`}
                className="space-y-2 rounded-md bg-muted/40 p-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{participant.playerId}</span>
                  <code
                    data-testid={`sd-token-${participant.playerId}`}
                    className="max-w-full break-all rounded bg-background px-2 py-1 text-xs"
                  >
                    {isRevealed ? participant.playerToken : maskToken(participant.playerToken)}
                  </code>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`sd-reveal-${participant.playerId}`}
                    onClick={() =>
                      setRevealed((prev) => ({
                        ...prev,
                        [participant.playerId]: !isRevealed,
                      }))
                    }
                  >
                    {isRevealed ? "Hide token" : "Reveal token"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`sd-copy-${participant.playerId}`}
                    onClick={() =>
                      copyJoinPackage(participant.playerId, participant.playerToken)
                    }
                  >
                    {copied === participant.playerId ? "Copied" : "Copy player join package"}
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Send each player only their own join package. Tokens are the player&apos;s credential
            for this match — treat them like a password.
          </p>
        </div>
      )}
    </section>
  );
}
