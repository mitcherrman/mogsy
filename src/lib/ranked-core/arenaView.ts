// ---------------------------------------------------------------------------
// THE ARENA'S INPUT CONTRACT (ARENA1 Step 3).
//
// `CanonicalArena` is the production Ranked renderer, extracted. This is the
// shape it reads instead of reading the Ranked match controller directly.
//
// Every field here already existed as a local in `QuizRankedMatch` — this
// module names the groups and nothing else. It deliberately contains no
// transport, no matchmaking, no rating, no PvP settlement and no HTTP: a mode
// controller projects its own state into these shapes and the arena renders
// them. The arena cannot tell which mode produced them, which is the point.
//
// It is NOT a framework for five hypothetical modes. Every member below is
// consumed by the extracted JSX today; nothing is speculative.
// ---------------------------------------------------------------------------

import type { JourneyRailIdentity } from "@/lib/journey/rail";
import type { ReactNode } from "react";
import type { SurfaceReveal, SurfaceSettings } from "@/lib/question-surface/contract";
import type { ResolvedFeedback } from "@/lib/question-feedback/model";
import type { QuizFeedbackVerdict } from "@/components/quiz/QuizAnswerFeedback";
import type {
  PublicRoundView, SegmentSettlementView, SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleSegmentActions } from "./modules/types";
import type { ArenaCardBeat } from "./cardBeat";
import type { RankedPresentationPhase, RankedResultFeedback } from "./flow/rankedFlow";
import type { DuelEventView, DuelStanding } from "./duelState";
import type { ArenaReportIdentity } from "./reportSnapshot";
export type { ArenaReportIdentity };
import type { AwardEvent } from "@/components/ranked-arena/AwardPops";
// Re-exported so a component that renders one part of this view model has a
// single import home for its types, the way `ResultKind` is re-exported from
// `RoundResultBeat`.
export type { ArenaCardBeat };
import type { PointsFeedbackView } from "./pointsFeedback";
import type {
  AbilityView, CombatantView, InteractionPermissions,
  MascotReaction, PlayerSlot, ResolvedCombatantView, ResolvedRoundView,
  RoundHistoryEntry, RoundTimelineView, TimerView,
} from "./viewTypes";

/**
 * ONE FLANK OF THE ARENA — the seam every non-PvP mode needs.
 *
 * Ranked puts a duelist on both sides. That is a MODE's answer, not the
 * arena's: a solo mode has a target rather than an opponent, and a training
 * mode has a scripted counterpart. So a flank is a tagged surface, and
 * `combatant` is simply the answer Ranked gives on both sides today — it
 * renders the same `CombatantPanel` with the same props it always did.
 *
 * `panel` exists so a mode can occupy a flank with its own presentation
 * without the arena learning what a Daily Challenge or a practice bot is.
 * Nothing in the repo uses it yet; it is the one member here that anticipates
 * a caller, and it is a `ReactNode` slot rather than a component API precisely
 * so it can never grow into one.
 */
export type ArenaRail =
  | {
    kind: "combatant";
    combatant: CombatantView;
    /** Recent-round ledger under the HP bar. */
    damage: RoundHistoryEntry[];
    /** Settled verdict during the reveal beat, else null. */
    outcome: ResolvedCombatantView["outcome"] | null;
    /** Damage this side DEALT in the settlement being revealed, else null. */
    damageDealt: number | null;
    /**
     * RP1 — what the settled module AWARDED this side, and why, or null (an hp
     * match, or no settlement being revealed).
     *
     * Present WINS over `damageDealt` in the rail's verdict row: a points
     * match's damage figure is the engine's transport for that same award, so
     * showing both would be one number under two names, one of which is a
     * mechanic this match does not have.
     *
     * Step 4 widened this from a bare total to the base/bonus split, because
     * the split IS the thing the player has to learn — see `pointsFeedback`.
     */
    feedback?: PointsFeedbackView | null;
    /** Mascot reaction for the settled round, else null. */
    reaction: MascotReaction | null;
    /**
     * RM1 Pass 2 — HOW this flank is drawn. Absent is the card every caller
     * already has; Ranked asks for its duel banner.
     *
     * A mode's choice and not the arena's, for the same reason `meterLabel` is:
     * what a flank looks LIKE belongs to the mode that owns the flank, and an
     * arena that decided it would have to learn which mode it was rendering —
     * which is the branch this whole file exists to prevent. The arena relays
     * it and knows nothing about what either value means.
     */
    presentation?: "card" | "banner";
    /**
     * RM1 Pass 2B — this flank's transient payout, or absent/null.
     *
     * A settled EVENT and not a value: the id names the round, so the arena
     * can neither replay it on a re-render nor invent one. Every mode that
     * passes nothing draws no pops at all.
     */
    award?: AwardEvent | null;
    /**
     * RD1 — this flank's standing in a points duel, from `projectDuelState`,
     * or absent. Relayed to the score tally as a data attribute; the arena
     * never compares the two scores itself.
     */
    standing?: DuelStanding | null;
    /**
     * RD1 — the lead-change EVENT id that just put this flank ahead, or absent.
     * Reveal-beat only by construction (see `DuelLeadChange`).
     */
    leadPulseId?: string | null;
    /**
     * JOURNEY-UI1 — this flank's Journey champion, while a Journey module is
     * on screen. Absent everywhere else: the banner draws its role mascot and
     * the phone bar its crest exactly as before.
     */
    journey?: JourneyRailIdentity | null;
  }
  | { kind: "panel"; node: ReactNode };

