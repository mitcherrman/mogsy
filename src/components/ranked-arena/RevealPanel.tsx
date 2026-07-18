/**
 * Canonical resolution reveal (F1 Phase C2). Stateless presentation of one
 * authoritative resolved round (ResolvedRoundView = the existing
 * AdaptedSettlement) — every number shown is a backend pass-through; nothing
 * is recomputed, no rules layer exists here. Identity flows by player id via
 * the settlement's own p1/p2 association; display names, revealed answer
 * labels, and extra notices are controller-supplied so the opponent can be a
 * human, a scripted golem, or a future boss without branches.
 *
 * This component renders nothing without a settlement: pre-reveal state has
 * no correctness or opponent content anywhere in its props.
 */
import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ResolvedCombatantView,
  ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";

type Slot = "p1" | "p2";

export interface RevealPanelProps {
  settlement: ResolvedRoundView;
  /** Which settlement slot is the viewer ("your" side of the panel). */
  viewerSlot: Slot;
  /** Display names keyed by backend player id; ids shown when absent. */
  namesByPlayerId?: Record<string, string>;
  /** Revealed answer labels keyed by backend player id (both sides), when
   * the controller has them. Optional: the settlement itself carries
   * outcomes, not answer text. */
  answersByPlayerId?: Record<string, string | null>;
  /** Controller-supplied explanatory/modifier notices, rendered verbatim. */
  notices?: string[];
  /** Optional slot for mode-owned extras (combat log, coach copy, …). */
  children?: ReactNode;
}

const OUTCOME_COPY: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timed_out: "Timed out",
};

function ResolvedCombatantCard({
  player,
  title,
  answerLabel,
}: {
  player: ResolvedCombatantView;
  title: string;
  answerLabel: string | null | undefined;
}) {
  const leveled = player.leveledUp;
  return (
    <section
      aria-label={`${title} round result`}
      data-testid={`reveal-${player.playerId}`}
      className="rounded-xl border-2 border-border bg-card p-4 space-y-2"
    >
      <header className="flex items-center gap-2">
        <span className="font-bold truncate">{title}</span>
        <Badge
          variant={player.outcome === "correct" ? "default" : "secondary"}
          data-testid={`outcome-${player.playerId}`}
          className="ml-auto shrink-0"
        >
          {OUTCOME_COPY[player.outcome]}
        </Badge>
      </header>

      <dl className="space-y-1 text-xs">
        {answerLabel !== undefined && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Answer</dt>
            <dd className="font-medium text-right" data-testid={`answer-${player.playerId}`}>
              {answerLabel ?? "No answer"}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Ability</dt>
          <dd className="font-medium text-right" data-testid={`ability-${player.playerId}`}>
            {player.abilityName}
            {player.abilityId !== null && !player.chargeConsumed && (
              <span className="text-muted-foreground"> · no charge consumed</span>
            )}
            {player.chargeConsumed && (
              <span className="text-muted-foreground"> · charge consumed</span>
            )}
          </dd>
        </div>
        {player.answeredFirst && (
          <div className="text-muted-foreground" data-testid={`first-${player.playerId}`}>
            Answered first
          </div>
        )}
      </dl>

      {/* Authoritative damage audit, shown as-is. */}
      <dl className="space-y-0.5 text-xs tabular-nums" data-testid={`damage-${player.playerId}`}>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Damage dealt</dt>
          <dd className="font-medium">
            {player.finalDamageDealt}
            {player.outgoingBonus > 0 && (
              <span className="text-muted-foreground"> ({player.baseDamageDealt} +{player.outgoingBonus})</span>
            )}
          </dd>
        </div>
        {(player.shieldAbsorbed > 0 || player.incomingReduction > 0) && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Mitigation</dt>
            <dd className="font-medium" data-testid={`mitigation-${player.playerId}`}>
              {player.shieldAbsorbed > 0 && `shield ${player.shieldAbsorbed}`}
              {player.shieldAbsorbed > 0 && player.incomingReduction > 0 && " · "}
              {player.incomingReduction > 0 && `reduced ${player.incomingReduction}`}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">HP</dt>
          <dd className="font-medium" data-testid={`reveal-hp-${player.playerId}`}>
            {player.hpBefore} → {player.hpAfter}
            {player.finalDamageReceived > 0 && (
              <span className="text-muted-foreground"> (−{player.finalDamageReceived})</span>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">XP</dt>
          <dd className="font-medium" data-testid={`reveal-xp-${player.playerId}`}>
            +{player.xpGained} → {player.totalXpAfter}
          </dd>
        </div>
        {leveled && (
          <div className="flex justify-between gap-3" data-testid={`level-${player.playerId}`}>
            <dt className="text-muted-foreground">Level</dt>
            <dd className="font-medium">
              {player.levelBefore} → {player.levelAfter}{" "}
              <Badge variant="outline" className="text-[10px]">
                Level up
              </Badge>
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

export function RevealPanel({
  settlement,
  viewerSlot,
  namesByPlayerId,
  answersByPlayerId,
  notices,
  children,
}: RevealPanelProps) {
  const opponentSlot: Slot = viewerSlot === "p1" ? "p2" : "p1";
  const viewer = settlement.players[viewerSlot];
  const opponent = settlement.players[opponentSlot];
  const nameOf = (p: ResolvedCombatantView) => namesByPlayerId?.[p.playerId] ?? p.playerId;
  const answerOf = (p: ResolvedCombatantView) =>
    answersByPlayerId ? (answersByPlayerId[p.playerId] ?? null) : undefined;

  const winnerName =
    settlement.winner === null ? null : nameOf(settlement.players[settlement.winner]);

  return (
    <section aria-label="Round result" data-testid="reveal-panel" className="space-y-3">
      <div
        role="status"
        className="text-sm font-semibold"
        data-testid="reveal-headline"
      >
        Round {settlement.roundNumber} resolved
        {settlement.endReason === "deadline_expired" && " — time expired"}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ResolvedCombatantCard player={viewer} title={nameOf(viewer)} answerLabel={answerOf(viewer)} />
        <ResolvedCombatantCard
          player={opponent}
          title={nameOf(opponent)}
          answerLabel={answerOf(opponent)}
        />
      </div>

      {(notices ?? []).map((notice) => (
        <p key={notice} className="text-xs text-amber-500" data-testid="reveal-notice">
          {notice}
        </p>
      ))}

      {settlement.matchOver && (
        <p className="text-sm font-semibold" data-testid="reveal-match-over">
          {winnerName !== null ? `Match over — ${winnerName} wins.` : "Match over — draw."}
        </p>
      )}

      {children}
    </section>
  );
}
