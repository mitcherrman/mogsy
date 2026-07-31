/**
 * Public Ranked live-match view (F1.5). Composes the canonical arena from
 * backend v2 data via the match controller — no arena component is forked and
 * no combat value is computed here. Reveal/HP/XP/damage are all authoritative
 * pass-through.
 */
import { useEffect, useMemo, useState } from "react";
import { AbilityTray } from "@/components/ranked-arena/AbilityTray";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { CombatantPanel } from "@/components/ranked-arena/CombatantPanel";
import { LevelUpPanel } from "@/components/ranked-arena/LevelUpPanel";
import { MatchOverFrame } from "@/components/ranked-arena/MatchOverFrame";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { SegmentTranscript } from "@/components/ranked-arena/SegmentTranscript";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import { NO_INTERACTIONS, SubmissionPhase } from "@/lib/ranked-core/viewTypes";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import {
  abilityTrayIsUseful, opponentPresenceLabel, projectAbilities,
  projectAbilityPermissions, projectCombatants, projectPermissions, projectTimer,
} from "./rankedViews";
import { useRankedMatch } from "./useRankedMatch";

/** Identity of the module/segment a snapshot belongs to. */
function segmentKey(round: PublicRoundView): string {
  return `${round.segment.moduleId}.${round.segment.moduleVersion}#${round.segment.segmentNumber ?? "-"}`;
}

/**
 * Display names keyed off the SETTLEMENT's own player ids rather than the
 * controller's `opponentUserId`. The two are guaranteed to agree now that the
 * id mapping is derived from the snapshot being adapted, but keying off the
 * settlement means a mismatch can never render an empty opponent title again
 * (RevealPanel falls back to the raw player id, which used to be "").
 */
function revealNames(settlement: ResolvedRoundView): Record<string, string> {
  return {
    [settlement.players.p1.playerId]: "You",
    [settlement.players.p2.playerId]: "Opponent",
  };
}