/** The header strip: who/where/when, and the clock. */
export interface ArenaHeaderView {
  /** Small gold label above the title. Empty = not drawn (a hosted step). */
  eyebrow: string;
  /** "Round 3", "Preparing match…". */
  title: string;
  /** Shown beside the title while the next round is being opened. */
  transitionNote: string | null;
  /**
   * Two independent note slots above the clock. Their test ids
   * (`ranked-playtest-label`, `ranked-presence`) are historical and stable;
   * the slots themselves carry whatever short line a mode has for them.
   */
  playtestNote: string | null;
  presenceNote: string | null;
  timer: TimerView | null;
  timerLabel: string;
  /**
   * RM1 Pass 2B — THE HEADER'S FOCAL DISPLAY, beyond the clock.
   *
   * Both are optional, and a mode that supplies neither gets a header centre
   * that is only ever a timer — which is what the Daily Challenge and every
   * dev harness still get.
   *
   * `centralResult` is the VIEWER's settled result in two lines. It must be
   * projected from the REVEAL-GATED award so it is null outside the beat by
   * construction; an ungated one would decay into a stale result sitting over
   * a live question.
   *
   * `moduleTitle` names the round NOW IN PLAY, and `moduleEventId` is the
   * round it names — the face plays once per new id, which is what makes a
   * poll, a re-render or a reconnect unable to replay it. There is no way to
   * name the NEXT round before it opens: the backend publishes nothing about
   * an ungenerated question, which is the same fact that makes every future
   * node on the round rail neutral.
   */
  centralResult?: { verdict: string; points: string } | null;
  moduleTitle?: string | null;
  moduleEventId?: number | null;
  /**
   * RFX1 2B1 — the module title's remaining window, capped by the server's
   * `started_at` so no intro face survives into live answering. Undefined
   * keeps the nominal beat (the Daily arena, which has no such boundary).
   */
  moduleTitleWindowMs?: number;
  /**
   * ARENA1 Step 5 — OPTIONAL replacements for the clock's two prose lines.
   * Absent = Ranked's own wording, which is what every existing caller gets.
   *
   * `TimerDisplay` already took these (DC1 added them); the view model simply
   * did not carry them, so a mode reaching the clock THROUGH the arena could
   * not say anything but "of 0:06 shared round" and "waiting for the round to
   * resolve". Both are true of a duel and false of a solo run, and a mode
   * built on there being no opponent must not be made to claim one by the
   * frame it renders in.
   */
  /**
   * RD1 — factual end-of-match pressure beside `title`: `FINAL 3` / `FINAL`,
   * from the frozen match length and the module in play. Absent everywhere
   * else. Drawn on the title's own line, so it costs the strip no height.
   */
  titleSuffix?: string | null;
  /**
   * RD1 — the viewer's duel standing for the clock face's secondary line
   * (`LEADING +2` / `TIED` / `TRAILING 1`), or absent for any mode that is
   * not a live points duel.
   */
  standing?: { label: string; standing: DuelStanding } | null;
  /**
   * RD1 — the transient duel event for the settlement being revealed
   * (`YOU TAKE THE LEAD` …), shown on the result face under the verdict.
   * Reveal-gated by construction; absent for every other mode.
   */
  duelEvent?: DuelEventView | null;
  timerNotes?: {
    /** Replaces "of M:SS shared round". Receives the formatted duration. */
    duration?: (duration: string) => string;
    /** Replaces the expired line. */
    expired?: string;
  } | null;
}

