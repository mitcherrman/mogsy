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

import type { ReactNode } from "react";
import type { SurfaceReveal, SurfaceSettings } from "@/lib/question-surface/contract";
import type { ResolvedFeedback } from "@/lib/question-feedback/model";
import type { QuizFeedbackVerdict } from "@/components/quiz/QuizAnswerFeedback";
import type {
  PublicRoundView, SegmentSettlementView, SegmentStateView,
} from "@/lib/ranked-public/contracts";
import type { ModuleRenderer, ModuleSegmentActions } from "./modules/types";
import type {
  AbilityView, CombatantView, InteractionPermissions, LevelUpOptionView,
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
 * without the arena learning what a Daily Challenge or a Training Golem is.
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
    /** Mascot reaction for the settled round, else null. */
    reaction: MascotReaction | null;
  }
  | { kind: "panel"; node: ReactNode };

/** The header strip: who/where/when, and the clock. */
export interface ArenaHeaderView {
  /** Small gold label above the title. */
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

/** The level-progression choice, overlaid on the question. */
export interface ArenaProgressionView {
  options: LevelUpOptionView[];
  /** The choice in flight; the server's acceptance ends the phase. */
  pendingOptionId: string | null;
  busy: boolean;
  onSelectOption: (optionId: string) => void;
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
  header: ArenaHeaderView;
  /**
   * The header's result plate. A settled block WINS the slot when both are
   * present: it describes the same round and says strictly more.
   */
  roundBeat: { settlement: ResolvedRoundView; viewerSlot: PlayerSlot } | null;
  segmentBeat: ArenaSegmentBeat | null;
  left: ArenaRail;
  right: ArenaRail;
  surface: ArenaSurfaceView;
  progression: ArenaProgressionView | null;
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
  primaryAction: { label: string; onClick: () => void };
  /** The final settlement, rendered in full below the frame. */
  reveal: {
    settlement: ResolvedRoundView;
    viewerSlot: PlayerSlot;
    namesByPlayerId: Record<string, string>;
    showAbilities: boolean;
  } | null;
}
