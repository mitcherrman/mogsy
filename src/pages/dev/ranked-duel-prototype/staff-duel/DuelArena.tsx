// ---------------------------------------------------------------------------
// The playable arena: shared public state, owner-private state, the question,
// the ability picker, the final atomic submission, the waiting state, the
// round reveal, the Level 2 gate, and the match-over state.
//
// Everything rendered here comes from a backend projection. This component
// computes no damage, HP, XP, level, charge, timer, correctness, or winner
// value, and it never marks an option as correct before the backend resolves
// the round. The only locally derived numbers are the display countdown (from
// the backend's deadline) and the HP-bar denominator (the highest HP observed
// for that player — the backend projects no max-HP field).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdaptedSettlement } from "../backend-adapter/adaptBackendSettlement";
import { NO_ABILITY, abilityDescription, abilityName } from "./abilityDisplay";
import { PublicPlayer } from "./rankedDuelTypes";
import { StaffDuelCredentials, StaffDuelSessionState } from "./useStaffDuelSession";

interface Props {
  credentials: StaffDuelCredentials;
  state: StaffDuelSessionState;
  onSubmit: (answerIndex: number, abilityId: string | null) => void;
  onChooseLevelTwo: (abilityId: string) => void;
}

const secondsUntil = (deadline: string | null, nowMs: number): number | null => {
  if (!deadline) return null;
  const ms = Date.parse(deadline) - nowMs;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 1000));
};