/**
 * A settled multi-challenge block, for the header's result plate and the
 * transcript it discloses. The arena derives both from this — it does not
 * receive them pre-split, because they describe one settlement.
 */
export interface ArenaSegmentBeat {
  settlement: SegmentSettlementView;
  /**
   * RP1 — the viewer's award for the settled BLOCK, or absent/null on an hp
   * match. Same substitution as `roundBeat.feedback`, for the scoreline a
   * multi-challenge block prints instead ("YOU 5/5 · OPP 3/5 · …").
   */
  feedback?: PointsFeedbackView | null;
  /** POINT1 — see `roundBeat.pointsMatch`; the same guard, the same reason. */
  pointsMatch?: boolean;
  /** The round the block settled on, for the beat's remount key. */
  roundNumber: number | null;
  viewerUserId: string;
  opponentUserId: string | null;
}

/**
 * The centre column's segment viewport, and everything it is handed.
 *
 * `renderer` is resolved by the CANONICAL registry (`rendererForSegment`) in
 * the mode's adapter, so the arena never chooses a renderer and no mode can
 * introduce a second question path. A null renderer is the fail-closed state:
 * the arena shows a neutral "unsupported module" panel rather than guessing.
 */
export interface ArenaSurfaceView {
  renderer: ModuleRenderer | null;
  /**
   * The snapshot the SURFACE renders from — deliberately allowed to lag the
   * live one, so a settling round does not unmount the question subtree.
   */
  publicRound: PublicRoundView;
  segmentState: SegmentStateView | null;
  selection: unknown;
  permissions: InteractionPermissions;
  actions: ModuleSegmentActions;
  skewMs: number;
  /** RFX1 2B3 — the mode-entry presentation beat, in ms, or 0/absent. */
  entryPresentationMs?: number;
  /** Backend-authoritative, post-settlement only. Null pre-reveal, always. */
  reveal: SurfaceReveal | null;
  onSelect: (selection: unknown) => void;
  /** The module owns its own input and submission (no quiz HUD alongside). */
  ownsSubmission: boolean;
  /**
   * Is the viewer's selection window open? Surfaced as `data-input-open` on
   * the question section, which is how the reveal beat is observable from
   * outside without reading a component's state.
   */
  inputOpen: boolean;
  /** There is something for the viewport to draw. */
  hasContent: boolean;
  /**
   * RG3 — the resolved-feedback model for a mode whose card can be JUDGED
   * WITHOUT BEING DISCLOSED, or absent (Ranked, the Tutorial).
   *
   * This is the last link of the chain Step 2B started: per-option elimination
   * reached the canonical `AnswerGrid` so a retry-until-correct mode would not
   * need a second answer renderer, but nothing could reach it THROUGH the
   * arena, and the Daily wrote its own grid instead.
   *
   * Step 5 opened this seam as a bare `eliminatedOptionIds` relay; RG3 landed
   * on `main` first with the better answer, and this follows it. The struck
   * set, the verdict, the score lock and the disclosure gate are four facts
   * about one card and travel together, so no surface can be told the card is
   * open by one prop and closed by another.
   *
   * It discloses nothing on its own: `disclosureAllowed` is the backend's
   * `resolved`, never its `score_locked`.
   */
  feedback?: ResolvedFeedback | null;
  /**
   * ARENA1 Step 5 — the MODE'S WORD for the resolution, or absent (Ranked,
   * the Tutorial). Presentation copy; it discloses nothing.
   */
  surfaceVerdict?: QuizFeedbackVerdict | null;
  /**
   * ARENA1 Step 5 — per-field overrides of the surface variant's defaults, or
   * absent (Ranked, the Tutorial: both take the variant as it comes).
   *
   * `InteractiveScenarioSurface` has always accepted these; the arena had no
   * way to pass them. The Daily needs exactly one — `showExplanation` — because
   * the explanation IS the thing its retry loop exists to deliver, and the
   * competitive variant suppresses it. Handing the surface its own documented
   * override is the alternative to a second question renderer that shows one.
   */
  surfaceSettings?: Partial<SurfaceSettings>;
}

/** The optional ability hotbar under the question. */
export interface ArenaAbilityHud {
  abilities: AbilityView[];
  selectedAbilityId: string | null;
  permissions: InteractionPermissions;
  onSelectAbility: (abilityId: string | null) => void;
  noAbilityLabel: string;
}