export function QuizRankedMatch({ matchId, viewerUserId }:
{ matchId: string; viewerUserId: string }) {
  const m = useRankedMatch(matchId, viewerUserId);
  const [tick, setTick] = useState(0);
  const [pendingLevel2, setPendingLevel2] = useState<string | null>(null);

  /**
   * The snapshot the QUESTION SURFACE renders from — deliberately laggier than
   * the live one.
   *
   * Two things used to unmount the whole question subtree (killing the scenario
   * card's Ken Burns loop and replaying every answer's entrance stagger):
   * `activeRound` going briefly null between rounds, and the next round
   * arriving in the same frame as the previous round's settlement. Holding the
   * last usable snapshot fixes both — the subtree stays mounted and simply
   * keeps showing the round the player was just looking at.
   *
   * Everything else on screen (HP, XP, timer, presence) still reads the LIVE
   * snapshot, so damage lands on the meters while the reveal is being read.
   */
  const [renderedRound, setRenderedRound] = useState<PublicRoundView | null>(null);
  const live = m.publicRound;
  const canAdvanceSurface = live !== null && !m.revealHold && (
    // A real round is open, or this is the first snapshot we have ever seen, or
    // the segment itself changed (a phased segment legitimately has no engine
    // round, so waiting for one would pin the surface to the wrong module).
    live.activeRound !== null
    || renderedRound === null
    || segmentKey(live) !== segmentKey(renderedRound)
  );
  if (canAdvanceSurface && live !== renderedRound) setRenderedRound(live);
  const surfaceRound = renderedRound ?? live;

  // 1s render tick so the skew-anchored timer counts down between polls.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const combatants = useMemo(
    () => (m.publicRound ? projectCombatants(m.publicRound, viewerUserId) : null),
    [m.publicRound, viewerUserId]);
  // The active segment's module renderer. A v2 payload or a legacy round has
  // no discriminator and resolves to quiz.v1 — the module those rounds were
  // created under — so behaviour is unchanged. null = unknown module.
  const renderer = useMemo(
    () => (surfaceRound ? rendererForSegment(surfaceRound.segment) : null),
    [surfaceRound]);
  const question = useMemo(
    () => (surfaceRound && renderer ? renderer.projectQuestion(surfaceRound) : null),
    [surfaceRound, renderer]);
  const abilities = useMemo(
    () => (m.privatePlayer ? projectAbilities(m.privatePlayer, m.selectedAbilityId) : []),
    [m.privatePlayer, m.selectedAbilityId]);
  const timer = m.publicRound ? projectTimer(m.publicRound, m.skewMs, Date.now()) : null;
  // A module that owns its own ability window and submission renders those
  // itself; the shell must not also show the quiz confirm strip or ability
  // tray. This is a capability the module declares — not a mode branch here.
  const moduleOwnsSubmission = renderer?.ownsSubmission === true;
  const segmentActions = useMemo(() => ({
    submitChallenge: m.submitSegmentChallenge,
    busy: m.submitting,
    error: m.actionError,
  }), [m.submitSegmentChallenge, m.submitting, m.actionError]);
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
    // Terminal frame + final reveal can exceed the game viewport, so it owns its
    // own scroll rather than pushing the shell into one.
    return (
      <div className="ranked-shell flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
        data-testid="ranked-match-over">
        <MatchOverFrame result={result} player={combatants.player} opponent={combatants.opponent}
          subheading={subheading}
          primaryAction={{ label: "Back to Quiz", onClick: () => { window.location.assign("/quiz"); } }} />
        {m.lastResolved && (
          <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
            namesByPlayerId={revealNames(m.lastResolved)} />
        )}
      </div>
    );
  }

  const opponentLabel = opponentPresenceLabel(m.presence);
  const selectedOption = question?.options.find((o) => o.id === m.selectedOptionId) ?? null;
  // R3: the answer grid is open only while the round is unanswered. One click
  // submits, so there is no `reviewing` phase and no `canChangeAnswer` state.
  // The reveal beat withholds interactivity from the NEXT round while the last
  // one is being introduced. Presentation only: the server already opened the
  // next round and its clock is already running (the timer above keeps ticking
  // truthfully) — this just refuses to accept a click for ~1.5s so damage, XP
  // and any level-up are readable instead of flashing past.
  const inputOpen = m.phase === "active" && !m.revealHold;
  const subPhase: SubmissionPhase = m.phase === "locked" ? "locked" : "selecting";
  const permissions = projectPermissions(subPhase, inputOpen, m.submitting);
  // The ability tray is gated INDEPENDENTLY of the answer: it stays live for as
  // long as the server says the viewer's selection window is open, which
  // includes the whole wait for the opponent.
  const abilityPermissions = projectAbilityPermissions(
    m.privatePlayer, m.roundLive, m.abilityBusy);
  const showAbilityTray = !moduleOwnsSubmission && m.privatePlayer !== null
    && abilityPermissions.canSelectAbility
    && abilityTrayIsUseful(abilities, m.selectedAbilityId);

  // Stable round header. `activeRound` briefly reports null between rounds; the
  // sticky `roundNumber` keeps the last shown round so the header never blanks
  // to "Round —". During that gap (input phases only) we show an intentional
  // "Preparing next round…" transition instead of a malformed header/empty timer.
  const roundLabel = m.roundNumber !== null ? `Round ${m.roundNumber}` : "Preparing match…";
  // A phased segment in its ability window legitimately has no engine round
  // and therefore no shared timer — that is the phase, not a transition gap.
  const inTransition = !timer && m.phase !== "progression" && !m.segmentState;

  const isProgression = m.phase === "progression";
  // While the beat runs — and while a level-2 choice is owed — the question is
  // kept MOUNTED but out of sight, so the scenario card's ambient loop and the
  // answer grid's entrance never restart when it comes back.
  const hideQuestion = m.revealHold || isProgression;

  // A multi-challenge segment has its own transcript: the arena reveal panel
  // describes ONE challenge, which is the wrong shape for five. Neither is
  // gated on the phase any more — a level-2 choice used to suppress the very
  // reveal that explained it.
  const revealNode = m.lastSegmentSettlement ? (
    <SegmentTranscript
      reveal={m.lastSegmentSettlement.reveal}
      viewerUserId={viewerUserId}
      opponentUserId={m.opponentUserId}
      damageDealt={m.lastSegmentSettlement.damageByPlayerId[viewerUserId] ?? null}
      abilitiesByPlayerId={m.lastSegmentSettlement.abilitiesByPlayerId}
    />
  ) : m.lastResolved ? (
    <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
      namesByPlayerId={revealNames(m.lastResolved)} />
  ) : null;

  return (
    <div className="ranked-shell flex flex-col gap-3 lg:min-h-0 lg:flex-1"
      data-testid="ranked-match" data-reveal-hold={m.revealHold ? "true" : "false"}>
      {/* Condensed top strip — mode · round · timer in one compact row. */}
      <section className="ranked-panel flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
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
        <div className="flex shrink-0 flex-wrap gap-x-3 px-1 sm:hidden">
          {m.publicRound.playtest?.isPlaceholder && (
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Playtest · Placeholder
            </span>
          )}
          {opponentLabel && <span className="text-[11px] text-muted-foreground">{opponentLabel}</span>}
        </div>
      )}

      {/* Arena body: You ⚔ focus ⚔ Opponent. The duelist panels are HUD — they
          never scroll, so HP and XP stay on screen for the whole round. The
          centre column is the single intentional scroll region in the app
          shell, and owns the level-up choice, the question, and the reveal. */}
      <div className="grid grid-cols-2 gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,15rem)] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
        <div className="lg:col-start-1 lg:row-start-1">
          <CombatantPanel combatant={combatants.player} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1">
          <CombatantPanel combatant={combatants.opponent} />
        </div>

        <div data-testid="ranked-focus-column"
          className="col-span-2 flex flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
          {isProgression && (
            <section data-testid="ranked-progression" className="shrink-0">
              <LevelUpPanel
                event={{
                  kind: "level2-choice",
                  options: (m.privatePlayer?.ownAbilities.level2Options ?? []).map((id) => ({
                    id, name: abilityName(id), description: abilityDescription(id),
                  })),
                  // R3: the pending id marks the choice IN FLIGHT, not one awaiting
                  // a confirmation click. The server's acceptance is what ends the
                  // progression phase, so nothing is confirmed locally.
                  pendingOptionId: pendingLevel2, confirmedOptionId: null,
                }}
                permissions={{ ...NO_INTERACTIONS, canSelectAbility: !m.submitting }}
                onSelectOption={(id) => {
                  if (m.submitting || pendingLevel2 !== null) return;  // double-click safe
                  setPendingLevel2(id);
                  m.chooseLevelTwo(id);
                }}
                gatesNextRound
              />
            </section>
          )}
          {renderer && (question || moduleOwnsSubmission) && (
            <section data-testid="ranked-question"
              // `hidden`, never unmounted — see `hideQuestion`.
              className={`ranked-panel shrink-0 p-3 sm:p-4 ${hideQuestion ? "hidden" : ""}`}>
              <renderer.Viewport
                // The FROZEN snapshot: the surface keeps rendering the round the
                // player was looking at until the next one is genuinely ready.
                publicRound={surfaceRound!}
                selection={m.selectedOptionId}
                permissions={permissions}
                // R3: selecting an option IS answering. The index comes from
                // the projected question so the shell never guesses it from
                // the option id.
                onSelect={(sel) => {
                  const option = question?.options.find((o) => o.id === sel);
                  if (option) m.answer(option.id, option.index);
                }}
                segmentState={m.segmentState}
                actions={segmentActions}
                skewMs={m.skewMs}
              />
            </section>
          )}
          {!renderer && (
            // Fail closed: never render a quiz input for an unrecognised
            // module — a mismatched input shape could submit a meaningless
            // answer into a rated match.
            <section data-testid="ranked-unsupported-module"
              className="ranked-panel shrink-0 p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">
                This round uses a game mode your client does not support yet.
                Please refresh to update.
              </p>
            </section>
          )}
          {revealNode && <div className="shrink-0">{revealNode}</div>}
        </div>
      </div>

      {/* Lower HUD: the OPTIONAL ability hotbar, and a status line. Pinned
          below the scroll region so it can never be pushed off-screen.
          There is no Lock In button — clicking an answer submits it — and
          the tray is suppressed entirely when nothing is actionable or when
          a module runs its own submission. */}
      {!moduleOwnsSubmission && !isProgression && (
          <div className="grid shrink-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-stretch">
            {showAbilityTray && (
              <section data-testid="ranked-abilities" className="ranked-panel p-3 sm:p-4">
                <AbilityTray abilities={abilities} selectedAbilityId={m.selectedAbilityId}
                  permissions={abilityPermissions} onSelectAbility={m.selectAbility}
                  noAbilityLabel="Clear ability" />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Optional — you can change or clear this until the round ends.
                </p>
              </section>
            )}
            <section data-testid="ranked-submission-status"
              className={`ranked-panel p-3 sm:p-4 ${showAbilityTray ? "" : "lg:col-span-2"}`}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Answer</dt>
                  <dd className="font-semibold" data-testid="status-answer">
                    {selectedOption?.label ?? "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Ability</dt>
                  <dd className="font-semibold" data-testid="status-ability">
                    {m.selectedAbilityId ? abilityName(m.selectedAbilityId) : "No ability"}
                  </dd>
                </div>
              </dl>
              {m.actionError ? (
                <p role="alert" data-testid="submission-status"
                  className="mt-2 text-xs text-destructive">{m.actionError}</p>
              ) : (
                <p role="status" data-testid="submission-status"
                  className="mt-2 text-xs text-muted-foreground">
                  {m.submitting ? "Submitting…"
                    : m.phase === "locked" ? "Answer locked — waiting for opponent…"
                      : "Choose an answer to lock it in."}
                </p>
              )}
            </section>
          </div>
      )}
    </div>
  );
}