function PlayerCard({
  player,
  maxHp,
  isMe,
}: {
  player: PublicPlayer;
  maxHp: number;
  isMe: boolean;
}) {
  const pct = maxHp > 0 ? Math.min(100, Math.round((player.hp / maxHp) * 100)) : 0;
  return (
    <div
      data-testid={`sd-player-${player.playerId}`}
      className={`rounded-md border p-3 space-y-1 ${isMe ? "border-primary" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{player.playerId}</span>
        {isMe && <Badge variant="secondary">You</Badge>}
        <Badge variant="outline">{player.classId}</Badge>
        <Badge variant="outline">Level {player.level}</Badge>
      </div>
      <p className="text-sm">
        HP {player.hp} / {maxHp}
      </p>
      <div className="h-2 w-full rounded bg-muted" aria-hidden="true">
        <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        XP {player.totalXp} ·{" "}
        <span data-testid={`sd-submitted-${player.playerId}`}>
          {player.hasSubmitted ? "locked in" : "still choosing"}
        </span>
      </p>
    </div>
  );
}

function RoundReveal({
  settlement,
  ownerId,
}: {
  settlement: AdaptedSettlement;
  ownerId: string;
}) {
  const rows = [
    { label: `${ownerId} (you)`, p: settlement.players.p1 },
    { label: settlement.players.p2.playerId, p: settlement.players.p2 },
  ];
  return (
    <section
      data-testid="sd-reveal"
      className="rounded-lg border border-border bg-card p-4 space-y-2"
    >
      <h3 className="text-base font-semibold">Round {settlement.roundNumber} result</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map(({ label, p }) => (
          <div
            key={p.playerId}
            data-testid={`sd-reveal-${p.playerId}`}
            className="rounded-md border border-border p-2 text-sm space-y-1"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{label}</span>
              <Badge variant={p.outcome === "correct" ? "default" : "outline"}>
                {p.outcome.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Ability: {p.abilityId ? abilityName(p.abilityId) : "none"}
              {p.chargeConsumed && p.consumedAbilityId
                ? ` · charge used (${abilityName(p.consumedAbilityId)})`
                : ""}
            </p>
            <p className="text-xs">
              Damage dealt {p.finalDamageDealt} · damage taken {p.finalDamageReceived}
              {p.shieldAbsorbed > 0 ? ` · shield absorbed ${p.shieldAbsorbed}` : ""}
              {p.incomingReduction > 0 ? ` · reduced ${p.incomingReduction}` : ""}
            </p>
            <p className="text-xs">
              HP {p.hpBefore} → {p.hpAfter} · XP +{p.xpGained} (total {p.totalXpAfter}) · Level{" "}
              {p.levelBefore} → {p.levelAfter}
              {p.leveledUp ? " · LEVEL UP" : ""}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Round ended: {settlement.endReason.replace("_", " ")} · next shared timer{" "}
        {settlement.sharedNextRoundDurationSeconds}s
      </p>
    </section>
  );
}

export function DuelArena({ credentials, state, onSubmit, onChooseLevelTwo }: Props) {
  const { publicRound, privatePlayer, lastResolved, pendingProgression } = state;
  const [answerIndex, setAnswerIndex] = useState<number | null>(null);
  const [abilityChoice, setAbilityChoice] = useState<string>(NO_ABILITY);
  const [confirming, setConfirming] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeRoundNumber = publicRound?.activeRound?.roundNumber ?? null;

  // The backend advancing to a new round is the ONLY thing that clears a
  // previous round's selection.
  useEffect(() => {
    setAnswerIndex(null);
    setAbilityChoice(NO_ABILITY);
    setConfirming(false);
  }, [activeRoundNumber]);

  // Display-only countdown. The backend's deadline is authoritative; this
  // never resolves or submits anything.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const me = publicRound?.players.find((p) => p.playerId === credentials.playerId) ?? null;
  const opponent = publicRound?.players.find((p) => p.playerId !== credentials.playerId) ?? null;
  const remaining = secondsUntil(publicRound?.activeRound?.activeDeadline ?? null, nowMs);

  const privateIsCurrent =
    privatePlayer !== null &&
    activeRoundNumber !== null &&
    privatePlayer.roundNumber === activeRoundNumber;

  const iOweChoice = pendingProgression.includes(credentials.playerId);
  const opponentOwesChoice = pendingProgression.some((id) => id !== credentials.playerId);
  const hasSubmitted = (privateIsCurrent && privatePlayer.hasSubmitted) || me?.hasSubmitted === true;

  const abilityRows = useMemo(() => {
    if (!privatePlayer) return [];
    return privatePlayer.unlockedAbilityIds.map((id) => {
      const charges = privatePlayer.remainingCharges[id];
      const depleted = charges !== null && charges !== undefined && charges <= 0;
      return { id, charges: charges ?? null, depleted, locked: false };
    });
  }, [privatePlayer]);

  if (state.fatal) {
    return (
      <section
        data-testid="sd-fatal"
        className="rounded-lg border border-destructive bg-card p-4 space-y-1"
      >
        <h3 className="text-base font-semibold text-destructive">Session stopped</h3>
        <p className="text-sm">{state.fatal}</p>
        <p className="text-xs text-muted-foreground">
          Leave the match and re-join with fresh credentials to continue.
        </p>
      </section>
    );
  }

  if (state.matchOver) {
    const winner = state.winnerId;
    return (
      <div className="space-y-4">
        <section
          data-testid="sd-match-over"
          className="rounded-lg border border-border bg-card p-4 space-y-1"
        >
          <h3 className="text-lg font-semibold">Match over</h3>
          <p className="text-sm" data-testid="sd-winner">
            {winner === null
              ? "Draw — simultaneous knockout."
              : winner === credentials.playerId
                ? `Winner: ${winner} (you)`
                : `Winner: ${winner}`}
          </p>
          <p className="text-xs text-muted-foreground">
            No further submissions are accepted. Polling has stopped.
          </p>
        </section>
        {lastResolved && <RoundReveal settlement={lastResolved} ownerId={credentials.playerId} />}
      </div>
    );
  }

  if (!publicRound || !me || !opponent) {
    return (
      <section data-testid="sd-loading" className="rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">Loading match state…</p>
        {state.error && (
          <p data-testid="sd-poll-error" className="mt-2 text-sm text-destructive">
            {state.error}
          </p>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold" data-testid="sd-round">
            Round {activeRoundNumber ?? publicRound.roundNumber}
          </h3>
          <span className="text-sm text-muted-foreground" data-testid="sd-timer">
            {remaining === null
              ? "Shared timer: —"
              : `Shared timer: ${remaining}s (one countdown for both players)`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <PlayerCard player={me} maxHp={state.observedMaxHp[me.playerId] ?? me.hp} isMe />
          <PlayerCard
            player={opponent}
            maxHp={state.observedMaxHp[opponent.playerId] ?? opponent.hp}
            isMe={false}
          />
        </div>
      </section>

      {state.error && (
        <p data-testid="sd-poll-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {iOweChoice ? (
        <section
          data-testid="sd-progression"
          className="rounded-lg border border-primary bg-card p-4 space-y-3"
        >
          <h3 className="text-base font-semibold">Level 2 — choose your next ability</h3>
          <p className="text-xs text-muted-foreground">
            Play is paused until you choose. Level 3 unlocks the remaining ability automatically.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(privatePlayer?.level2Options ?? []).map((id) => (
              <Button
                key={id}
                variant="outline"
                className="h-auto justify-start whitespace-normal py-3 text-left"
                data-testid={`sd-level2-${id}`}
                disabled={state.submitting}
                onClick={() => onChooseLevelTwo(id)}
              >
                <span>
                  <span className="block font-medium">{abilityName(id)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {abilityDescription(id)}
                  </span>
                </span>
              </Button>
            ))}
          </div>
          {(privatePlayer?.level2Options ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground" data-testid="sd-level2-empty">
              Waiting for the backend to send your eligible choices…
            </p>
          )}
          {state.actionError && (
            <p data-testid="sd-action-error" className="text-sm text-destructive">
              {state.actionError}
            </p>
          )}
        </section>
      ) : opponentOwesChoice ? (
        <section
          data-testid="sd-progression-waiting"
          className="rounded-lg border border-border bg-card p-4"
        >
          <p className="text-sm">Waiting for your opponent to make a Level 2 choice…</p>
        </section>
      ) : (
        <>
          <section
            data-testid="sd-question"
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            {publicRound.question ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {publicRound.question.category && (
                    <Badge variant="outline">{publicRound.question.category}</Badge>
                  )}
                </div>
                <p className="text-base font-medium" data-testid="sd-prompt">
                  {publicRound.question.prompt}
                </p>
                <div
                  role="radiogroup"
                  aria-label="Answer options"
                  className="grid gap-2 sm:grid-cols-2"
                >
                  {publicRound.question.options.map((option, index) => (
                    <Button
                      key={option}
                      role="radio"
                      aria-checked={answerIndex === index}
                      variant={answerIndex === index ? "default" : "outline"}
                      className="h-auto justify-start whitespace-normal py-3 text-left"
                      data-testid={`sd-answer-${index}`}
                      disabled={hasSubmitted || state.submitting}
                      onClick={() => {
                        setAnswerIndex(index);
                        setConfirming(false);
                      }}
                    >
                      {option}
                    </Button>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for the round&apos;s question…</p>
            )}
          </section>

          <section
            data-testid="sd-abilities"
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <h3 className="text-base font-semibold">Your abilities</h3>
            {privatePlayer ? (
              <>
                <div role="radiogroup" aria-label="Ability" className="grid gap-2 sm:grid-cols-2">
                  <Button
                    role="radio"
                    aria-checked={abilityChoice === NO_ABILITY}
                    variant={abilityChoice === NO_ABILITY ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal py-3 text-left"
                    data-testid="sd-ability-none"
                    disabled={hasSubmitted || state.submitting}
                    onClick={() => {
                      setAbilityChoice(NO_ABILITY);
                      setConfirming(false);
                    }}
                  >
                    No ability
                  </Button>
                  {abilityRows.map((row) => (
                    <Button
                      key={row.id}
                      role="radio"
                      aria-checked={abilityChoice === row.id}
                      variant={abilityChoice === row.id ? "default" : "outline"}
                      className="h-auto justify-start whitespace-normal py-3 text-left"
                      data-testid={`sd-ability-${row.id}`}
                      disabled={hasSubmitted || state.submitting || row.depleted}
                      onClick={() => {
                        setAbilityChoice(row.id);
                        setConfirming(false);
                      }}
                    >
                      <span>
                        <span className="block font-medium">
                          {abilityName(row.id)}
                          {row.charges !== null ? ` · ${row.charges} charge(s)` : ""}
                          {row.depleted ? " · depleted" : ""}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {abilityDescription(row.id)}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
                {privatePlayer.lockedAbilityIds.length > 0 && (
                  <p className="text-xs text-muted-foreground" data-testid="sd-locked-abilities">
                    Locked:{" "}
                    {privatePlayer.lockedAbilityIds.map((id) => abilityName(id)).join(", ")}
                  </p>
                )}
                {privatePlayer.level3Unlocked && privatePlayer.level3FinalUnlockId && (
                  <p className="text-xs text-muted-foreground" data-testid="sd-level3">
                    Level 3 unlocked {abilityName(privatePlayer.level3FinalUnlockId)} automatically.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading your private state…</p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            {hasSubmitted ? (
              <p data-testid="sd-waiting" className="text-sm font-medium">
                Submitted — waiting for opponent…
              </p>
            ) : confirming ? (
              <div className="space-y-2">
                <p className="text-sm" data-testid="sd-confirm-note">
                  This submission is final for the round. Your answer and ability cannot be
                  changed afterwards.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    data-testid="sd-confirm-submit"
                    disabled={state.submitting}
                    onClick={() =>
                      onSubmit(
                        answerIndex as number,
                        abilityChoice === NO_ABILITY ? null : abilityChoice,
                      )
                    }
                  >
                    {state.submitting ? "Locking…" : "Confirm — lock it in"}
                  </Button>
                  <Button
                    variant="outline"
                    data-testid="sd-cancel-submit"
                    disabled={state.submitting}
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                data-testid="sd-lock"
                disabled={answerIndex === null || !privateIsCurrent || state.submitting}
                onClick={() => setConfirming(true)}
              >
                Lock Answer &amp; Ability
              </Button>
            )}
            {state.actionError && (
              <p data-testid="sd-action-error" className="text-sm text-destructive">
                {state.actionError}
              </p>
            )}
          </section>
        </>
      )}

      {lastResolved && <RoundReveal settlement={lastResolved} ownerId={credentials.playerId} />}
    </div>
  );
}