/** The single reserved status line under the HUD row. */
export interface ArenaStatusLine {
  text: string;
  isError: boolean;
}

/** Everything the live arena renders. */
export interface ArenaViewModel {
  /**
   * FB1-4 — who this mode is, so the arena's round can be reported.
   *
   * The arena is mode-neutral and must stay that way, so it does not infer
   * "Ranked" from anything: the mode names itself here and the arena publishes
   * a snapshot of the round it is already rendering. Absent or null means the
   * mode has not opted in, and no report control appears — which is the right
   * default for a preview, a dev harness or a scripted tutorial, where there
   * is no live question to report.
   */
  report?: ArenaReportIdentity | null;
  header: ArenaHeaderView;
  /**
   * THE HEADER'S ONE RESULT PLATE, in precedence order. Exactly one of these
   * is ever drawn, because the strip has ONE result slot and two plates would
   * be two answers to one question:
   *
   *   1. `segmentBeat` — a settled multi-challenge block. It describes the
   *      same round as `roundBeat` and says strictly more (a 5-card
   *      scoreline), and it exists only once every card of its block has
   *      resolved, so it also supersedes that block's last card.
   *   2. `cardBeat`    — one card of a block that is still running. The block
   *      it belongs to has no settlement yet, by construction.
   *   3. `roundBeat`   — an ordinary settled round.
   *
   * POINT1 — `cardBeat` is why a module must not draw a result plate of its
   * own inside its viewport. A per-card CORRECT/INCORRECT strip down there
   * plus this plate up here is two textual result surfaces for one card.
   */
  roundBeat: {
    settlement: ResolvedRoundView;
    viewerSlot: PlayerSlot;
    /**
     * RP1 — the viewer's award for the settled module, or absent/null on an hp
     * match. It replaces the plate's damage consequence line, which is the one
     * place a settled Ranked round still shouted a damage number.
     */
    feedback?: PointsFeedbackView | null;
    /**
     * POINT1 — this match scores in POINTS, so the plate's damage clauses are
     * not merely unused here, they are wrong.
     *
     * `feedback` alone was not enough to keep them off screen. It is projected
     * per settlement, and a settlement that published no `module_points` — an
     * older row, a module the engine banked nothing for — left the plate to
     * fall through to "2 DEALT · 3 TAKEN" on a match that has no damage
     * mechanic. This is the mode's own answer, so the fallback is unreachable
     * rather than merely unlikely.
     */
    pointsMatch?: boolean;
  } | null;
  segmentBeat: ArenaSegmentBeat | null;
  /**
   * POINT1 — the per-card result for a multi-challenge block in flight, or
   * null. Points-native by construction: see `CardResultBeat`.
   */
  cardBeat: ArenaCardBeat | null;
  left: ArenaRail;
  right: ArenaRail;
  surface: ArenaSurfaceView;
  abilityHud: ArenaAbilityHud | null;
  status: ArenaStatusLine | null;
  /**
   * RG1 — a quiet control at the FAR END of the status row, or null.
   *
   * Ranked puts Forfeit Match here. The row is already mounted for the whole
   * match with a reserved height, so the arena's quietest control costs the
   * stage no pixels and cannot move an anchor — and it sits as far from the
   * answer grid as the layout allows.
   *
   * A `ReactNode` and not a `{ label, onClick }`: what a mode wants to say
   * here is a mode's own sentence (Ranked concedes a match; a solo run has
   * nothing to concede TO), and the arena must not learn the vocabulary of
   * any one of them. Null renders nothing at all — not an empty box.
   *
   * It also appears on its own slim row when the module owns its submission,
   * because that is exactly when the status row is not drawn. See
   * `CanonicalArena`.
   */
  hudAction: ReactNode | null;
  timeline: RoundTimelineView | null;
  /**
   * The settlement beat is running: the arena dims the question and withholds
   * interaction. Presentation only — the mode has already opened the next
   * round and its clock is already running.
   */
  revealHold: boolean;
  /** Does this match have a level/XP layer at all? */
  progressionEnabled: boolean;
  /**
   * RFX1 — the result cues for the PRESENTED round (viewer, and the opponent's
   * staggered beat over the same settlement). Absent for a mode that has none,
   * and then the arena draws no result overlay.
   */
  resultFeedback?: RankedResultFeedback | null;
  /** RFX1 — where the presentation is (derived; see `flow/rankedFlow`). */
  presentationPhase?: RankedPresentationPhase;
  /**
   * RFX1 2B3 — the MEDIUM beat playing over this arena, or absent. Published
   * as `data-special-transition`; nothing is drawn from it here.
   */
  specialTransition?: "final-round" | "meta-reflex-entry" | null;
  /**
   * RFX1 Phase 2B seam — the authoritative next round the server has opened
   * but the arena is not presenting yet. Unused by the arena in Phase 2A.
   */
  upcomingRound?: PublicRoundView | null;
  /**
   * RFX1 Phase 2B1 — round 1's entry stage (`projectEntryPhase`): `ready`
   * while the first question is prepared and on screen before its server
   * `started_at`, `live` once it is answerable. The arena renders nothing
   * from it yet; Phase 2B2's entry intro is built on it.
   */
  entryPhase?: "match-unresolved" | "preparing" | "ready" | "live";
}

