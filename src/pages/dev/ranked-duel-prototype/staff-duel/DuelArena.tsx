// ---------------------------------------------------------------------------
// Staff-duel arena — first real consumer of the canonical ranked-arena
// components (F1 Phase D). This file is the staff COMPOSITION layer: it maps
// session state to neutral view contracts (via staffDuelProjection), owns the
// local select → review → confirm flow, and emits exactly one atomic
// submission per round. All transport, polling, tokens, and error
// classification stay in useStaffDuelSession; all combat values come from
// backend projections and settlements. Nothing here computes damage, HP, XP,
// levels, charges, correctness, deadlines, or winners.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import { AnswerGrid } from "@/components/ranked-arena/AnswerGrid";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { QuestionPanel } from "@/components/ranked-arena/QuestionPanel";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SubmissionReview } from "@/components/ranked-arena/SubmissionReview";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { abilityViewsFromPrivatePlayer } from "@/lib/ranked-core/adapters/adaptToViews";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import {
  CombatantView,
  NO_INTERACTIONS,
  SubmissionPhase,
} from "@/lib/ranked-core/viewTypes";
import { StaffDuelCredentials, StaffDuelSessionState } from "./useStaffDuelSession";
import {
  duplicateOptionLabels,
  projectStaffCombatants,
  projectStaffPermissions,
  projectStaffQuestion,
  projectStaffTimer,
} from "./staffDuelProjection";

interface Props {
  credentials: StaffDuelCredentials;
  state: StaffDuelSessionState;
  onSubmit: (answerIndex: number, abilityId: string | null) => void;
  onChooseLevelTwo: (abilityId: string) => void;
}

const levelUpOption = (id: string) => ({
  id,
  name: abilityName(id),
  description: abilityDescription(id),
});

/** Final combatant summary for match-over: public row preferred, else the
 * last settlement's post-round values. Pure mapping, no computation. */
const finalCombatants = (
  state: StaffDuelSessionState,
  viewerId: string,
): { player: CombatantView; opponent: CombatantView } | null => {
  if (state.publicRound) {
    return projectStaffCombatants(state.publicRound, viewerId, state.observedMaxHp);
  }
  if (state.lastResolved) {
    const from = (slot: "p1" | "p2", side: CombatantView["side"]): CombatantView => {
      const p = state.lastResolved!.players[slot];
      return {
        playerId: p.playerId,
        name: p.playerId,
        tag: side === "player" ? "you" : undefined,
        side,
        classId: "",
        hp: p.hpAfter,
        maxHp: state.observedMaxHp[p.playerId] ?? null,
        xp: p.totalXpAfter,
        level: p.levelAfter,
        nextLevelThreshold: null,
        currentLevelThreshold: null,
        hasSubmitted: false,
        abilityWindow: null,
        hasAbilitySelected: null,
      };
    };
    return { player: from("p1", "player"), opponent: from("p2", "opponent") };
  }
  return null;
};

