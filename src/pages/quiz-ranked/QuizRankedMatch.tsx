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
import { RevealBanner } from "@/components/ranked-arena/RevealBanner";
import { RevealPanel } from "@/components/ranked-arena/RevealPanel";
import { RoundResultChip } from "@/components/ranked-arena/RoundResultChip";
import { SegmentResultBanner } from "@/components/ranked-arena/SegmentResultBanner";
import { TimerDisplay } from "@/components/ranked-arena/TimerDisplay";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import { NO_INTERACTIONS, SubmissionPhase } from "@/lib/ranked-core/viewTypes";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
import {
  abilityTrayIsUseful, opponentPresenceLabel, projectAbilities,
  projectAbilityPermissions, projectCombatants, projectMascotReactions,
  projectPermissions, projectRevealDamage, projectRevealOutcomes,
  projectRoundHistory, projectSurfaceReveal, projectTimer,
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
   * The settlement banner's Details expansion, owned HERE rather than by the
   * banner, because the arena now decides when the banner exists at all.
   *
   * The banner is transient (see `showSettlement` below). If it simply
   * unmounted at the end of the reveal beat it would take an open breakdown
   * with it, which is losing the detail rather than deferring it — so an open
   * Details keeps the banner mounted for as long as the player wants it.
   */
  const [detailsOpen, setDetailsOpen] = useState(false);

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
  /**
   * Phase 11 — the two side columns' recent-damage trails, and their reveal
   * verdicts.
   *
   * The verdicts are gated on `revealHold`, which is exactly the beat the
   * arena already withholds interaction for: both columns resolve together,
   * for the same ~1.5s, and then return to their neutral status. Nothing here
   * decides anything — outcome, damage dealt and HP after are all read off the
   * authoritative settlement.
   */
  const roundHistory = useMemo(() => ({
    player: combatants
      ? projectRoundHistory(m.damageLog, combatants.player.playerId) : [],
    opponent: combatants
      ? projectRoundHistory(m.damageLog, combatants.opponent.playerId) : [],
  }), [m.damageLog, combatants]);
  // A NEW settlement always starts collapsed. Render-time reset, no effect
  // tick — the same shape the banner used to run internally, moved out with
  // the state it belongs to. Keyed on WHICHEVER settlement the banner is
  // showing (a segment transcript wins, exactly as in `revealNode`), so a
  // settled Meta Reflex block collapses the expansion too.
  const shownSettlement: unknown = m.lastSegmentSettlement ?? m.lastResolved;
  const [seenSettlement, setSeenSettlement] = useState(shownSettlement);
  if (seenSettlement !== shownSettlement) {
    setSeenSettlement(shownSettlement);
    setDetailsOpen(false);
  }
  const revealOutcomes = useMemo(
    () => projectRevealOutcomes(m.lastResolved, m.revealHold),
    [m.lastResolved, m.revealHold]);
  const revealDamage = useMemo(
    () => projectRevealDamage(m.lastResolved, m.revealHold),
    [m.lastResolved, m.revealHold]);
  // AI1 Phase 2 — the two duelist mascots' reactions to the settled round.
  // Same settlement, same reveal gate as the verdicts above: the attacker's
  // mascot lunges and the damaged mascot recoils on the beat the round
  // resolves. Nothing here is timed or simulated.
  const mascotReactions = useMemo(
    () => projectMascotReactions(m.lastResolved, m.revealHold),
    [m.lastResolved, m.revealHold]);
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
  // QUIZ1 Phase 11 — the post-settlement answer-tablet reveal. The whole
  // disclosure gate lives in `projectSurfaceReveal`; this only supplies the
  // round the surface is actually showing, which is deliberately NOT the live
  // round during the reveal beat.
  const surfaceRoundNumber = surfaceRound?.activeRound?.roundNumber ?? null;
  const reveal = useMemo(
    () => projectSurfaceReveal(m.lastResolved, surfaceRoundNumber, question),
    [m.lastResolved, surfaceRoundNumber, question]);
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
  if (m.contractError) {
    // The failure mode this replaces: a payload this client could not read was
    // swallowed as a transient error and retried forever, so the first Meta
    // Reflex block simply froze with nothing on screen and nothing in the log.
    // The match itself is intact server-side — only this client is out of date
    // — so the state says so, offers a retry, and shows the reader's own field
    // complaint. The message names a contract path, never a payload value.
    return (
      <section data-testid="ranked-contract-error"
        className="ranked-panel space-y-2 border border-destructive/60 p-4">
        <h3 className="font-semibold text-destructive">This match needs a newer client</h3>
        <p className="text-sm text-muted-foreground">
          Your browser could not read the latest match data. Your match is safe —
          reload the page to pick it up where it left off.
        </p>
        <p className="font-mono text-xs text-muted-foreground" data-testid="ranked-contract-detail">
          {m.contractError}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={m.retry} data-testid="ranked-contract-retry"
            className="rounded border border-border px-3 py-1.5 text-sm font-semibold">
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}
            className="rounded border border-border px-3 py-1.5 text-sm font-semibold">
            Reload
          </button>
        </div>
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

  /**
   * R1 — the ONE signal that decides whether legacy ability/progression UI may
   * render, read off THIS match's own frozen projection.
   *
   * Deliberately not derived from role, class, XP, the feature flag, or
   * whether a Level 2 choice happens to be pending: all five are wrong for an
   * in-flight or historical match. A pre-R1 match reports `true` forever and
   * keeps every control it has always had — including for a player who
   * reconnects into one that is waiting on a Level 2 choice. A backend that
   * does not send the field at all also reads `true` (see the contract's
   * compatibility-safe parse), so shipping this client ahead of the backend
   * hides nothing.
   */
  const progressionEnabled = m.publicRound.progressionEnabled;

  if (m.phase === "match_over") {
    const reason = m.result?.terminalReason ?? "combat";
    const won = m.result?.winnerUserId === viewerUserId;
    const draw = m.result?.outcome === "draw";
    const result = draw ? "draw" : won ? "victory" : "defeat";
    const subheading = reason === "forfeit"
      ? (won ? "Opponent forfeited." : "You forfeited.")
      : reason === "no_contest" ? "No contest — both players left." : undefined;
    // Ordinary flow, like the live arena: the terminal frame and the final
    // reveal are free to be taller than the viewport and the DOCUMENT scrolls
    // them. This used to carry its own `lg:overflow-y-auto` game-viewport
    // containment, which is exactly the nested scrollbar 1.5 removed.
    return (
      <div className="ranked-shell flex flex-col gap-4" data-testid="ranked-match-over">
        <MatchOverFrame result={result} player={combatants.player} opponent={combatants.opponent}
          subheading={subheading} progressionEnabled={progressionEnabled}
          primaryAction={{ label: "Back to Quiz", onClick: () => { window.location.assign("/quiz"); } }} />
        {m.lastResolved && (
          <RevealPanel settlement={m.lastResolved} viewerSlot="p1"
            namesByPlayerId={revealNames(m.lastResolved)}
            showAbilities={progressionEnabled} />
        )}
      </div>
    );
  }

  const opponentLabel = opponentPresenceLabel(m.presence);
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
  // Visibility is a CONTENT question ("does this player have anything to arm?"),
  // deliberately NOT an availability question. Gating the tray's existence on
  // `canSelectAbility` unmounted it every time the window closed — between
  // rounds, and for the whole of a level-2 choice — which removed ~140px from
  // the middle of the HUD and slid the status panel up under the cursor. The
  // tray now stays mounted and renders its own disabled state (AbilityTray
  // already surfaces `disabledReasons.ability` for exactly this).
  // R1: a no-progression match has no ability layer for the normal player, so
  // the tray, its hotkeys, its charge indicators and its "Clear ability"
  // control are all absent. The tray was ALREADY conditional (see
  // `abilityTrayIsUseful`), so its absence reclaims the row rather than
  // reserving an empty one — no blank track is left behind.
  const showAbilityTray = progressionEnabled && !moduleOwnsSubmission
    && m.privatePlayer !== null
    && abilityTrayIsUseful(abilities, m.selectedAbilityId);

  // Stable round header. `activeRound` briefly reports null between rounds; the
  // sticky `roundNumber` keeps the last shown round so the header never blanks
  // to "Round —". During that gap (input phases only) we show an intentional
  // "Preparing next round…" transition instead of a malformed header/empty timer.
  const roundLabel = m.roundNumber !== null ? `Round ${m.roundNumber}` : "Preparing match…";
  // A phased segment in its ability window legitimately has no engine round
  // and therefore no shared timer — that is the phase, not a transition gap.
  const inTransition = !timer && m.phase !== "progression" && !m.segmentState;

  // The Level 2 overlay is gated on the SAME signal. `phase === "progression"`
  // is already structurally unreachable on an R1 match (a match frozen with a
  // single level threshold can never put a player in
  // `progression_pending_players`), so this is defence in depth — but it is
  // the check that keeps the two answers from ever disagreeing.
  const isProgression = m.phase === "progression" && progressionEnabled;
  // The question surface stays MOUNTED and IN FLOW at all times — including
  // during the reveal beat and a level-2 choice. It used to be `display:none`
  // for those, which collapsed its box to zero and let everything below it jump
  // several hundred pixels; the beat is expressed by withholding interaction
  // (see `inputOpen`) and by the reveal appearing beneath, not by removing the
  // question from the layout. Keeping it mounted also preserves the RA1 1.2
  // guarantee that the scenario loop and answer entrance never restart.

  // A multi-challenge segment has its own result shape: the arena reveal panel
  // describes ONE challenge, which is the wrong shape for five. Neither is
  // gated on the phase any more — a level-2 choice used to suppress the very
  // reveal that explained it.
  //
  // Phase 2 compact layout: both settlements render as FIXED-HEIGHT banners
  // with the full breakdown behind a Details expansion. The full panels used
  // to stack 200–500px under the next live round; now the active-round height
  // budget never includes settlement detail. Each banner collapses itself
  // whenever a NEW settlement arrives, so the full transcript can never mount
  // beneath an active question on its own.
  /**
   * WHEN THE SETTLEMENT BANNER EXISTS — the reveal-lifecycle repair.
   *
   * This used to be "whenever a settlement exists", and `lastResolved` is only
   * ever replaced, never cleared, so from the first settled round onward the
   * banner was permanently on screen. The result: the header said ROUND 6 and
   * both columns said "Thinking…" while a full-width bar below still shouted
   * CORRECT · 14 damage dealt · Round 5 resolved. It was the only reveal
   * surface in the arena NOT gated on the beat — the column verdicts, the
   * damage numbers and the mascot reactions all resolve and then stand down.
   *
   * Three reasons to be on screen, and nothing else:
   *
   *  1. `revealHold` — the settlement beat itself. Same gate, same ~1.5s, as
   *     every other reveal surface.
   *  2. `isProgression` — a level-2 choice is owed. The reveal is what
   *     EXPLAINS the level-up being chosen, and the choice can outlast the
   *     beat, so it stays for as long as the prompt does.
   *  3. `detailsOpen` — the player expanded the breakdown. Pulling it out from
   *     under them would be losing the detail, not deferring it.
   *
   * The compact, permanent form of this information now lives in the TOP strip
   * (`RoundResultChip`). Nothing takes the bottom's place: that region is
   * deliberately left empty for the round timeline.
   */
  const showSettlement = m.revealHold || isProgression || detailsOpen;
  const revealNode = !showSettlement ? null : m.lastSegmentSettlement ? (
    <SegmentResultBanner
      reveal={m.lastSegmentSettlement.reveal}
      viewerUserId={viewerUserId}
      opponentUserId={m.opponentUserId}
      damageDealt={m.lastSegmentSettlement.damageByPlayerId[viewerUserId] ?? null}
      // R1: no ability layer means no ability reveal. An empty map renders no
      // ability row at all, rather than a meaningless "—" placeholder.
      abilitiesByPlayerId={progressionEnabled
        ? m.lastSegmentSettlement.abilitiesByPlayerId : {}}
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
    />
  ) : m.lastResolved ? (
    <RevealBanner settlement={m.lastResolved} viewerSlot="p1"
      namesByPlayerId={revealNames(m.lastResolved)}
      showAbilities={progressionEnabled}
      open={detailsOpen} onOpenChange={setDetailsOpen} />
  ) : null;

  return (
    <div className="ranked-shell flex flex-col gap-3"
      data-testid="ranked-match" data-reveal-hold={m.revealHold ? "true" : "false"}>
      {/* Condensed top strip — mode · round · timer in one compact row.
          `min-h` reserves the tallest state this strip ever reaches, so the
          transition pill appearing or the timer gaining a notice line cannot
          push the arena below it. */}
      <section className="ranked-panel ranked-header-plate flex min-h-[3.5rem] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5">
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
        {/* The PREVIOUS round's result, compact and permanent — the top strip
            is where match state lives. Third child of a `justify-between`
            row, so it settles into the gap the strip already had between the
            round title and the clock; it is `hidden md:flex` because below
            that width the strip has no gap to settle into (the duelist
            ledgers carry the same history at every width). It is one line
            inside the strip's existing reserved min-height, so a round
            resolving cannot grow the header. */}
        {m.lastResolved && (
          <RoundResultChip settlement={m.lastResolved} viewerSlot="p1"
            className="hidden md:flex" />
        )}
        {/* RA10: the timer block sits behind a brass hairline, scoreboard-style,
            so the clock reads as its own instrument. Border only — the strip's
            reserved min-height is untouched. */}
        <div className="flex items-center gap-3 sm:border-l sm:border-[#b9934c]/30 sm:pl-4">
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

      {/* Arena body: You ⚔ focus ⚔ Opponent. Ordinary flow — the centre column
          is NOT a scroll container; the page scrolls. `items-start` keeps the
          duelist panels at their natural height so a taller centre column can
          never stretch them.

          RA10: the question board is the centre of gravity — the duelist rails
          give up a step at lg (14rem) where width is scarce and return to
          15rem at xl, where the wider match frame (see Frame) has already
          grown the centre track instead.

          RA11: from 1500px the frame runs stage-wide (90rem), so the rails
          step OUT to 17rem and the gutters widen — the duelists move toward
          the flanks while the centre track still absorbs most of the gain.

          Phase 11 — TRUE THREE COLUMNS. The rails stopped being fixed rem
          tracks and became PROPORTIONS of the arena: 23% / 54% / 23%. Two
          things follow, and both were the point:

           * the side columns grow with the stage instead of pinning at 14rem,
             which is what made them read as "two small cards flanking a giant
             centre" rather than as two of three columns;
           * `items-stretch` replaces `items-start`, so the three tracks share
             one vertical extent instead of the rails floating at their own
             natural height against a much taller centre (the §14 constraint).
             The panels themselves still size their own CONTENT — stretching
             the track is not stretching the content. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,23fr)_minmax(0,54fr)_minmax(0,23fr)] lg:items-stretch min-[1500px]:gap-4">
        {/* `h-full` on BOTH the track cell and the panel: `items-stretch`
            stretches the grid cell, and without this the panel would still sit
            at its own content height inside a taller cell — which is the
            "tiny floating side cards beside a giant centre" reading §14 rules
            out. The panel's own sections keep their sizes; only the shared
            column extent changes. */}
        <div className="lg:col-start-1 lg:row-start-1 lg:h-full">
          <CombatantPanel combatant={combatants.player}
            progressionEnabled={progressionEnabled}
            damage={roundHistory.player}
            outcome={revealOutcomes[combatants.player.playerId] ?? null}
            damageDealt={revealDamage[combatants.player.playerId] ?? null}
            reaction={mascotReactions[combatants.player.playerId] ?? null} />
        </div>
        <div className="lg:col-start-3 lg:row-start-1 lg:h-full">
          <CombatantPanel combatant={combatants.opponent}
            progressionEnabled={progressionEnabled}
            damage={roundHistory.opponent}
            outcome={revealOutcomes[combatants.opponent.playerId] ?? null}
            damageDealt={revealDamage[combatants.opponent.playerId] ?? null}
            reaction={mascotReactions[combatants.opponent.playerId] ?? null} />
        </div>

        <div data-testid="ranked-focus-column"
          className="relative col-span-2 flex flex-col gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1">
          {/* The level-2 choice is OVERLAID on the question rather than
              inserted above it. In flow it added ~192px to the middle of the
              page the instant a round resolved, pushing the question, the
              ability tray and the status panel down under the player's cursor.
              The panel is opaque and sits in the same place the question does,
              so it reads as the focal control without moving anything. */}
          {isProgression && (
            <section data-testid="ranked-progression"
              // Overlaid on the question so nothing below it moves — EXCEPT
              // when the focus column has no surface at all (a phased segment
              // between engine rounds): overlaying an empty column would hang
              // the panel over whatever sits beneath, so it renders in flow
              // there (the column was empty; nothing shifts).
              className={renderer && (question || moduleOwnsSubmission)
                ? "absolute inset-x-0 top-0 z-20" : ""}>
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
              // Always mounted AND always in flow. During the reveal beat the
              // surface is dimmed, never collapsed: `opacity` costs no layout,
              // `display:none` cost several hundred pixels of jump.
              data-input-open={inputOpen ? "true" : "false"}
              // `ranked-folio` is the RA4 academy skin for this exact box —
              // colour only. The reserved scenario-band box and the answer
              // grid inside are untouched. RA11 widens the HORIZONTAL padding
              // on the big stage only — vertical rhythm (and with it the
              // no-scroll desktop budget) is unchanged.
              className={`ranked-panel ranked-folio p-3 sm:p-5 min-[1500px]:px-7 transition-opacity duration-200 motion-reduce:transition-none ${
                m.revealHold || isProgression ? "opacity-60" : "opacity-100"}`}>
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
                // The state from the SAME snapshot the renderer was resolved
                // from. Reading the live state here instead coupled a frozen
                // renderer to a moving state: across a segment boundary the
                // surface still shows module A while the live state already
                // describes module B, so a Meta Reflex viewport was handed a
                // null state and rendered "Loading the block…" for the whole
                // reveal beat — and, worse, a v1 renderer could be handed a v4
                // block whose cards it cannot read. During play the two are the
                // same object; they differ only while the surface is
                // deliberately lagging, which is exactly when they must not be
                // mixed.
                segmentState={surfaceRound!.segmentState}
                actions={segmentActions}
                skewMs={m.skewMs}
                reveal={reveal}
              />
            </section>
          )}
          {!renderer && (
            // Fail closed: never render a quiz input for an unrecognised
            // module — a mismatched input shape could submit a meaningless
            // answer into a rated match.
            <section data-testid="ranked-unsupported-module"
              className="ranked-panel p-3 sm:p-4">
              <p className="text-sm text-muted-foreground">
                This round uses a game mode your client does not support yet.
                Please refresh to update.
              </p>
            </section>
          )}
        </div>
      </div>

      {/* Lower HUD: the OPTIONAL ability hotbar plus ONE inline status line.
          There is no Lock In button — clicking an answer submits it.
          The row is rendered for the whole match, INCLUDING a level-2 choice:
          unmounting it there tore ~230px out of the middle of the page.

          Phase 2 compact layout: the old side-by-side status CARD duplicated
          state already visible in the answer grid (selected answer) and the
          tray (armed ability) and cost a 20rem track plus ~94px of height.
          What survives is the one thing nothing else shows — the transient
          submission status / error — as a reserved-height line under the
          tray. */}
      {!moduleOwnsSubmission && (
          <div className="flex flex-col gap-1.5">
            {showAbilityTray && (
              // RA11: no panel chrome around the tray any more — the tray IS
              // the object (one connected spellbook-spine dock, see
              // .ability-spine in index.css). A wrapper panel around it is
              // exactly the "box containing cards" reading being retired.
              <section data-testid="ranked-abilities">
                <AbilityTray abilities={abilities} selectedAbilityId={m.selectedAbilityId}
                  permissions={abilityPermissions} onSelectAbility={m.selectAbility}
                  noAbilityLabel="Clear ability" />
              </section>
            )}
            {/* One reserved line box: the three status strings (and an error)
                differ in length, and swapping them used to change the HUD's
                height whenever one of them wrapped. */}
            <p role={m.actionError ? "alert" : "status"} data-testid="submission-status"
              className={`line-clamp-2 min-h-[2.25rem] px-1 text-xs ${
                m.actionError ? "text-destructive" : "text-muted-foreground"}`}>
              {m.actionError ? m.actionError
                : m.submitting ? "Submitting…"
                  : m.phase === "locked" ? "Answer locked — waiting for opponent…"
                    : "Choose an answer to lock it in."}
            </p>
          </div>
      )}

      {/* The settlement banner lands at the very END of the page, below
          everything it could otherwise displace, and only for the beat it
          describes (see `showSettlement`). Between rounds this region is
          EMPTY, and deliberately so: the bottom of the arena is reserved for
          the round timeline, and nothing here may take that space with
          another permanent result panel. */}
      {revealNode}
    </div>
  );
}
