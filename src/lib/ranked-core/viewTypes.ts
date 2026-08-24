// ---------------------------------------------------------------------------
// Neutral Ranked view contracts (F1 canonical arena, Phase A).
//
// These types are DISPLAY DATA ONLY. They carry values the backend (or a
// mode controller, e.g. the tutorial director) already resolved; nothing in
// this module computes damage, correctness, XP, levels, charges, or timer
// pressure. They deliberately contain no transport, tutorial, or staff-tool
// concepts, so live Ranked, the Ranked tutorial, and a future Daily Boss can
// all render through them.
//
// Hidden-information rule: pre-reveal types never carry opponent answer or
// ability CONTENT — only neutral status flags. Revealed facts exist solely on
// the resolved-round type (the existing AdaptedSettlement, re-exported below
// as ResolvedRoundView).
// ---------------------------------------------------------------------------

import type {
  AdaptedSettlement,
  AdaptedPlayerSettlement,
} from "./backend/adaptBackendSettlement";
import type { RankedRole } from "@/lib/ranked-public/roles";
// RG2's node subject. A type-only import of a shared PRESENTATION model — the
// boundary this layer enforces is against a mode's `pages/` directory, and
// `components/quiz/timeline` is neither Ranked's nor the Daily's.
import type { TimelineTopic } from "@/components/quiz/timeline/timelineNodeModel";

/**
 * Frontend-stable settlement slot: p1 = the viewer/owner, p2 = the other
 * player. Slots are an explicit id mapping, never array position.
 */
export type PlayerSlot = "p1" | "p2";

/** Which side of the arena a combatant renders on. Never a mode flag. */
export type CombatantSide = "player" | "opponent";

/** Neutral, pre-reveal ability window status (mirrors the public projection). */
export type AbilityWindowStatus = "open" | "locked" | null;

export interface CombatantView {
  /** Stable backend player id — identity is NEVER array position. */
  playerId: string;
  /** Display name; controllers supply it (backend sends ids only). */
  name: string;
  /** Optional short descriptor line (class title, "Training Golem", …). */
  tag?: string;
  /**
   * R1 League role id (`top` | `jungle` | `mid` | `adc` | `support`) when the
   * match froze one; absent/null otherwise. Presentation only — it selects the
   * role crest and the role label, and is NEVER derived from `classId` (nor
   * `classId` from it). A view with no role renders the neutral role identity
   * on a role match, and the legacy class identity on a pre-R1 match — see
   * `identityMode`, which is what decides between those two.
   */
  roleId?: string | null;
  /**
   * WHICH IDENTITY VOCABULARY THIS MATCH USES — a match-level fact, and
   * therefore identical on both combatants of one match.
   *
   * `"role"` — the match froze League roles. The role slot is authoritative: a
   * participant WITH a role shows their role, and a participant WITHOUT one (a
   * bot, a staff-created seat) shows the NEUTRAL role treatment in the same
   * slot at the same size. `classId` never reaches presentation.
   *
   * `"legacy_class"` (or absent) — a genuine pre-R1 match, which has no roles
   * at all and whose only identity is the legacy combat class. The original
   * class portrait and class tag are unchanged there.
   *
   * This field exists because "this PARTICIPANT has no role" and "this MATCH
   * has no roles" are different facts, and the panel used to conflate them: a
   * bot with a legitimate `role: null` fell into the legacy branch and
   * advertised its combat class ("TANK") as though it were a League role,
   * while its human opponent showed a full role mascot. Deciding the
   * vocabulary once per MATCH is what keeps the two columns the same shape.
   *
   * Absent defaults to `"legacy_class"`, so every caller that predates this
   * field renders byte-identically.
   */
  identityMode?: "role" | "legacy_class";
  side: CombatantSide;
  classId: string;
  hp: number;
  /**
   * Max HP if the controller knows it (e.g. from the match-creation
   * starting_hp). null = unknown: the backend public projection does not
   * carry max HP, and the view layer must NOT invent one. Components render
   * an absolute HP number without a proportional meter in that case.
   */
  maxHp: number | null;
  /**
   * ARENA1 Step 5 — WHAT THE PRIMARY METER IS CALLED. Absent = "HP", which is
   * every existing caller, so the panel is byte-identical for them.
   *
   * The meter itself — its geometry, its thresholds, its colours, its
   * accessible role — is the arena's and does not vary. What varies is the
   * NOUN, and a solo mode has a real one: the Daily's `hp`/`maxHp` carry the
   * run's score against the day's frozen maximum, which is the quantity that
   * fills the same bar and reads the same way. Labelling that "HP" would be
   * the arena telling the player they have health in a mode with no combat,
   * and the fix for a wrong word is the right word — not a second meter.
   *
   * It is a label and nothing more. Nothing branches on it, and a mode cannot
   * change what the meter DOES by naming it.
   */
  meterLabel?: string | null;
  xp: number;
  level: number;
  /**
   * XP needed for the next level, supplied by the controller from
   * backend-derived data; null = unknown or already at max level. The view
   * layer never owns threshold tables.
   */
  nextLevelThreshold: number | null;
  /** Previous level's threshold (progress-bar floor); null when unknown. */
  currentLevelThreshold: number | null;
  // --- neutral round status (safe pre-reveal; never content) ---
  hasSubmitted: boolean;
  abilityWindow: AbilityWindowStatus;
  /** Whether an ability is armed — never WHICH ability. Null = unknown. */
  hasAbilitySelected: boolean | null;
}