export function DuelArena({ credentials, state, onSubmit, onChooseLevelTwo }: Props) {
  const { publicRound, privatePlayer, lastResolved, pendingProgression } = state;
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedAbilityId, setSelectedAbilityId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [pendingLevel2, setPendingLevel2] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const activeRoundNumber = publicRound?.activeRound?.roundNumber ?? null;

  // The backend advancing to a new round is the ONLY thing that clears a
  // previous round's selection — including one abandoned mid-review.
  useEffect(() => {
    setSelectedOptionId(null);
    setSelectedAbilityId(null);
    setReviewing(false);
  }, [activeRoundNumber]);

  // Display-only countdown tick. The backend's deadline is authoritative;
  // reaching local zero changes presentation only — the poll loop already
  // running is what learns the authoritative resolution.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const privateIsCurrent =
    privatePlayer !== null &&
    activeRoundNumber !== null &&
    privatePlayer.roundNumber === activeRoundNumber;

  const me = publicRound?.players.find((p) => p.playerId === credentials.playerId) ?? null;
  const hasSubmitted = (privateIsCurrent && privatePlayer.hasSubmitted) || me?.hasSubmitted === true;
  const iOweChoice = pendingProgression.includes(credentials.playerId);
  const opponentOwesChoice = pendingProgression.some((id) => id !== credentials.playerId);

  const phase: SubmissionPhase = hasSubmitted ? "locked" : reviewing ? "reviewing" : "selecting";
  const inputOpen = !hasSubmitted && privateIsCurrent && activeRoundNumber !== null;
  const permissions = projectStaffPermissions({
    phase,
    inputOpen,
    submitting: state.submitting,
  });

  const question = useMemo(
    () => (publicRound?.question ? projectStaffQuestion(publicRound.question) : null),
    [publicRound?.question],
  );
  const duplicateLabels = useMemo(
    () => (question ? duplicateOptionLabels(question) : []),
    [question],
  );
  const selectedOption =
    question?.options.find((o) => o.id === selectedOptionId) ?? null;

  const abilities = useMemo(
    () =>
      privatePlayer
        ? abilityViewsFromPrivatePlayer(privatePlayer, { selectedAbilityId })
        : [],
    [privatePlayer, selectedAbilityId],
  );

  const combatants = useMemo(
    () =>
      publicRound && me
        ? projectStaffCombatants(publicRound, credentials.playerId, state.observedMaxHp)
        : null,
    [publicRound, me, credentials.playerId, state.observedMaxHp],
  );

  const timer = projectStaffTimer(publicRound?.activeRound ?? null, nowMs);

  const revealNames = useMemo(() => {
    const names: Record<string, string> = {
      [credentials.playerId]: `${credentials.playerId} (you)`,
    };
    for (const p of publicRound?.players ?? []) {
      if (p.playerId !== credentials.playerId) names[p.playerId] = p.playerId;
    }
    if (lastResolved) {
      const other = lastResolved.players.p2.playerId;
      if (!(other in names)) names[other] = other;
    }
    return names;
  }, [credentials.playerId, publicRound?.players, lastResolved]);

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
    const final = finalCombatants(state, credentials.playerId);
    return (
      <div className="space-y-4" data-testid="sd-match-over">
        {final ? (
          <MatchOverFrame
            result={winner === null ? "draw" : winner === credentials.playerId ? "victory" : "defeat"}
            player={final.player}
            opponent={final.opponent}
            subheading={
              winner === null
                ? "Draw — simultaneous knockout. No further submissions are accepted."
                : winner === credentials.playerId
                  ? `Winner: ${winner} (you). No further submissions are accepted.`
                  : `Winner: ${winner}. No further submissions are accepted.`
            }
          />
        ) : (
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-lg font-semibold">Match over</h3>
          </section>
        )}
        {lastResolved && (
          <RevealPanel
            settlement={lastResolved}
            viewerSlot="p1"
            namesByPlayerId={revealNames}
          />
        )}
      </div>
    );
  }

  if (!publicRound || !combatants) {
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
          {timer ? (
            <TimerDisplay timer={timer} label="Shared round timer" />
          ) : (
            <span className="text-sm text-muted-foreground" data-testid="sd-timer-idle">
              Shared timer: —
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CombatantPanel combatant={combatants.player} />
          <CombatantPanel combatant={combatants.opponent} />
        </div>
      </section>

      {state.error && (
        <p data-testid="sd-poll-error" className="text-sm text-destructive">
          {state.error}
        </p>
      )}

      {iOweChoice ? (
        <section data-testid="sd-progression" className="space-y-2">
          <LevelUpPanel
            event={{
              kind: "level2-choice",
              options: (privatePlayer?.level2Options ?? []).map(levelUpOption),
              pendingOptionId: pendingLevel2,
              confirmedOptionId: null,
            }}
            permissions={{
              ...NO_INTERACTIONS,
              canSelectAbility: !state.submitting,
              canConfirmSubmission: !state.submitting,
            }}
            onSelectOption={setPendingLevel2}
            onConfirmOption={() => {
              if (pendingLevel2 !== null && !state.submitting) {
                onChooseLevelTwo(pendingLevel2);
              }
            }}
            gatesNextRound
          />
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
            {question ? (
              <QuestionPanel question={question}>
                {duplicateLabels.length > 0 && (
                  <p
                    data-testid="sd-duplicate-options"
                    className="text-xs text-destructive"
                    role="alert"
                  >
                    Duplicate option labels from the backend: {duplicateLabels.join(", ")} —
                    selection may be ambiguous.
                  </p>
                )}
                <AnswerGrid
                  options={question.options}
                  selectedOptionId={selectedOptionId}
                  permissions={permissions}
                  onSelectOption={(option) => setSelectedOptionId(option.id)}
                />
              </QuestionPanel>
            ) : (
              <p className="text-sm text-muted-foreground">Waiting for the round&apos;s question…</p>
            )}
          </section>

          <section
            data-testid="sd-abilities"
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            {privatePlayer ? (
              <>
                <AbilityTray
                  abilities={abilities}
                  selectedAbilityId={selectedAbilityId}
                  permissions={permissions}
                  onSelectAbility={setSelectedAbilityId}
                />
                {privatePlayer.level3Unlocked && privatePlayer.level3FinalUnlockId && (
                  <LevelUpPanel
                    event={{
                      kind: "level3-unlock",
                      ability: levelUpOption(privatePlayer.level3FinalUnlockId),
                    }}
                    permissions={NO_INTERACTIONS}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading your private state…</p>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            <SubmissionReview
              submission={{
                selectedOptionId,
                selectedAbilityId,
                phase,
              }}
              answerLabel={selectedOption?.label ?? null}
              abilityName={selectedAbilityId !== null ? abilityName(selectedAbilityId) : null}
              permissions={permissions}
              onReview={() => setReviewing(true)}
              onEdit={() => setReviewing(false)}
              onConfirm={() => {
                if (selectedOption !== null && !state.submitting) {
                  // Exactly one atomic backend submission: final answer INDEX
                  // (mapped from the option id, never the label) + ability id.
                  onSubmit(selectedOption.index, selectedAbilityId);
                }
              }}
              statusMessage={
                state.actionError
                  ? { tone: "error", text: state.actionError }
                  : hasSubmitted
                    ? { tone: "info", text: "Submitted — waiting for opponent…" }
                    : null
              }
              confirmLabel={state.submitting ? "Locking…" : "Confirm — lock it in"}
            />
          </section>
        </>
      )}

      {lastResolved && (
        <RevealPanel
          settlement={lastResolved}
          viewerSlot="p1"
          namesByPlayerId={revealNames}
        />
      )}
    </div>
  );
}
