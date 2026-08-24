/**
 * THE RANKED ADAPTER — the mode half of the arena (ARENA1 Step 3).
 *
 * This file used to be the arena as well as the mode. The renderer moved to
 * `components/ranked-arena/CanonicalArena`, unchanged; what stayed is
 * everything that is TRUE OF RANKED AND OF NOTHING ELSE:
 *
 *   * the live-match controller (`useRankedMatch`) — polling, skew, submission,
 *     the reveal hold, presence, terminal states;
 *   * the projections that turn one Ranked snapshot into neutral view models;
 *   * the surface-lag rule that keeps the question mounted across a round
 *     boundary;
 *   * the accumulated record of what each round's segment WAS, which the
 *     timeline is derived from;
 *   * Ranked's own copy — "vs Bot", "waiting for opponent…", "Back to Quiz".
 *
 * The result is one `ArenaViewModel` per render. Reveal/HP/XP/damage are all
 * authoritative pass-through; no combat value is computed here, and none is
 * computed in the arena either.
 */
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArenaShell } from "@/components/ranked-arena/ArenaShell";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import {
  DiscoveryReveal, discoveryRevealHasContent,
} from "@/components/ranked-arena/DiscoveryReveal";
import { ForfeitControl } from "@/components/ranked-arena/ForfeitControl";
import { rendererForSegment } from "@/lib/ranked-core/modules/registry";
import { abilityDescription, abilityName } from "@/lib/ranked-core/abilityDisplay";
import { SubmissionPhase } from "@/lib/ranked-core/viewTypes";
import type { ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type {
  ArenaRail, ArenaTerminalView, ArenaViewModel,
} from "@/lib/ranked-core/arenaView";
import type { PublicRoundView } from "@/lib/ranked-public/contracts";
// ARENA1 Step 5: the settlement projections moved down into `ranked-core`.
// Ranked calls the same functions it always did, from where they now live.
import {
  projectMascotReactions, projectRevealDamage, projectRevealOutcomes,
  projectRoundHistory, projectSurfaceReveal,
} from "@/lib/ranked-core/settlementViews";
import {
  abilityTrayIsUseful, opponentPresenceLabel, projectAbilities,
  projectAbilityPermissions, projectCombatants,
  projectPermissions, projectTimer,
} from "./rankedViews";
import {
  EMPTY_OBSERVED_ROUND_KINDS, observeRoundKinds, projectRoundTimeline,
  type ObservedRoundKinds,
} from "@/lib/ranked-core/roundTimeline";
import { useMatchDiscoveries } from "./useMatchDiscoveries";
import { useRankedMatch } from "./useRankedMatch";
import { useRankedAudioBoundary } from "@/components/audio/useRankedAudioBoundary";

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

export function QuizRankedMatch({ matchId, viewerUserId, chrome }:
{
  matchId: string;
  viewerUserId: string;
  /**
   * The route's own chrome, rendered in the shell's header slot.
   *
   * A PROP rather than something this file writes, because the row contains a
   * router `Link` and the arena is not a routed thing — every test that mounts
   * a match would otherwise need a Router to render a title bar it does not
   * assert. The route supplies it; the arena renders it.
   */
  chrome?: ReactNode;
}) {
  const m = useRankedMatch(matchId, viewerUserId);
  // The mode soundtrack, for as long as there is a live match to score.
  const modeSoundtrackActive = m.publicRound !== null
    && m.phase !== "match_over"
    && m.phase !== "fatal"
    && m.contractError === null;
  useRankedAudioBoundary(matchId, modeSoundtrackActive);
  /**
   * PT1.3 — the permanent questions this match added to the player's
   * collection. Called at the TOP of the component (hooks cannot live behind
   * the early returns below) and gated to the terminal phase, so a live match
   * never spends the request. One read, never polled: the discoveries were
   * committed with the submissions that caused them, so a settled match's
   * answer is final.
   */
  const discoveries = useMatchDiscoveries(matchId, m.phase === "match_over");
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
  /**
   * RG — WHAT THE SERVER HAS SAID EACH ROUND'S SEGMENT IS.
   *
   * Accumulated across the match rather than read from one field, because both
   * sources are momentary: the live snapshot speaks only for the round in
   * play, and `lastSegmentSettlement` only for the most recent block. Neither
   * survives the next round — so without this, a Meta Reflex block would lose
   * its mark on the timeline the instant the match moved past it, which is
   * exactly the opposite of preserving it as the node travels into history.
   *
   * Render-time reconciliation with an identity-preserving fold, the same
   * shape the transcript's disclosure reset above uses: `observeRoundKinds`
   * returns the SAME object when the snapshot said nothing new, so the common
   * poll stores nothing and re-renders nothing.
   *
   * Every entry is something the server stated. Nothing is inferred from an
   * ordinal, a category, or the product's pacing schedule.
   */
  const [observedKinds, setObservedKinds] =
    useState<ObservedRoundKinds>(EMPTY_OBSERVED_ROUND_KINDS);
  // The segment's OWN ordinal, not the live round's: a phased block legiti-
  // mately describes a round the engine has not opened yet.
  const segmentRoundNumber = m.publicRound
    ? m.publicRound.segment.segmentNumber
      ?? m.publicRound.activeRound?.roundNumber ?? null
    : null;
  const nextObservedKinds = observeRoundKinds(observedKinds, {
    matchId,
    segment: m.publicRound?.segment ?? null,
    segmentRoundNumber,
    // The transcript's own module version decides what the block WAS — an
    // `item_cost_duel` segment below v4 is not a Meta Reflex block — so this
    // is the same rule the renderer registry dispatches on, not a looser one.
    settledReveal: m.lastSegmentSettlement?.reveal ?? null,
    settledRoundNumber: m.lastSegmentRoundNumber,
    // RG2 — the live question's own topic, for the round it names. Momentary
    // in exactly the way the segment is: it describes the round in play and
    // nothing else, so it is folded into the same record rather than read
    // fresh at render. A round the client never saw live keeps no topic and
    // draws the neutral token, which is the truthful rendering of "this client
    // was not here".
    questionTopic: m.publicRound?.question?.topic ?? null,
    questionRoundNumber: segmentRoundNumber,
  });
  if (nextObservedKinds !== observedKinds) setObservedKinds(nextObservedKinds);

  /**
   * RG — the BOTTOM region's progression strip.
   *
   * Derived entirely outside JSX (see `roundTimeline.ts`), from state the
   * arena already holds: the sticky round number, the authoritative settled
   * count, the observed segment record above, and the SAME bounded settlement
   * ledger the two duelist columns read. Nothing new is fetched and nothing is
   * recomputed.
   */
  const timeline = useMemo(() => (m.publicRound ? projectRoundTimeline({
    roundNumber: m.roundNumber,
    completedRounds: m.publicRound.completedRounds,
    segmentRoundNumber,
    matchOver: m.publicRound.matchOver,
    observedKinds: nextObservedKinds.byRound,
    observedTopics: nextObservedKinds.topics,
    settlements: m.damageLog,
    // The arena maps the viewer to p1 everywhere (see `idMappingFromRound`),
    // which is the same slot the top result beat reads.
    viewerSlot: "p1",
  }) : null),
  [m.publicRound, m.roundNumber, m.damageLog, segmentRoundNumber, nextObservedKinds]);
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
  // RG3 adds the viewer's own settled side, so the reveal carries the VERDICT
  // and the round's frozen evidence alongside the correct tablet. The gate is
  // unchanged — all three ride the same three conditions inside the projector.
  const reveal = useMemo(
    () => projectSurfaceReveal(m.lastResolved, surfaceRoundNumber, question,
      m.lastResolved?.players.p1 ?? null),
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

  // ── Ranked-only failure states ─────────────────────────────────────────
  //
  // Neither is an arena. They are what the ROUTE shows when there is no match
  // to render, and both describe a transport problem in Ranked's own words, so
  // they stay here — rendered in the same canonical shell the arena uses.
  if (m.phase === "fatal") {
    return (
      <ArenaShell size="wide" header={chrome}>
        <section data-testid="ranked-fatal" className="rounded-lg border border-destructive bg-card p-4">
          <h3 className="font-semibold text-destructive">Match ended</h3>
          <p className="text-sm">{m.error}</p>
        </section>
      </ArenaShell>
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
      <ArenaShell size="wide" header={chrome}>
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
      </ArenaShell>
    );
  }

  // Nothing to draw yet. The arena owns the placeholder so the shell, the skin
  // and the geometry are the same ones the match will land in.
  if (!m.publicRound || !combatants) {
    return (
      <CanonicalArena view={null} chrome={chrome}
        recovering={{ eyebrow: "Ranked Duel", message: "Recovering match…" }} />
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
    const terminal: ArenaTerminalView = {
      result: draw ? "draw" : won ? "victory" : "defeat",
      player: combatants.player,
      opponent: combatants.opponent,
      subheading: reason === "forfeit"
        ? (won ? "Opponent forfeited." : "You forfeited.")
        : reason === "no_contest" ? "No contest — both players left." : undefined,
      progressionEnabled,
      primaryAction: { label: "Back to Quiz", onClick: () => { window.location.assign("/quiz"); } },
      // PT1.3 rides the frame's EXISTING summary slot, so the outcome, the
      // combatant panels and any progression this match carried are all read
      // first and the reward follows them. Left undefined — and the frame
      // renders no summary block, and therefore no stray flex gap — whenever
      // there is nothing honest to say. The CTA goes to `/quiz#review`, which
      // opens REVIEW on OWNED already (PT1.2); there is no second collection
      // surface and no Library route.
      summary: discoveryRevealHasContent(discoveries.view)
        ? (<DiscoveryReveal view={discoveries.view}
            onReview={() => { window.location.assign("/quiz#review"); }} />)
        : undefined,
      reveal: m.lastResolved ? {
        settlement: m.lastResolved,
        viewerSlot: "p1",
        namesByPlayerId: revealNames(m.lastResolved),
        showAbilities: progressionEnabled,
      } : null,
    };
    return <CanonicalArena view={null} terminal={terminal} chrome={chrome} />;
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

  /** Ranked fills both flanks with a duelist. */
  const rail = (which: "player" | "opponent"): ArenaRail => {
    const c = combatants[which];
    return {
      kind: "combatant",
      combatant: c,
      damage: roundHistory[which],
      outcome: revealOutcomes[c.playerId] ?? null,
      damageDealt: revealDamage[c.playerId] ?? null,
      reaction: mascotReactions[c.playerId] ?? null,
    };
  };

  const view: ArenaViewModel = {
    header: {
      eyebrow: `Ranked Duel${m.publicRound.playtest?.isBotMatch ? " · vs Bot" : ""}`,
      title: roundLabel,
      transitionNote: inTransition ? "Preparing next round…" : null,
      playtestNote: m.publicRound.playtest?.isPlaceholder ? "Playtest · Placeholder" : null,
      presenceNote: opponentLabel,
      timer,
      timerLabel: "Shared round timer",
    },
    roundBeat: m.lastResolved ? { settlement: m.lastResolved, viewerSlot: "p1" } : null,
    segmentBeat: m.lastSegmentSettlement ? {
      settlement: m.lastSegmentSettlement,
      roundNumber: m.lastSegmentRoundNumber,
      viewerUserId,
      opponentUserId: m.opponentUserId,
    } : null,
    left: rail("player"),
    right: rail("opponent"),
    surface: {
      renderer,
      publicRound: surfaceRound!,
      segmentState: surfaceRound!.segmentState,
      selection: m.selectedOptionId,
      permissions,
      actions: segmentActions,
      skewMs: m.skewMs,
      reveal,
      // R3: selecting an option IS answering. The index comes from the
      // projected question so the arena never guesses it from the option id.
      onSelect: (sel) => {
        const option = question?.options.find((o) => o.id === sel);
        if (option) m.answer(option.id, option.index);
      },
      ownsSubmission: moduleOwnsSubmission,
      inputOpen,
      hasContent: question !== null || moduleOwnsSubmission,
    },
    progression: isProgression ? {
      options: (m.privatePlayer?.ownAbilities.level2Options ?? []).map((id) => ({
        id, name: abilityName(id), description: abilityDescription(id),
      })),
      pendingOptionId: pendingLevel2,
      busy: m.submitting,
      onSelectOption: (id) => {
        if (m.submitting || pendingLevel2 !== null) return;  // double-click safe
        setPendingLevel2(id);
        m.chooseLevelTwo(id);
      },
    } : null,
    abilityHud: showAbilityTray ? {
      abilities,
      selectedAbilityId: m.selectedAbilityId,
      permissions: abilityPermissions,
      onSelectAbility: m.selectAbility,
      noAbilityLabel: "Clear ability",
    } : null,
    status: {
      text: m.actionError ? m.actionError
        : m.submitting ? "Submitting…"
          : m.phase === "locked" ? "Answer locked — waiting for opponent…"
            : "Choose an answer to lock it in.",
      isError: m.actionError !== null,
    },
    // RG1 — the arena's quiet control. Ranked's is Forfeit Match: the ONE
    // intent signal Ranked has, since a route change, a closed tab, a reload
    // and a dead network are indistinguishable at the server. The arena places
    // it (end of the status row, or its own slim row on a module-owned round)
    // and never learns what it means.
    hudAction: (
      <ForfeitControl onForfeit={m.forfeit} disabled={m.submitting}
        className="shrink-0 pt-0.5" />
    ),
    timeline,
    revealHold: m.revealHold,
    progressionEnabled,
  };

  return <CanonicalArena view={view} chrome={chrome} />;
}