export interface AbilityView {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  /** Live charge count from the backend; null = not tracked / unknown. */
  remainingCharges: number | null;
  /** Currently armed in the viewer's own submission. */
  selected: boolean;
  /** The selection window is locked — no further arming possible. */
  locked: boolean;
  /** Unlocked but out of charges. */
  exhausted: boolean;
  /** Human-readable reason when the ability cannot currently be armed. */
  unavailableReason?: string;
}

/**
 * Canonical League entity an answer option NAMES (RA6).
 *
 * Backend-resolved and question-safe: it describes the option's own visible
 * text, never the answer. The backend emits media for ALL options of a question
 * or for none, so its presence on one option says nothing about that option.
 *
 * `icon` is a backend-relative path (`assets/…`) or a backend route
 * (`api/ranked/media/…`) — never an absolute URL — and is resolved against the
 * API origin by `resolveQuizAssetUrl`, exactly like every other League asset.
 */
export interface OptionMediaView {
  /** Canonical entity type: item | champion | ability | rune | summoner_spell. */
  type: string;
  /** Canonical entity name. Display still uses `label`; this is for tests/debug. */
  name: string;
  icon: string;
  /** Canonical id where the entity has one (numeric for items/runes/spells). */
  id?: string | number;
}

export interface AnswerOptionView {
  /** Stable option id within the question (stringified backend index). */
  id: string;
  /** Backend submission index for this option. */
  index: number;
  label: string;
  /**
   * Optional canonical media for THIS option. Absent on every question whose
   * options are quantities or free text, and on every round frozen before RA6.
   */
  media?: OptionMediaView | null;
}

export interface QuestionView {
  questionId: string;
  prompt: string;
  options: AnswerOptionView[];
  category: string | null;
}

export type SubmissionPhase = "selecting" | "reviewing" | "locked";

/** The viewer's OWN in-progress submission (select → review → lock). */
export interface SubmissionView {
  selectedOptionId: string | null;
  /** null = deliberate no-ability submission (a valid choice). */
  selectedAbilityId: string | null;
  phase: SubmissionPhase;
}

export interface TimerView {
  /** Shared round duration as announced by the backend. */
  durationSeconds: number;
  /** Display countdown value; controllers derive it (see timerMath). */
  remainingSeconds: number;
  /** Externally controlled pause (tutorial director); live play never pauses. */
  paused: boolean;
  /** Display-urgency flag decided by the controller. */
  urgent: boolean;
  /** Short notices about timer modifiers ("-5s pressure", "+5s Fortify"). */
  modifierNotices?: string[];
}

