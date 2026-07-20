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
    return (
      <section data-testid="ranked-recovering" className="ranked-shell">
        <div className="ranked-panel p-6 text-center space-y-1">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Ranked Duel</div>
          <p className="text-sm text-muted-foreground">Recovering match…</p>
        </div>
      </section>
    );
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
      <div className="ranked-shell space-y-4" data-testid="ranked-match-over">
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

  // Stable round header. `activeRound` briefly reports null between rounds; the
  // sticky `roundNumber` keeps the last shown round so the header never blanks
  // to "Round —". During that gap (input phases only) we show an intentional
  // "Preparing next round…" transition instead of a malformed header/empty timer.
  const roundLabel = m.roundNumber !== null ? `Round ${m.roundNumber}` : "Preparing match…";
  const inTransition = !timer && m.phase !== "progression";

  return (
    <div className="ranked-shell space-y-3" data-testid="ranked-match">
      {/* Condensed top strip — mode · round · timer in one compact row. */}
      <section className="ranked-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
        <div className="flex items-baseline gap-3">
          <div>
            <div className="ranked-eyebrow">
              Ranked Duel{m.publicRound.playtest?.isBotMatch ? " · vs Bot" : ""}
            </div>
            <h3 className="ranked-title text-lg font-bold leading-tight">{roundLabel}</h3>
          </div>
          {inTransition && (
            <span data-testid="ranked-round-transition"
              className="ranked-eyebrow ranked-eyebrow--cyan animate-pulse motion-reduce:animate-none">
              Preparing next round…
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {(m.publicRound.playtest?.isPlaceholder || opponentLabel) && (
            <div className="hidden text-right sm:block">
              {m.publicRound.playtest?.isPlaceholder && (
                <p data-testid="ranked-playtest-label"
                  className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Playtest · Placeholder
                </p>
              )}
              {opponentLabel && (
                <p data-testid="ranked-presence" className="text-[11px] text-muted-foreground">{opponentLabel}</p>
              )}
            </div>
          )}
          {timer && <TimerDisplay timer={timer} label="Shared round timer" />}
        </div>
      </section>

      {/* Mobile-only presence/playtest line (hidden in the strip on <sm). */}
      {(m.publicRound.playtest?.isPlaceholder || opponentLabel) && (
        <div className="flex flex-wrap gap-x-3 px-1 sm:hidden">
          {m.publicRound.playtest?.isPlaceholder && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Playtest · Placeholder
            </span>
          )}
          {opponentLabel && <span className="text-[11px] text-muted-foreground">{opponentLabel}</span>}
        </div>
      )}

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
          {/* Arena body: You ⚔ Question ⚔ Opponent. On <lg the two duelists sit
              side-by-side above the focal question; on lg they flank it. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] lg:items-start">
            <div className="lg:col-start-1 lg:row-start-1">
              <CombatantPanel combatant={combatants.player} />
            </div>
            <div className="lg:col-start-3 lg:row-start-1">
              <CombatantPanel combatant={combatants.opponent} />
            </div>
            {question && (
              <section data-testid="ranked-question"
                className="ranked-panel col-span-2 p-3 sm:p-4 lg:col-span-1 lg:col-start-2 lg:row-start-1">
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
          </div>

          {/* Lower HUD: ability hotbar + one-shot lock. */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-stretch">
            {m.privatePlayer && (
              <section data-testid="ranked-abilities" className="ranked-panel p-3 sm:p-4">
                <AbilityTray abilities={abilities} selectedAbilityId={m.selectedAbilityId}
                  permissions={permissions} onSelectAbility={m.selectAbility} />
              </section>
            )}
            <section className={`ranked-panel p-3 sm:p-4 ${m.privatePlayer ? "" : "lg:col-span-2"}`}>
              <SubmissionReview
                flow="direct"
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
                confirmLabel={m.submitting ? "Locking…" : undefined} />
            </section>
          </div>
        </>
      )}

      {m.phase !== "progression" && m.lastResolved && (
        <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
          namesByPlayerId={{ [viewerUserId]: "You", [m.opponentUserId ?? ""]: "Opponent" }} />
      )}
    </div>
  );
}