/** The terminal frame, when the match is over. */
export interface ArenaTerminalView {
  result: "victory" | "defeat" | "draw";
  player: CombatantView;
  /**
   * The other duelist, or ABSENT for a mode that has none (ARENA1 Step 5).
   *
   * Ranked and the Tutorial both fill it and their frame is unchanged. A solo
   * mode passing a placeholder here would put a second combatant column on the
   * end screen of a game with one player, which is the fake opponent the whole
   * mode is built to avoid — so the frame renders one column instead.
   */
  opponent?: CombatantView | null;
  /** Overrides the frame's own "Match Complete" eyebrow. */
  eyebrow?: string;
  /** Overrides the frame's own "Victory / Defeat / Draw" headline. */
  heading?: string;
  subheading?: string;
  /**
   * RP1 Step 4 — THE HEADLINE SCORELINE, directly under the result word, or
   * absent (every mode that does not score a match).
   *
   * A slot and not a `{you, them}` API, for the same reason the summary below
   * is one: what a mode puts between its result and its duelists is the mode's
   * sentence, and the frame must not learn Ranked's. Ranked fills it with its
   * points scoreline; the Tutorial and the Daily fill nothing and their frame
   * is byte-identical.
   */
  scoreline?: ReactNode;
  /**
   * WHO PLAYED, in the mode's own composition — or absent, and the frame draws
   * its two full duelist columns exactly as it always has.
   *
   * Ranked fills it with a compact identity strip so the modules, discoveries
   * and actions below it are on screen without a scroll. Every other mode
   * passes nothing and its terminal frame is byte-identical.
   */
  identity?: ReactNode;
  /** RE1 — the frame's header density; see `MatchOverFrame`. Absent = default. */
  density?: "default" | "compact";
  /**
   * Extra content INSIDE the frame, under the two duelists.
   *
   * `MatchOverFrame` has always had this slot; the view model simply did not
   * expose it. Three modes now fill it and each fills it with its own answer:
   * the tutorial's match-over summary and its "nothing here was recorded"
   * statement, Ranked's PT1.3 reveal of the questions the match added to the
   * player's collection, and (later) a solo run's score.
   *
   * Left undefined the frame renders no summary block, and therefore no stray
   * flex gap — the honest rendering of "there is nothing to add".
   */
  summary?: ReactNode;
  progressionEnabled: boolean;
  /**
   * The frame's own primary button, or ABSENT when the mode renders its own
   * action row inside `summary`.
   *
   * Ranked does the latter: `ResultActions` states the product's three-weight
   * ordering (Play Again / Review Match / Back to Leaguecraft) and every mode
   * gets the same one, so a second full-width primary drawn by the frame
   * directly beneath it would be one question with two answers. Every other
   * caller passes this and its frame is unchanged.
   */
  primaryAction?: { label: string; onClick: () => void };
  /**
   * The quieter second action, or absent.
   *
   * `MatchOverFrame` has rendered a secondary button since it was written; the
   * view model simply never exposed it, so every mode's end screen was a
   * single button and a mode with two things to offer had to pick one. Ranked
   * is that mode — playing again and leaving are both ordinary next steps
   * after a duel, and making the player navigate for one of them is what a
   * dead end IS.
   *
   * Left undefined the frame renders one button, exactly as before.
   */
  secondaryAction?: { label: string; onClick: () => void };
  /** The final settlement, rendered in full below the frame. */
  reveal: {
    settlement: ResolvedRoundView;
    viewerSlot: PlayerSlot;
    namesByPlayerId: Record<string, string>;
    showAbilities: boolean;
  } | null;
}