/**
 * Externally supplied interaction gating. Live controllers derive these from
 * backend state; the tutorial director scripts them. Low-level components
 * consume ONLY these — no isTutorial/isDailyBoss/isTimeTrial branches.
 */
export interface InteractionPermissions {
  canSelectAnswer: boolean;
  canChangeAnswer: boolean;
  canSelectAbility: boolean;
  canReviewSubmission: boolean;
  canConfirmSubmission: boolean;
  canAdvance: boolean;
  /** Optional per-control explanations, keyed by control name. */
  disabledReasons?: Record<string, string>;
}

/** A level-progression ability option (Level 2 choice / Level 3 unlock). */
export interface LevelUpOptionView {
  id: string;
  name: string;
  description: string;
}

/** Everything locked — safe default while loading or between rounds. */
export const NO_INTERACTIONS: InteractionPermissions = Object.freeze({
  canSelectAnswer: false,
  canChangeAnswer: false,
  canSelectAbility: false,
  canReviewSubmission: false,
  canConfirmSubmission: false,
  canAdvance: false,
});

/**
 * The canonical resolved-round contract is the existing settlement adapter
 * output — already backend-authoritative, identity-mapped, and reveal-only.
 * Re-exported (not duplicated) so arena consumers depend on ranked-core.
 */
export type ResolvedRoundView = AdaptedSettlement;
export type ResolvedCombatantView = AdaptedPlayerSettlement;

// ---------------------------------------------------------------------------
// ARENA1 Step 2A — SETTLED-ROUND PRESENTATION TYPES.
//
// These five groups were declared in `src/pages/quiz-ranked/` and imported
// UPWARD by `components/ranked-arena/CombatantPanel` and `RoundTimeline`, so
// the shared arena layer depended on the Ranked page layer. They are pure
// display shapes over `ResolvedCombatantView` — nothing about them is
// Ranked-page-specific — so they live here with the rest of the neutral view
// contracts, and every previous declaration site now re-exports them.
//
// This is a TYPE MOVE ONLY. No projection function moved, no runtime value
// moved, and every field is byte-identical to the declaration it replaces.
// ---------------------------------------------------------------------------

/**
 * The four presentation tones a settled round resolves into, from the
 * VIEWER's point of view.
 *
 * "Both incorrect" and "Both timed out" deliberately do NOT get their own
 * tone — they are still the viewer being wrong or out of time. Only the shared
 * SUCCESS needed distinguishing, because that is the one a single tone would
 * have mis-sold as a win.
 *
 * Declared here rather than in `RoundResultBeat` because the timeline node
 * type below needs it, and a view type in `lib/` must never reach into
 * `components/`. `RoundResultBeat` re-exports it, so every existing
 * `from "./RoundResultBeat"` import is unchanged.
 */
export type ResultKind = "correct" | "both-correct" | "incorrect" | "timed-out";

/**
 * One row of a duelist's recent-round ledger: what happened to THAT player in
 * one settled round.
 *
 * Every field is read straight off the authoritative settlement. Nothing is
 * derived arithmetically — in particular `taken` is the backend's
 * `finalDamageReceived`, never `hpBefore - hpAfter`, because the two can
 * legitimately differ (a floor, a heal, a clamp) and the settlement is the
 * authority on which one is the damage.
 */
export interface RoundHistoryEntry {
  /** Stable key: a round is settled once, so the round number identifies it. */
  roundNumber: number;
  /** This player's verdict in that round. */
  outcome: ResolvedCombatantView["outcome"];
  /** Damage this player DEALT. 0 = none. */
  dealt: number;
  /** Damage this player TOOK. 0 = none. */
  taken: number;
  /** Damage a shield absorbed for this player. 0 = none. */
  absorbed: number;
  /** Authoritative HP either side of the round, for the accessible description. */
  hpBefore: number;
  hpAfter: number;
  /** The round ended on the clock rather than on both answers. */
  timeExpired: boolean;
}

