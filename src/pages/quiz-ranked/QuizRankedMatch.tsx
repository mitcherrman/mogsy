/**
 * Public Ranked live-match view (F1.5). Composes the canonical arena from
 * backend v2 data via the match controller — no arena component is forked and
 * no combat value is computed here. Reveal/HP/XP/damage are all authoritative
 * pass-through.
 */
import { useEffect, useMemo, useState } from "react";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import { InteractiveScenarioSurface } from "@/components/question-surface/InteractiveScenarioSurface";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SubmissionReview } from "@/components/ranked-arena/SubmissionReview";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import { NO_INTERACTIONS, SubmissionPhase } from "@/lib/ranked-core/viewTypes";
import {
  opponentPresenceLabel, projectAbilities, projectCombatants, projectPermissions,
  projectQuestion, projectScenarioSource, projectTimer,
} from "./rankedViews";
import { useRankedMatch } from "./useRankedMatch";

export function QuizRankedMatch({ matchId, viewerUserId }:
{ matchId: string; viewerUserId: string }) {
  const m = useRankedMatch(matchId, viewerUserId);
  const [tick, setTick] = useState(0);
  const [pendingLevel2, setPendingLevel2] = useState<string | null>(null);

  // 1s render tick so the skew-anchored timer counts down between polls.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const combatants = useMemo(
    () => (m.publicRound ? projectCombatants(m.publicRound, viewerUserId) : null),
    [m.publicRound, viewerUserId]);
  const question = useMemo(
    () => (m.publicRound ? projectQuestion(m.publicRound) : null), [m.publicRound]);
  // Optional rich-visual source (question-safe, pre-reveal). Null → text
  // fallback. No reveal is passed here, so the surface stays spoiler-safe.
  const scenarioSource = useMemo(
    () => (m.publicRound ? projectScenarioSource(m.publicRound) : null), [m.publicRound]);
  const abilities = useMemo(
    () => (m.privatePlayer ? projectAbilities(m.privatePlayer, m.selectedAbilityId) : []),
    [m.privatePlayer, m.selectedAbilityId]);
  const timer = m.publicRound ? projectTimer(m.publicRound, m.skewMs, Date.now()) : null;
  void tick;

  if (m.phase === "fatal") {
    return (
      <section data-testid="ranked-fatal" className="rounded-lg border border-destructive bg-card p-4">
        <h3 className="font-semibold text-destructive">Match ended</h3>
        <p className="text-sm">{m.error}</p>
      </section>
    );
  }
  if (!m.publicRound || !combatants) {
    return <p data-testid="ranked-recovering" className="text-sm text-muted-foreground">Recovering match…</p>;
  }

  if (m.phase === "match_over") {
    const reason = m.result?.terminalReason ?? "combat";
    const won = m.result?.winnerUserId === viewerUserId;
    const draw = m.result?.outcome === "draw";
    const result = draw ? "draw" : won ? "victory" : "defeat";
    const subheading = reason === "forfeit"
      ? (won ? "Opponent forfeited." : "You forfeited.")
      : reason === "no_contest" ? "No contest — both players left." : undefined;
    return (
      <div className="space-y-4" data-testid="ranked-match-over">
        <MatchOverFrame result={result} player={combatants.player} opponent={combatants.opponent}
          subheading={subheading}
          primaryAction={{ label: "Back to Quiz", onClick: () => { window.location.assign("/quiz"); } }} />
        {m.lastResolved && (
          <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
            namesByPlayerId={{ [viewerUserId]: "You", [m.opponentUserId ?? ""]: "Opponent" }} />
        )}
      </div>
    );
  }

  const opponentLabel = opponentPresenceLabel(m.presence);
  const selectedOption = question?.options.find((o) => o.id === m.selectedOptionId) ?? null;
  const inputOpen = m.phase === "active" || m.phase === "reviewing";
  const subPhase: SubmissionPhase =
    m.phase === "locked" ? "locked" : m.phase === "reviewing" ? "reviewing" : "selecting";
  const permissions = projectPermissions(subPhase, inputOpen, m.submitting);

  return (
    <div className="space-y-4" data-testid="ranked-match">
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold">Round {m.publicRound.activeRound?.roundNumber ?? "—"}</h3>
          {timer && <TimerDisplay timer={timer} label="Shared round timer" />}
        </div>
        {m.publicRound.playtest?.isPlaceholder && (
          <p data-testid="ranked-playtest-label"
            className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Ranked Playtest{m.publicRound.playtest.isBotMatch ? " · vs Bot" : ""} · Placeholder questions
          </p>
        )}
        {opponentLabel && (
          <p data-testid="ranked-presence" className="text-xs text-muted-foreground">{opponentLabel}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <CombatantPanel combatant={combatants.player} />
          <CombatantPanel combatant={combatants.opponent} />
        </div>
      </section>

      {m.phase === "progression" ? (
        <section data-testid="ranked-progression">
          <LevelUpPanel
            event={{
              kind: "level2-choice",
              options: (m.privatePlayer?.ownAbilities.level2Options ?? []).map((id) => ({
                id, name: abilityName(id), description: abilityDescription(id),
              })),
              pendingOptionId: pendingLevel2, confirmedOptionId: null,
            }}
            permissions={{ ...NO_INTERACTIONS, canSelectAbility: !m.submitting, canConfirmSubmission: !m.submitting }}
            onSelectOption={setPendingLevel2}
            onConfirmOption={() => pendingLevel2 && m.chooseLevelTwo(pendingLevel2)}
            gatesNextRound
          />
        </section>
      ) : (
        <>
          {question && (
            <section data-testid="ranked-question" className="rounded-lg border border-border bg-card p-4">
              <InteractiveScenarioSurface
                question={question}
                selectedOptionId={m.selectedOptionId}
                permissions={permissions}
                onSelectOption={(o) => m.selectOption(o.id)}
                variant="competitive"
                scenarioSource={scenarioSource}
              />
            </section>
          )}
          {m.privatePlayer && (
            <section data-testid="ranked-abilities" className="rounded-lg border border-border bg-card p-4">
              <AbilityTray abilities={abilities} selectedAbilityId={m.selectedAbilityId}
                permissions={permissions} onSelectAbility={m.selectAbility} />
            </section>
          )}
          <section className="rounded-lg border border-border bg-card p-4">
            <SubmissionReview
              submission={{ selectedOptionId: m.selectedOptionId, selectedAbilityId: m.selectedAbilityId, phase: subPhase }}
              answerLabel={selectedOption?.label ?? null}
              abilityName={m.selectedAbilityId ? abilityName(m.selectedAbilityId) : null}
              permissions={permissions}
              onReview={m.review}
              onEdit={m.edit}
              onConfirm={() => selectedOption && m.confirm(selectedOption.index)}
              statusMessage={
                m.actionError ? { tone: "error", text: m.actionError }
                  : m.phase === "locked" ? { tone: "info", text: "Submitted — waiting for opponent…" } : null}
              confirmLabel={m.submitting ? "Locking…" : "Confirm — lock it in"} />
          </section>
        </>
      )}

      {m.phase !== "progression" && m.lastResolved && (
        <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
          namesByPlayerId={{ [viewerUserId]: "You", [m.opponentUserId ?? ""]: "Opponent" }} />
      )}
    </div>
  );
}