/** One mascot reaction: what to play, and the id that makes it retriggerable. */
export interface MascotReaction {
  action: "attack" | "hit";
  /** The settled round this reaction belongs to. A round settles exactly once,
   *  so the round number is a stable, monotonic event id — which is precisely
   *  what `RoleMascot`'s edge-triggered playback needs. */
  actionId: number;
}

/**
 * A round's segment identity, as stated by the SERVER.
 *
 * Two values, because two are all the public contract distinguishes: a Meta
 * Reflex block (`item_cost_duel` at the mixed-card version or later) and an
 * ordinary round. There is deliberately no difficulty here — no public field
 * carries one.
 */
export type TimelineSegmentKind = "meta-reflex" | "standard";

export type TimelineNodeState = "resolved" | "current" | "upcoming";

/**
 * RESERVED — a future per-question tag on a node.
 *
 * No public Ranked field carries one today: `players[].role` is the
 * PARTICIPANT's frozen League role (R1), not a property of the question, and
 * the question block publishes no role, difficulty or family. So
 * `projectRoundTimeline` returns `null` here for every node, always, and the
 * only thing this type does is fix the shape a later phase fills once the
 * backend publishes an authoritative tag. It is NOT a place to smuggle
 * `metadata_json`, to read a category string as a role, or to guess.
 */
export type TimelineNodeTag = { kind: "role"; role: RankedRole };

export interface TimelineNode {
  roundNumber: number;
  /**
   * Slot offset from `windowStart`.
   *
   * `-1` and `TIMELINE_VISIBLE_NODES` are the OFF-EDGE BUFFER: nodes that are
   * mounted but clipped, so a round leaving on the left and one arriving on
   * the right both travel rather than popping in and out of existence.
   */
  index: number;
  /** False for the two buffer slots. */
  visible: boolean;
  state: TimelineNodeState;
  /**
   * What the server said this round's segment is, or null when this client has
   * never been told. Null is the ordinary state for a future round and for a
   * past round played before this client connected — it is "not observed",
   * never "an ordinary round".
   */
  segmentKind: TimelineSegmentKind | null;
  /**
   * The viewer's settled verdict, in the arena's existing vocabulary, or null.
   *
   * Null on an unresolved round AND on a resolved round whose settlement has
   * aged out of the bounded ledger — a real and ordinary state, not an error.
   * Such a node stays resolved and simply carries no verdict.
   */
  outcome: ResultKind | null;
  /** Always null today. See `TimelineNodeTag`. */
  tag: TimelineNodeTag | null;
  /**
   * RG2 — what the round is ABOUT: public subject, difficulty tier, proven
   * icon. `null` when this client has never been told, which is the ordinary
   * state for a FUTURE round and for a past round played before this client
   * connected.
   *
   * A topic is only ever something the SERVER published for a specific round
   * (`question.topic` on the live snapshot), accumulated as the match plays.
   * Nothing is derived from an ordinal, from the pacing wave, or from a
   * neighbouring round. A Ranked future round's question has not been
   * generated, so there is nothing to publish and this stays null — and the
   * node draws the neutral token.
   */
  topic: TimelineTopic | null;
}

export interface RoundTimelineView {
  /** Constant for the whole match. Never varies round to round. */
  visibleNodes: number;
  /** The slot the current round occupies once the opening rounds are past. */
  anchorIndex: number;
  /** The round at slot 0. */
  windowStart: number;
  /** Slot of the current round, or null once the match is over. */
  currentIndex: number | null;
  currentRoundNumber: number | null;
  /** True once the current round has reached `anchorIndex` and stays there. */
  anchored: boolean;
  /** Ascending, INCLUDING the off-edge buffer. See `TimelineNode.index`. */
  nodes: TimelineNode[];
}
